import 'server-only'
import { chunkText } from '@edvora/core/ai'
import type { PayloadRequest } from 'payload'
import { writeAudit } from '../../hooks/audit'
import { deleteChunks, insertChunks, poolOf } from './chunks'
import { embedTexts } from './embed'
import { parseDocument } from './parse'
import { loadAiConfig } from './settings'

/**
 * Knowledge base writes (ADR 018 §Learning): documents and memory notes. Callers have checked `ai.manage` (or, for
 * proposing memory, `ai.use`) in `tenantId`. Every row is tenant-pinned and audited.
 */
export async function ingestDocument(req: PayloadRequest, tenantId: number, file: { name: string; type: string; bytes: Uint8Array }, title?: string | null): Promise<{ ok: true; id: number; chunks: number } | { ok: false; error: string; id?: number }> {
  const payload = req.payload
  const doc = await payload.create({
    collection: 'ai-documents',
    overrideAccess: true,
    req,
    data: { tenant: tenantId, title: (title?.trim() || file.name).slice(0, 200), filename: file.name.slice(0, 200), mimeType: file.type || null, size: file.bytes.byteLength, status: 'processing', uploadedBy: Number(req.user!.id) },
  })
  const fail = async (error: string) => {
    await payload.update({ collection: 'ai-documents', id: doc.id, overrideAccess: true, req, data: { status: 'failed', error } })
    return { ok: false as const, error, id: doc.id }
  }
  const parsed = await parseDocument(file.name, file.bytes)
  if (!parsed.ok) return fail(parsed.error)
  const chunks = chunkText(parsed.text, { max: 600 })
  const cfg = await loadAiConfig(payload, tenantId)
  const emb = await embedTexts(payload, cfg, chunks.map((c) => `${doc.title}\n${c.content}`))
  if (emb.vectors.length !== chunks.length) return fail('ساختن نمایهٔ جست‌وجو ناموفق بود؛ اتصال ارائه‌دهنده را در تنظیمات آزمایش کنید.')
  try {
    await insertChunks(
      payload,
      chunks.map((c, i) => ({ tenantId, sourceType: 'document', sourceId: doc.id, title: doc.title, ordinal: c.ordinal, content: c.content, model: emb.model, embedding: emb.vectors[i]! })),
    )
  } catch (err) {
    payload.logger.error({ err, msg: 'ai: storing chunks failed' })
    return fail('ذخیرهٔ نمایه ناموفق بود.')
  }
  await payload.update({ collection: 'ai-documents', id: doc.id, overrideAccess: true, req, data: { status: 'ready', error: null, chunkCount: chunks.length, characters: parsed.text.length, embeddingModel: emb.model } })
  await writeAudit(req, { tenants: [tenantId], action: 'ai.document.uploaded', collection: 'ai-documents', docId: doc.id, note: `${file.name} · ${chunks.length} chunks` })
  return { ok: true, id: doc.id, chunks: chunks.length }
}

export async function removeDocument(req: PayloadRequest, tenantId: number, id: number): Promise<boolean> {
  const found = await req.payload.find({ collection: 'ai-documents', where: { and: [{ id: { equals: id } }, { tenant: { equals: tenantId } }] }, limit: 1, depth: 0, overrideAccess: true })
  const doc = found.docs[0]
  if (!doc) return false
  await deleteChunks(req.payload, tenantId, 'document', id)
  await req.payload.delete({ collection: 'ai-documents', id, overrideAccess: true, req })
  await writeAudit(req, { tenants: [tenantId], action: 'ai.document.deleted', collection: 'ai-documents', docId: id, note: doc.filename })
  return true
}

/** Approve (optionally with edited text), reject, or delete a memory note. Approved notes are embedded as sources. */
export async function decideMemory(req: PayloadRequest, tenantId: number, id: number, decision: 'approve' | 'reject' | 'delete', text?: string | null): Promise<boolean> {
  const payload = req.payload
  const found = await payload.find({ collection: 'ai-memories', where: { and: [{ id: { equals: id } }, { tenant: { equals: tenantId } }] }, limit: 1, depth: 0, overrideAccess: true })
  const memory = found.docs[0]
  if (!memory) return false
  await deleteChunks(payload, tenantId, 'memory', id)
  if (decision === 'delete') {
    await payload.delete({ collection: 'ai-memories', id, overrideAccess: true, req })
    await writeAudit(req, { tenants: [tenantId], action: 'ai.memory.deleted', collection: 'ai-memories', docId: id, note: memory.text.slice(0, 300) })
    return true
  }
  const finalText = (text?.trim() || memory.text).slice(0, 800)
  await payload.update({
    collection: 'ai-memories',
    id,
    overrideAccess: true,
    req,
    data: { text: finalText, status: decision === 'approve' ? 'approved' : 'rejected', decidedBy: Number(req.user!.id), decidedAt: new Date().toISOString() },
  })
  if (decision === 'approve') {
    const cfg = await loadAiConfig(payload, tenantId)
    const emb = await embedTexts(payload, cfg, [finalText])
    if (emb.vectors[0]) await insertChunks(payload, [{ tenantId, sourceType: 'memory', sourceId: id, title: 'یادداشت حافظه', ordinal: 0, content: finalText, model: emb.model, embedding: emb.vectors[0] }])
  }
  await writeAudit(req, {
    tenants: [tenantId],
    action: `ai.memory.${decision === 'approve' ? 'approved' : 'rejected'}`,
    collection: 'ai-memories',
    docId: id,
    changes: finalText !== memory.text ? { text: { from: memory.text, to: finalText } } : undefined,
  })
  return true
}

/** A memory note typed directly by a manager (approved at once). */
export async function addMemory(req: PayloadRequest, tenantId: number, text: string): Promise<number> {
  const memory = await req.payload.create({ collection: 'ai-memories', overrideAccess: true, req, data: { tenant: tenantId, text: text.trim().slice(0, 800), status: 'proposed', proposedBy: Number(req.user!.id) } })
  await decideMemory(req, tenantId, memory.id, 'approve')
  return memory.id
}

/** Re-embeds every document and approved memory note with the current embedding model (after a provider change). */
export async function reindexAll(req: PayloadRequest, tenantId: number): Promise<{ documents: number; failed: number }> {
  const payload = req.payload
  const cfg = await loadAiConfig(payload, tenantId)
  const memories = await payload.find({ collection: 'ai-memories', where: { and: [{ tenant: { equals: tenantId } }, { status: { equals: 'approved' } }] }, limit: 500, depth: 0, overrideAccess: true })
  for (const m of memories.docs) {
    const emb = await embedTexts(payload, cfg, [m.text])
    if (!emb.vectors[0]) continue
    await deleteChunks(payload, tenantId, 'memory', m.id)
    await insertChunks(payload, [{ tenantId, sourceType: 'memory', sourceId: m.id, title: 'یادداشت حافظه', ordinal: 0, content: m.text, model: emb.model, embedding: emb.vectors[0] }])
  }
  // Documents: the chunk text is kept, so re-embedding needs no original file.
  const pool = poolOf(payload)
  const docs = await payload.find({ collection: 'ai-documents', where: { and: [{ tenant: { equals: tenantId } }, { status: { equals: 'ready' } }] }, limit: 500, depth: 0, overrideAccess: true })
  let failed = 0
  for (const d of docs.docs) {
    const rows = await pool.query<{ ordinal: number; content: string }>(`SELECT DISTINCT ON (ordinal) ordinal, content FROM ai_chunks WHERE tenant_id = $1 AND source_type = 'document' AND source_id = $2 ORDER BY ordinal`, [tenantId, d.id])
    const emb = await embedTexts(payload, cfg, rows.rows.map((r) => `${d.title}\n${r.content}`))
    if (emb.vectors.length !== rows.rows.length) {
      failed++
      continue
    }
    await deleteChunks(payload, tenantId, 'document', d.id)
    await insertChunks(payload, rows.rows.map((r, i) => ({ tenantId, sourceType: 'document', sourceId: d.id, title: d.title, ordinal: r.ordinal, content: r.content, model: emb.model, embedding: emb.vectors[i]! })))
    await payload.update({ collection: 'ai-documents', id: d.id, overrideAccess: true, req, data: { embeddingModel: emb.model } })
  }
  await writeAudit(req, { tenants: [tenantId], action: 'ai.knowledge.reindexed', collection: 'ai-documents', docId: '-', note: `${docs.docs.length} documents, ${failed} failed` })
  return { documents: docs.docs.length, failed }
}
