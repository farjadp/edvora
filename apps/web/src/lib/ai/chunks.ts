import 'server-only'
import { cosine, type Source, type SourceKind } from '@edvora/core/ai'
import type { Payload } from 'payload'

/**
 * The knowledge-base vectors (ADR 018 §Vectors): raw table `ai_chunks`, outside Payload's schema. `embedding` is
 * pgvector `vector` when the extension exists, else `double precision[]` (cosine in code). Every query filters by
 * tenant_id; chat chunks are visible only to the chat's owner.
 */
export const CHUNKS_DDL = (vector: boolean) => `
  CREATE TABLE IF NOT EXISTS ai_chunks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_type varchar(16) NOT NULL,
    source_id integer NOT NULL,
    owner_id integer,
    title text NOT NULL,
    ordinal integer NOT NULL DEFAULT 0,
    content text NOT NULL,
    embedding_model varchar(80) NOT NULL,
    embedding ${vector ? 'vector' : 'double precision[]'} NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS ai_chunks_lookup_idx ON ai_chunks (tenant_id, embedding_model, source_type);
  CREATE INDEX IF NOT EXISTS ai_chunks_source_idx ON ai_chunks (source_type, source_id);`

type Mode = 'vector' | 'array'
let ready: Promise<Mode> | null = null

/** The adapter's pg pool (parameterised queries only). */
export type SqlPool = { query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[] }> }
export const poolOf = (payload: Payload): SqlPool => (payload.db as unknown as { pool: SqlPool }).pool

/** Creates the table on first use (dev: Payload push skips it) and reports how vectors are stored. */
export function ensureChunkStore(payload: Payload): Promise<Mode> {
  ready ??= (async () => {
    const pool = poolOf(payload)
    let vector = false
    try {
      await pool.query('CREATE EXTENSION IF NOT EXISTS vector')
      vector = true
    } catch (err) {
      payload.logger.warn({ err, msg: 'ai: pgvector is not available; using double precision[] with cosine in code' })
    }
    await pool.query(CHUNKS_DDL(vector))
    const col = await pool.query<{ udt_name: string }>("SELECT udt_name FROM information_schema.columns WHERE table_name = 'ai_chunks' AND column_name = 'embedding'")
    return col.rows[0]?.udt_name === 'vector' ? 'vector' : 'array'
  })().catch((err: unknown) => {
    ready = null
    throw err
  })
  return ready
}

const vec = (v: readonly number[]) => `[${v.map((x) => (Number.isFinite(x) ? x : 0)).join(',')}]`

export type ChunkRow = { tenantId: number; sourceType: SourceKind; sourceId: number; ownerId?: number | null; title: string; ordinal: number; content: string; model: string; embedding: number[] }

export async function insertChunks(payload: Payload, rows: ChunkRow[]): Promise<void> {
  if (rows.length === 0) return
  const mode = await ensureChunkStore(payload)
  const pool = poolOf(payload)
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50)
    const params: unknown[] = []
    const values = batch.map((r, j) => {
      const b = j * 9
      params.push(r.tenantId, r.sourceType, r.sourceId, r.ownerId ?? null, r.title, r.ordinal, r.content, r.model, mode === 'vector' ? vec(r.embedding) : r.embedding)
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}${mode === 'vector' ? '::vector' : ''})`
    })
    await pool.query(`INSERT INTO ai_chunks (tenant_id, source_type, source_id, owner_id, title, ordinal, content, embedding_model, embedding) VALUES ${values.join(', ')}`, params)
  }
}

export async function deleteChunks(payload: Payload, tenantId: number, sourceType: SourceKind, sourceId: number): Promise<void> {
  await ensureChunkStore(payload)
  await poolOf(payload).query('DELETE FROM ai_chunks WHERE tenant_id = $1 AND source_type = $2 AND source_id = $3', [tenantId, sourceType, sourceId])
}

type Hit = { source_type: SourceKind; source_id: number; title: string; content: string; score: number }

/** Top passages for `embedding` in this academy (documents, approved memory, the user's own chats). */
export async function searchChunks(
  payload: Payload,
  q: { tenantId: number; userId: number; model: string; embedding: number[]; kinds?: SourceKind[]; k?: number },
): Promise<Source[]> {
  const mode = await ensureChunkStore(payload)
  const pool = poolOf(payload)
  const kinds = q.kinds ?? ['document', 'memory', 'chat']
  const k = q.k ?? 8
  const where = `tenant_id = $1 AND embedding_model = $2 AND source_type = ANY($3) AND (source_type <> 'chat' OR owner_id = $4)`
  let hits: Hit[]
  if (mode === 'vector') {
    const res = await pool.query<Hit>(
      `SELECT source_type, source_id, title, content, 1 - (embedding <=> $5::vector) AS score FROM ai_chunks
       WHERE ${where} AND vector_dims(embedding) = $6 ORDER BY embedding <=> $5::vector LIMIT $7`,
      [q.tenantId, q.model, kinds, q.userId, vec(q.embedding), q.embedding.length, k],
    )
    hits = res.rows
  } else {
    const res = await pool.query<Hit & { embedding: number[] }>(`SELECT source_type, source_id, title, content, embedding FROM ai_chunks WHERE ${where} ORDER BY id DESC LIMIT 5000`, [q.tenantId, q.model, kinds, q.userId])
    hits = res.rows
      .map((r) => ({ ...r, score: cosine(q.embedding, r.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
  }
  return hits.map((h) => ({ kind: h.source_type, id: h.source_id, title: h.title, content: h.content, score: Number(h.score) }))
}

export async function chunkCount(payload: Payload, tenantId: number): Promise<{ total: number; models: string[] }> {
  await ensureChunkStore(payload)
  const res = await poolOf(payload).query<{ embedding_model: string; n: string }>('SELECT embedding_model, count(*) AS n FROM ai_chunks WHERE tenant_id = $1 GROUP BY embedding_model', [tenantId])
  return { total: res.rows.reduce((n, r) => n + Number(r.n), 0), models: res.rows.map((r) => r.embedding_model) }
}
