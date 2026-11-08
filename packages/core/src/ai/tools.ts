/**
 * The assistant's tools and the confirmation flow (ADR 018 §1). Read tools run as the user; write tools only create
 * a proposal that the same person confirms. Money approvals are never tools.
 */
import { z } from 'zod'
import { can, type AccessContext, type Decision, type Id } from '../access'

export type AiRequirement = { any: readonly string[] }

const any = (...k: string[]): AiRequirement => ({ any: k })

/** Approvals that ADR 006 reserves for a second person. Never proposed, never confirmed through the assistant. */
export const FOUR_EYES_APPROVALS: readonly string[] = ['payments.manual.approve', 'refunds.approve']

export const AI_USE: AiRequirement = any('ai.use')
export const AI_MANAGE: AiRequirement = any('ai.manage')

const query = z.string().trim().max(120).optional().describe('Words to search for; empty = latest')

// ---------------------------------------------------------------- read tools

export const READ_TOOLS = {
  search_courses: {
    description: 'Search the academy\'s courses (title, status, price). Returns at most 10.',
    requires: any('courses.view', 'courses.edit', 'courses.publish', 'pricing.edit'),
    input: z.object({ query }),
  },
  search_leads: {
    description: 'Search leads (potential students) the user may see, by name or status. Returns at most 10.',
    requires: any('leads.view.own', 'leads.view.all'),
    input: z.object({ query, status: z.string().max(30).optional() }),
  },
  search_orders: {
    description: 'Search orders the user may see, by status. Amounts are integer rials. Returns at most 10.',
    requires: any('orders.view'),
    input: z.object({ status: z.string().max(30).optional(), query }),
  },
  search_students: {
    description: 'Search students and users by name. Returns at most 10.',
    requires: any('users.view'),
    input: z.object({ query: z.string().trim().min(1).max(120) }),
  },
  search_knowledge: {
    description: 'Search the academy knowledge base (uploaded documents, approved memory notes, user guides). Use for policies, procedures and facts.',
    requires: AI_USE,
    input: z.object({ query: z.string().trim().min(1).max(200) }),
  },
} as const

// ---------------------------------------------------------------- write tools (proposals)

const isoDate = z.string().refine((v) => Number.isFinite(Date.parse(v)), 'ISO date')

export const ACTIONS = {
  'coupon.create': {
    tool: 'propose_coupon',
    label: 'ساختن کد تخفیف',
    description: 'Propose a new coupon code. It is created only after the user presses confirm.',
    permission: 'coupons.manage',
    input: z.object({
      code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/, 'latin letters, digits, - and _'),
      kind: z.enum(['percent', 'fixed']),
      value: z.number().int().positive().describe('Percent (1–100) or a fixed amount in integer rials'),
      maxDiscount: z.number().int().positive().optional().describe('Integer rials, percent coupons only'),
      validUntil: isoDate.optional(),
      usageLimit: z.number().int().positive().optional(),
      note: z.string().max(200).optional(),
    }).refine((v) => v.kind !== 'percent' || v.value <= 100, { message: 'percent must be 1–100', path: ['value'] }),
  },
  'course.update': {
    tool: 'propose_course_update',
    label: 'ویرایش متن دوره',
    description: 'Propose a change to a course\'s text fields (title, subtitle, summary, duration label). Price is not editable here.',
    permission: 'courses.edit',
    input: z.object({
      courseId: z.number().int().positive(),
      changes: z
        .object({
          title: z.string().trim().min(2).max(200).optional(),
          subtitle: z.string().trim().max(300).optional(),
          summary: z.string().trim().max(3000).optional(),
          durationLabel: z.string().trim().max(60).optional(),
        })
        .refine((c) => Object.values(c).some((v) => v !== undefined), 'at least one field'),
    }),
  },
  'lead.followup': {
    tool: 'propose_lead_followup',
    label: 'ثبت پیگیری سرنخ',
    description: 'Propose a follow-up for a lead: a note and/or the next follow-up date.',
    permission: 'leads.view',
    input: z
      .object({ leadId: z.number().int().positive(), note: z.string().trim().min(1).max(1000).optional(), nextFollowUpAt: isoDate.optional() })
      .refine((v) => v.note !== undefined || v.nextFollowUpAt !== undefined, 'note or date'),
  },
} as const

export type ReadToolName = keyof typeof READ_TOOLS
export type ActionKind = keyof typeof ACTIONS
export const MEMORY_TOOL = 'propose_memory'
export const MEMORY_TOOL_DEF = {
  description: 'Propose a memory note: a lasting fact about this academy (policy, procedure) worth remembering. A manager approves it before it is used.',
  input: z.object({ text: z.string().trim().min(5).max(800) }),
}

export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown>; kind: 'read' | 'write' | 'memory' }

/** Does the person hold one of the requirement's permissions in this academy? */
export function meetsIn(ctx: AccessContext, tenantId: Id, req: AiRequirement): boolean {
  return req.any.some((p) => can(ctx, tenantId, p))
}

const jsonSchema = (s: z.ZodType) => {
  const out = z.toJSONSchema(s, { target: 'draft-7', unrepresentable: 'any' }) as Record<string, unknown>
  delete out.$schema
  return out
}

/** The tools this person may use here. Write tools appear only with the permission their action needs. */
export function toolsFor(ctx: AccessContext, tenantId: Id): ToolSpec[] {
  if (!meetsIn(ctx, tenantId, AI_USE)) return []
  const out: ToolSpec[] = []
  for (const [name, t] of Object.entries(READ_TOOLS)) {
    if (meetsIn(ctx, tenantId, t.requires)) out.push({ name, description: t.description, parameters: jsonSchema(t.input), kind: 'read' })
  }
  for (const a of Object.values(ACTIONS)) {
    if (can(ctx, tenantId, a.permission)) out.push({ name: a.tool, description: a.description, parameters: jsonSchema(a.input), kind: 'write' })
  }
  out.push({ name: MEMORY_TOOL, description: MEMORY_TOOL_DEF.description, parameters: jsonSchema(MEMORY_TOOL_DEF.input), kind: 'memory' })
  return out
}

export const actionForTool = (tool: string): ActionKind | null =>
  (Object.entries(ACTIONS).find(([, a]) => a.tool === tool)?.[0] as ActionKind | undefined) ?? null

export type ParsedAction = { ok: true; kind: ActionKind; input: Record<string, unknown> } | { ok: false; reason: string }

/** Validates a write tool call into a proposal. Refuses unknown tools and anything that needs a four-eyes approval. */
export function parseProposal(tool: string, args: unknown): ParsedAction {
  const kind = actionForTool(tool)
  if (!kind) return { ok: false, reason: `unknown action tool: ${tool}` }
  if (FOUR_EYES_APPROVALS.includes(ACTIONS[kind].permission)) return { ok: false, reason: 'four-eyes approvals are not available to the assistant' }
  const parsed = ACTIONS[kind].input.safeParse(args)
  if (!parsed.success) return { ok: false, reason: parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ') }
  return { ok: true, kind, input: parsed.data as Record<string, unknown> }
}

// ---------------------------------------------------------------- confirmation

export const PROPOSAL_TTL_MS = 30 * 60 * 1000

export type ProposalStatus = 'pending' | 'executed' | 'rejected' | 'failed' | 'expired'
export type ProposalState = { tenantId: Id; proposedBy: Id; kind: string; status: ProposalStatus; expiresAt: string | Date }

const same = (a: Id, b: Id) => String(a) === String(b)

/**
 * May `actor` confirm this proposal now? Same academy, same person who asked, still pending and not expired,
 * still allowed to use the assistant and still holding the action's permission. Four-eyes approvals: never.
 * The record-level scope (own lead, own course) is then checked again by the collection when the action runs.
 */
export function confirmDecision(p: ProposalState, actor: { ctx: AccessContext; tenantId: Id }, now = new Date()): Decision {
  const def = (ACTIONS as Record<string, (typeof ACTIONS)[ActionKind] | undefined>)[p.kind]
  if (!def) return { ok: false, reason: 'unknown-action' }
  if (FOUR_EYES_APPROVALS.includes(def.permission)) return { ok: false, reason: 'four-eyes' }
  if (!same(p.tenantId, actor.tenantId)) return { ok: false, reason: 'other-academy' }
  if (!same(p.proposedBy, actor.ctx.userId)) return { ok: false, reason: 'not-yours' }
  if (p.status !== 'pending') return { ok: false, reason: `already-${p.status}` }
  if (new Date(p.expiresAt).getTime() <= now.getTime()) return { ok: false, reason: 'expired' }
  if (!meetsIn(actor.ctx, actor.tenantId, AI_USE)) return { ok: false, reason: 'no-ai-access' }
  if (!can(actor.ctx, actor.tenantId, def.permission)) return { ok: false, reason: 'no-permission' }
  return { ok: true }
}

/** Rejecting needs less: your own pending proposal in this academy. */
export function rejectDecision(p: ProposalState, actor: { ctx: AccessContext; tenantId: Id }): Decision {
  if (!same(p.tenantId, actor.tenantId)) return { ok: false, reason: 'other-academy' }
  if (!same(p.proposedBy, actor.ctx.userId)) return { ok: false, reason: 'not-yours' }
  if (p.status !== 'pending') return { ok: false, reason: `already-${p.status}` }
  return { ok: true }
}

export const DECISION_MESSAGES: Record<string, string> = {
  'unknown-action': 'این کار شناخته نیست.',
  'four-eyes': 'تأیید پرداخت و بازپرداخت باید از میز مالی و به دست نفر دوم انجام شود.',
  'other-academy': 'این پیشنهاد مال آکادمی دیگری است.',
  'not-yours': 'فقط کسی که این کار را خواسته می‌تواند آن را تأیید کند.',
  expired: 'مهلت این پیشنهاد گذشته است؛ دوباره از دستیار بخواهید.',
  'no-ai-access': 'دسترسی شما به دستیار هوشمند برداشته شده است.',
  'no-permission': 'شما اجازهٔ این کار را ندارید.',
  'already-executed': 'این پیشنهاد پیش‌تر انجام شده است.',
  'already-rejected': 'این پیشنهاد رد شده است.',
  'already-failed': 'این پیشنهاد پیش‌تر ناموفق بوده است.',
  'already-expired': 'مهلت این پیشنهاد گذشته است.',
}
