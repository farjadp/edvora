'use server'

/**
 * Advisor CRM desk actions (E-015). Zod on every input; each action re-reads the staff session for the academy
 * resolved from the Host header, then checks academy + scope against the lead itself (core rules). Never
 * redirect() (ADR 005): the client refreshes in place.
 */
import { canAssignLead, canClaimLead, LEAD_LOST_REASONS } from '@edvora/core/crm'
import { LEAD_STATUSES, type LeadStatus } from '@edvora/core'
import { LEAD_OUTCOMES } from '@edvora/core/staff-goals'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAccess } from '../../../../../access/permissions'
import { LEAD_DESK_CONTEXT } from '../../../../../collections/Leads'
import { idOf } from '../../../../../lib/ids'
import { writeCallLog, writeMarkLost, type StaffOk, type WriteResult } from '../../../../../lib/leadWrites'
import { targetAccess } from '../../../../../lib/crmDesk'
import { getStaffSession } from '../../../../../lib/staff'

export type LeadDeskState = WriteResult

const DENIED: LeadDeskState = { ok: false, message: 'نشست شما معتبر نیست. دوباره وارد شوید.' }
const NOT_FOUND: LeadDeskState = { ok: false, message: 'این مورد پیدا نشد.' }
const FAILED: LeadDeskState = { ok: false, message: 'انجام نشد. دوباره تلاش کنید.' }

async function staff(): Promise<StaffOk | null> {
  const s = await getStaffSession()
  if (s.state !== 'ok' || !s.user || !s.req) return null
  return { ...s, user: s.user, req: s.req }
}

function refresh(leadId: number) {
  revalidatePath('/staff/leads')
  revalidatePath(`/staff/leads/${leadId}`)
}

const LeadId = z.coerce.number().int().positive()

const CallInput = z.object({
  leadId: LeadId,
  outcome: z.enum(LEAD_OUTCOMES),
  note: z.string().trim().max(1000).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  /** ISO (UTC) from the Jalali picker; null = no next follow-up; omitted = the stage default. */
  nextFollowUpAt: z.iso.datetime({ offset: true }).nullable().optional(),
  lostReason: z.enum(LEAD_LOST_REASONS).nullable().optional(),
})

export async function logLeadCall(input: z.input<typeof CallInput>): Promise<LeadDeskState> {
  const parsed = CallInput.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'اطلاعات تماس کامل نیست.' }
  const s = await staff()
  if (!s) return DENIED
  try {
    const r = await writeCallLog(s, { ...parsed.data, status: parsed.data.status as LeadStatus | undefined })
    if (r.ok) refresh(parsed.data.leadId)
    return r
  } catch (err) {
    console.error('[logLeadCall]', err)
    return FAILED
  }
}

const LostInput = z.object({ leadId: LeadId, reason: z.enum(LEAD_LOST_REASONS), note: z.string().trim().max(500).optional() })

export async function markLeadLost(input: z.input<typeof LostInput>): Promise<LeadDeskState> {
  const parsed = LostInput.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'دلیل از دست رفتن را انتخاب کنید.', field: 'lostReason' }
  const s = await staff()
  if (!s) return DENIED
  try {
    const r = await writeMarkLost(s, parsed.data)
    if (r.ok) refresh(parsed.data.leadId)
    return r
  } catch (err) {
    console.error('[markLeadLost]', err)
    return FAILED
  }
}

/** Takes an unassigned lead from the pool for oneself (`leads.claim`, not with ownRecordsOnly, inside course scope). */
export async function claimLead(input: { leadId: number }): Promise<LeadDeskState> {
  const parsed = z.object({ leadId: LeadId }).safeParse(input)
  if (!parsed.success) return NOT_FOUND
  const s = await staff()
  if (!s) return DENIED
  try {
    const payload = s.req.payload
    const lead = await payload.findByID({ collection: 'leads', id: parsed.data.leadId, depth: 0, overrideAccess: true, disableErrors: true })
    if (!lead || idOf(lead.tenant) !== s.tenant.id) return NOT_FOUND
    const ctx = await getAccess(s.req)
    if (!ctx) return DENIED
    const d = canClaimLead(ctx, s.tenant.id, { advisorId: idOf(lead.advisor), courseId: idOf(lead.course), status: lead.status as LeadStatus })
    if (!d.ok) return d.reason === 'taken' ? { ok: false, message: 'همکار دیگری این سرنخ را برداشته است.' } : d.reason === 'closed' ? { ok: false, message: 'این سرنخ بسته شده است.' } : NOT_FOUND
    // Conditional update: only while still unassigned (two advisors clicking at once → one wins).
    const res = await payload.update({
      collection: 'leads',
      where: { and: [{ id: { equals: lead.id } }, { tenant: { equals: s.tenant.id } }, { advisor: { exists: false } }] },
      data: { advisor: s.user.id },
      req: s.req,
      overrideAccess: true,
      context: { [LEAD_DESK_CONTEXT]: true },
    })
    if (res.docs.length !== 1) return { ok: false, message: 'همکار دیگری این سرنخ را برداشته است.' }
    refresh(lead.id)
    return { ok: true, message: 'این سرنخ به شما سپرده شد.' }
  } catch (err) {
    console.error('[claimLead]', err)
    return FAILED
  }
}

const AssignInput = z.object({ leadId: LeadId, advisorId: z.coerce.number().int().positive() })

/** Gives a lead to another advisor (`leads.assign`); the new advisor must be able to work it. */
export async function assignLead(input: z.input<typeof AssignInput>): Promise<LeadDeskState> {
  const parsed = AssignInput.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'مشاور را انتخاب کنید.' }
  const s = await staff()
  if (!s) return DENIED
  try {
    const payload = s.req.payload
    const lead = await payload.findByID({ collection: 'leads', id: parsed.data.leadId, depth: 0, overrideAccess: true, disableErrors: true })
    if (!lead || idOf(lead.tenant) !== s.tenant.id) return NOT_FOUND
    const ctx = await getAccess(s.req)
    if (!ctx) return DENIED
    const user = await payload.findByID({ collection: 'users', id: parsed.data.advisorId, depth: 0, overrideAccess: true, disableErrors: true })
    if (!user || (user.status ?? 'active') !== 'active') return { ok: false, message: 'این مشاور پیدا نشد.' }
    const target = await targetAccess({ ...s }, user.id, user.status)
    if (!canAssignLead(ctx, target, s.tenant.id, { advisorId: idOf(lead.advisor), courseId: idOf(lead.course) })) return { ok: false, message: 'این سرنخ را نمی‌توانید به این شخص بسپارید.' }
    if (idOf(lead.advisor) === user.id) return { ok: true, message: 'این سرنخ از قبل با همین مشاور است.' }
    await payload.update({ collection: 'leads', id: lead.id, data: { advisor: user.id }, req: s.req, overrideAccess: true, context: { [LEAD_DESK_CONTEXT]: true } })
    refresh(lead.id)
    return { ok: true, message: `سرنخ به ${user.name || 'مشاور'} سپرده شد.` }
  } catch (err) {
    console.error('[assignLead]', err)
    return FAILED
  }
}
