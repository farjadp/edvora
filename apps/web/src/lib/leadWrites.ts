import 'server-only'
/**
 * Lead writes shared by the advisor desk (E-015) and the outcome chips (E-028 T6). All run as the staff user
 * (`req: s.req`), so the lead guard, the follow-up log protection and the audit log (`leads.update` with the diff)
 * apply. Callers have already checked the session; these check academy and scope again (never trust the caller).
 */
import { canTransitionLead, nextFollowUpAt as defaultFollowUpAt, type LeadStatus } from '@edvora/core'
import { LEAD_LOST_REASON_LABELS_FA, checkCallLog, type LeadLostReason } from '@edvora/core/crm'
import { STATUS_CHANGED, type LeadOutcome } from '@edvora/core/staff-goals'
import { canIn } from '../access/permissions'
import { FOLLOW_UP_CONTEXT } from '../collections/Leads'
import { idOf } from './ids'
import type { StaffSession } from './staff'
import type { Lead, User } from '../payload-types'
import type { PayloadRequest } from 'payload'

export type StaffOk = StaffSession & { user: User; req: PayloadRequest }
export type WriteResult = { ok: boolean; message: string; field?: string }

const NOT_FOUND: WriteResult = { ok: false, message: 'این مورد پیدا نشد.' }

/** The lead, if it is in this academy and inside the actor's `leads.view` scope (own lead for advisors). */
export async function workableLead(s: StaffOk, leadId: number): Promise<Lead | null> {
  const lead = await s.req.payload.findByID({ collection: 'leads', id: leadId, depth: 0, overrideAccess: true, disableErrors: true })
  // Another academy's lead: same answer as "not found" (no existence leak).
  if (!lead || idOf(lead.tenant) !== s.tenant.id) return null
  if (!(await canIn(s.req, s.tenant.id, 'leads.view', { ownerId: idOf(lead.advisor), courseId: idOf(lead.course) }))) return null
  return lead
}

const logOf = (lead: Lead) => (lead.followUps ?? []).map((f) => ({ ...f, by: idOf(f.by) }))

export type CallLog = {
  leadId: number
  outcome: LeadOutcome
  note?: string | null
  status?: LeadStatus
  /** undefined = stage default, null = none, else ISO (UTC). */
  nextFollowUpAt?: string | null
  lostReason?: LeadLostReason | null
}

/** Appends one call to the follow-up log, moves the status if asked (pipeline rule), sets the next follow-up. */
export async function writeCallLog(s: StaffOk, v: CallLog, now = new Date()): Promise<WriteResult> {
  const lead = await workableLead(s, v.leadId)
  if (!lead) return NOT_FOUND
  const from = (lead.status ?? 'new') as LeadStatus
  const to = v.status ?? from
  const check = checkCallLog({ from, to, outcome: v.outcome, nextFollowUpAt: v.nextFollowUpAt, lostReason: v.lostReason, now })
  if (!check.ok) return { ok: false, message: check.message, field: check.field }
  const next = to === 'enrolled' ? null : v.nextFollowUpAt === undefined ? (defaultFollowUpAt(to, now)?.toISOString() ?? null) : v.nextFollowUpAt
  await s.req.payload.update({
    collection: 'leads',
    id: lead.id,
    req: s.req,
    overrideAccess: false,
    context: { [FOLLOW_UP_CONTEXT]: true },
    data: {
      status: to,
      nextFollowUpAt: next,
      lastOutcome: v.outcome,
      lastOutcomeAt: now.toISOString(),
      lastOutcomeBy: s.user.id,
      ...(to === 'lost' && v.lostReason ? { lostReason: v.lostReason } : {}),
      followUps: [...logOf(lead), { at: now.toISOString(), outcome: v.outcome, by: s.user.id, dueAt: lead.nextFollowUpAt ?? null, note: v.note || null }],
    },
  })
  return { ok: true, message: 'تماس ثبت شد.' }
}

/** «از دست رفت» without a call: status → lost with a reason. Logged as a status change (counts as handled, PRD §4.1). */
export async function writeMarkLost(s: StaffOk, v: { leadId: number; reason: LeadLostReason; note?: string | null }, now = new Date()): Promise<WriteResult> {
  const lead = await workableLead(s, v.leadId)
  if (!lead) return NOT_FOUND
  const from = (lead.status ?? 'new') as LeadStatus
  if (from === 'lost') return { ok: false, message: 'این سرنخ از قبل «از دست رفته» است.' }
  if (!canTransitionLead(from, 'lost')) return { ok: false, message: 'این تغییر وضعیت مجاز نیست.' }
  const note = [LEAD_LOST_REASON_LABELS_FA[v.reason], v.note?.trim()].filter(Boolean).join(' — ')
  await s.req.payload.update({
    collection: 'leads',
    id: lead.id,
    req: s.req,
    overrideAccess: false,
    context: { [FOLLOW_UP_CONTEXT]: true },
    data: {
      status: 'lost',
      lostReason: v.reason,
      // Stage default for lost: one revisit after 30 days (the pipeline allows lost → follow_up).
      nextFollowUpAt: defaultFollowUpAt('lost', now)?.toISOString() ?? null,
      lastOutcomeAt: now.toISOString(),
      lastOutcomeBy: s.user.id,
      followUps: [...logOf(lead), { at: now.toISOString(), outcome: STATUS_CHANGED, by: s.user.id, dueAt: lead.nextFollowUpAt ?? null, note }],
    },
  })
  return { ok: true, message: 'سرنخ «از دست رفته» ثبت شد.' }
}
