import 'server-only'
import { formatJalali, formatToman, rial } from '@edvora/core'
import {
  ACTIONS,
  PROPOSAL_TTL_MS,
  READ_TOOLS,
  meetsIn,
  parseProposal,
  redactRecord,
  type ActionKind,
  type PrivacyPolicy,
  type ReadToolName,
} from '@edvora/core/ai'
import type { AccessContext } from '@edvora/core'
import type { PayloadRequest, Where } from 'payload'
import { writeAudit } from '../../hooks/audit'

/**
 * Server side of the assistant's tools (ADR 018 §1). Read tools query through the Payload local API AS THE USER
 * (`overrideAccess: false`), so collection access and scope decide what comes back; every query also pins the tenant.
 * Write tools never write: they become `ai-actions` proposals, executed on confirm, again as the user.
 */
export type ToolCtx = { req: PayloadRequest; ctx: AccessContext; tenantId: number; privacy: PrivacyPolicy }

const MAX_RESULT = 6000
const asUser = (t: ToolCtx) => ({ req: t.req, user: t.req.user, overrideAccess: false as const, depth: 0, limit: 10 })
const tenantWhere = (t: ToolCtx, ...and: (Where | null)[]): Where => ({ and: [{ tenant: { equals: t.tenantId } }, ...and.filter((w): w is Where => w !== null)] })
const like = (fields: string[], q?: string): Where | null => (q?.trim() ? { or: fields.map((f) => ({ [f]: { like: q.trim() } })) } : null)

export function toolResult(t: ToolCtx, value: unknown): string {
  const s = JSON.stringify(redactRecord(value, t.privacy))
  return s.length > MAX_RESULT ? `${s.slice(0, MAX_RESULT)}…(truncated)` : s
}

type Input = Record<string, string | undefined>

const READERS: Record<Exclude<ReadToolName, 'search_knowledge'>, (t: ToolCtx, a: Input) => Promise<unknown>> = {
  async search_courses(t, a) {
    const r = await t.req.payload.find({ collection: 'courses', ...asUser(t), where: tenantWhere(t, like(['title', 'slug', 'subtitle'], a.query)), sort: 'sortOrder' })
    return { items: r.docs.map((c) => ({ id: c.id, title: c.title, slug: c.slug, status: c.status, kind: c.kind, price_rial: c.price ?? null, maxInstalments: c.maxInstalments ?? null })), total: r.totalDocs }
  },
  async search_leads(t, a) {
    const r = await t.req.payload.find({
      collection: 'leads',
      ...asUser(t),
      where: tenantWhere(t, like(['name'], a.query), a.status ? { status: { equals: a.status } } : null),
      sort: '-createdAt',
    })
    return { items: r.docs.map((l) => ({ id: l.id, name: l.name, phone: l.phone, status: l.status, nextFollowUpAt: l.nextFollowUpAt ?? null, lastOutcome: l.lastOutcome ?? null, course: l.course ?? null })), total: r.totalDocs }
  },
  async search_orders(t, a) {
    const r = await t.req.payload.find({ collection: 'orders', ...asUser(t), where: tenantWhere(t, a.status ? { status: { equals: a.status } } : null, like(['couponCode'], a.query)), sort: '-createdAt' })
    return { items: r.docs.map((o) => ({ id: o.id, status: o.status, total_rial: o.total, discount_rial: o.discount ?? 0, course: o.course, user: o.user, createdAt: o.createdAt })), total: r.totalDocs }
  },
  async search_students(t, a) {
    const r = await t.req.payload.find({
      collection: 'users',
      ...asUser(t),
      where: { and: [{ 'tenants.tenant': { equals: t.tenantId } }, like(['name', 'firstName', 'lastName'], a.query) ?? {}] },
    })
    return { items: r.docs.map((u) => ({ id: u.id, name: u.name, phone: u.phone ?? null, email: u.email, status: u.status ?? 'active' })), total: r.totalDocs }
  },
}

/** Runs a read tool. Never throws: errors become `{ error }` for the model (and are logged). */
export async function runReadTool(t: ToolCtx, name: string, args: unknown): Promise<string> {
  const def = (READ_TOOLS as Record<string, (typeof READ_TOOLS)[ReadToolName] | undefined>)[name]
  if (!def || name === 'search_knowledge') return toolResult(t, { error: `unknown tool ${name}` })
  if (!meetsIn(t.ctx, t.tenantId, def.requires)) return toolResult(t, { error: 'permission denied' })
  const parsed = def.input.safeParse(args ?? {})
  if (!parsed.success) return toolResult(t, { error: 'invalid input' })
  try {
    return toolResult(t, await READERS[name as keyof typeof READERS](t, parsed.data as Input))
  } catch (err) {
    t.req.payload.logger.error({ err, msg: `ai tool ${name} failed` })
    return toolResult(t, { error: 'this data is not available to you' })
  }
}

// ---------------------------------------------------------------- proposals

const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n)
const dateFa = (iso: string) => formatJalali(new Date(iso))

type Prepared = { summary: string; targetCollection: string; targetId: string | null } | { error: string }

/** Turns a validated proposal into a Persian summary, after checking the user can see the target record. */
async function prepare(t: ToolCtx, kind: ActionKind, input: Record<string, unknown>): Promise<Prepared> {
  const p = t.req.payload
  if (kind === 'coupon.create') {
    const code = String(input.code).toUpperCase()
    const dup = await p.find({ collection: 'coupons', where: { and: [{ tenant: { equals: t.tenantId } }, { code: { equals: code } }] }, limit: 1, depth: 0, overrideAccess: true })
    if (dup.docs.length) return { error: `coupon code ${code} already exists` }
    const value = Number(input.value)
    const parts = [input.kind === 'percent' ? `${fa(value)}٪ تخفیف` : `${formatToman(rial(value))} تخفیف`]
    if (input.maxDiscount) parts.push(`سقف ${formatToman(rial(Number(input.maxDiscount)))}`)
    if (input.validUntil) parts.push(`تا ${dateFa(String(input.validUntil))}`)
    if (input.usageLimit) parts.push(`حداکثر ${fa(Number(input.usageLimit))} بار`)
    return { summary: `ساختن کد تخفیف «${code}»: ${parts.join('، ')}`, targetCollection: 'coupons', targetId: null }
  }
  if (kind === 'course.update') {
    const course = await p.findByID({ collection: 'courses', id: Number(input.courseId), ...asUser(t) }).catch(() => null)
    if (!course || Number(typeof course.tenant === 'object' ? course.tenant?.id : course.tenant) !== t.tenantId) return { error: 'course not found' }
    const labels: Record<string, string> = { title: 'عنوان', subtitle: 'زیرعنوان', summary: 'خلاصه', durationLabel: 'مدت' }
    const changes = input.changes as Record<string, string | undefined>
    const lines = Object.entries(changes)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${labels[k] ?? k}: «${String((course as unknown as Record<string, unknown>)[k] ?? '—').slice(0, 80)}» ← «${String(v).slice(0, 200)}»`)
    return { summary: `ویرایش دورهٔ «${course.title}»\n${lines.join('\n')}`, targetCollection: 'courses', targetId: String(course.id) }
  }
  const lead = await p.findByID({ collection: 'leads', id: Number(input.leadId), ...asUser(t) }).catch(() => null)
  if (!lead || Number(typeof lead.tenant === 'object' ? lead.tenant?.id : lead.tenant) !== t.tenantId) return { error: 'lead not found' }
  const bits = [input.note ? `یادداشت: «${String(input.note).slice(0, 200)}»` : '', input.nextFollowUpAt ? `پیگیری بعدی: ${dateFa(String(input.nextFollowUpAt))}` : ''].filter(Boolean)
  return { summary: `پیگیری سرنخ «${lead.name}»\n${bits.join('\n')}`, targetCollection: 'leads', targetId: String(lead.id) }
}

export type ProposalOut = { id: number; kind: ActionKind; label: string; summary: string; expiresAt: string }

/** Write tool call → stored proposal (status pending). Returns the tool result for the model and the card for the UI. */
export async function proposeAction(t: ToolCtx, tool: string, args: unknown, conversationId: number): Promise<{ result: string; proposal?: ProposalOut }> {
  const parsed = parseProposal(tool, args)
  if (!parsed.ok) return { result: toolResult(t, { error: parsed.reason }) }
  if (!meetsIn(t.ctx, t.tenantId, { any: [ACTIONS[parsed.kind].permission] })) return { result: toolResult(t, { error: 'permission denied' }) }
  try {
    const prep = await prepare(t, parsed.kind, parsed.input)
    if ('error' in prep) return { result: toolResult(t, { error: prep.error }) }
    const expiresAt = new Date(Date.now() + PROPOSAL_TTL_MS).toISOString()
    const doc = await t.req.payload.create({
      collection: 'ai-actions',
      overrideAccess: true,
      req: t.req,
      data: {
        tenant: t.tenantId,
        kind: parsed.kind,
        input: parsed.input,
        summary: prep.summary,
        status: 'pending',
        proposedBy: Number(t.req.user!.id),
        conversation: conversationId,
        expiresAt,
        targetCollection: prep.targetCollection,
        targetId: prep.targetId,
      },
    })
    await writeAudit(t.req, { tenants: [t.tenantId], action: 'ai.action.proposed', collection: 'ai-actions', docId: doc.id, note: prep.summary.slice(0, 300) })
    return {
      result: toolResult(t, { status: 'proposed', proposalId: doc.id, note: 'Nothing has changed yet. The user must press confirm.' }),
      proposal: { id: doc.id, kind: parsed.kind, label: ACTIONS[parsed.kind].label, summary: prep.summary, expiresAt },
    }
  } catch (err) {
    t.req.payload.logger.error({ err, msg: `ai proposal ${tool} failed` })
    return { result: toolResult(t, { error: 'could not prepare this change' }) }
  }
}

/** Runs a confirmed proposal as the user. Collection access, guards and audit hooks apply as for a manual edit. */
export async function executeAction(req: PayloadRequest, tenantId: number, kind: ActionKind, input: Record<string, unknown>): Promise<{ collection: string; id: string }> {
  const as = { req, user: req.user, overrideAccess: false as const, depth: 0 }
  if (kind === 'coupon.create') {
    const doc = await req.payload.create({
      collection: 'coupons',
      ...as,
      data: {
        tenant: tenantId,
        code: String(input.code),
        kind: input.kind as 'percent' | 'fixed',
        value: Number(input.value),
        maxDiscount: input.maxDiscount ? Number(input.maxDiscount) : undefined,
        validUntil: input.validUntil ? String(input.validUntil) : undefined,
        usageLimit: input.usageLimit ? Number(input.usageLimit) : undefined,
        note: input.note ? String(input.note) : 'ساخته‌شده با دستیار هوشمند',
        active: true,
      },
    })
    return { collection: 'coupons', id: String(doc.id) }
  }
  if (kind === 'course.update') {
    const changes = Object.fromEntries(Object.entries(input.changes as Record<string, unknown>).filter(([, v]) => v !== undefined))
    const doc = await req.payload.update({ collection: 'courses', id: Number(input.courseId), ...as, data: changes })
    return { collection: 'courses', id: String(doc.id) }
  }
  const lead = await req.payload.findByID({ collection: 'leads', id: Number(input.leadId), ...as })
  const data: Record<string, unknown> = {}
  if (input.nextFollowUpAt) data.nextFollowUpAt = String(input.nextFollowUpAt)
  if (input.note) data.activities = [...(lead.activities ?? []), { kind: 'note', text: String(input.note), at: new Date().toISOString() }]
  const doc = await req.payload.update({ collection: 'leads', id: lead.id, ...as, data })
  return { collection: 'leads', id: String(doc.id) }
}
