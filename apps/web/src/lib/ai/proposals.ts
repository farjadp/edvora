import 'server-only'
import type { AccessContext } from '@edvora/core'
import { DECISION_MESSAGES, confirmDecision, rejectDecision, type ActionKind, type ProposalStatus } from '@edvora/core/ai'
import type { PayloadRequest } from 'payload'
import { writeAudit } from '../../hooks/audit'
import { executeAction } from './tools'

export type ProposalDecision = { ok: true; status: ProposalStatus; target?: { collection: string; id: string } } | { ok: false; status?: ProposalStatus; message: string }

const ADMIN_PATH: Record<string, string> = { coupons: '/admin/collections/coupons', courses: '/admin/collections/courses', leads: '/admin/collections/leads' }
export const targetHref = (t: { collection: string; id: string }) => (ADMIN_PATH[t.collection] ? `${ADMIN_PATH[t.collection]}/${t.id}` : null)

/**
 * Confirm or reject an assistant proposal (ADR 018 §1). The rules are `confirmDecision` / `rejectDecision` (core);
 * the action then runs through the local API as the person, so the collection's access, guards and audit hooks apply.
 */
export async function decideProposal(req: PayloadRequest, ctx: AccessContext, tenantId: number, id: number, decision: 'confirm' | 'reject'): Promise<ProposalDecision> {
  const payload = req.payload
  const found = await payload.find({ collection: 'ai-actions', where: { and: [{ id: { equals: id } }, { tenant: { equals: tenantId } }] }, limit: 1, depth: 0, overrideAccess: true })
  const action = found.docs[0]
  if (!action) return { ok: false, message: 'این پیشنهاد پیدا نشد.' }
  const state = {
    tenantId: Number(typeof action.tenant === 'object' && action.tenant ? action.tenant.id : action.tenant),
    proposedBy: Number(typeof action.proposedBy === 'object' ? action.proposedBy.id : action.proposedBy),
    kind: action.kind,
    status: action.status as ProposalStatus,
    expiresAt: action.expiresAt,
  }
  const decided = { decidedAt: new Date().toISOString() }

  if (decision === 'reject') {
    const d = rejectDecision(state, { ctx, tenantId })
    if (!d.ok) return { ok: false, status: state.status, message: DECISION_MESSAGES[d.reason] ?? d.reason }
    await payload.update({ collection: 'ai-actions', id, overrideAccess: true, req, data: { status: 'rejected', ...decided } })
    await writeAudit(req, { tenants: [tenantId], action: 'ai.action.rejected', collection: 'ai-actions', docId: id, note: action.summary.slice(0, 300) })
    return { ok: true, status: 'rejected' }
  }

  const d = confirmDecision(state, { ctx, tenantId })
  if (!d.ok) {
    if (d.reason === 'expired' && state.status === 'pending') await payload.update({ collection: 'ai-actions', id, overrideAccess: true, req, data: { status: 'expired' } })
    await writeAudit(req, { tenants: [tenantId], action: 'ai.action.refused', collection: 'ai-actions', docId: id, note: d.reason })
    return { ok: false, status: d.reason === 'expired' ? 'expired' : state.status, message: DECISION_MESSAGES[d.reason] ?? d.reason }
  }
  // Claim it first, so a double click cannot run it twice.
  const claimed = await payload.update({ collection: 'ai-actions', where: { and: [{ id: { equals: id } }, { status: { equals: 'pending' } }] }, overrideAccess: true, req, data: { status: 'executed', ...decided } })
  if (claimed.docs.length !== 1) return { ok: false, message: DECISION_MESSAGES['already-executed']! }
  try {
    const target = await executeAction(req, tenantId, action.kind as ActionKind, action.input as Record<string, unknown>)
    await payload.update({ collection: 'ai-actions', id, overrideAccess: true, req, data: { targetCollection: target.collection, targetId: target.id } })
    await writeAudit(req, { tenants: [tenantId], action: 'ai.action.confirmed', collection: target.collection, docId: target.id, note: `ai-actions#${id}: ${action.summary.slice(0, 280)}` })
    return { ok: true, status: 'executed', target }
  } catch (err) {
    payload.logger.error({ err, msg: `ai: action ${id} failed` })
    const message = (err as { status?: number }).status === 403 ? 'شما اجازهٔ این تغییر را روی این رکورد ندارید.' : 'انجام این کار ناموفق بود؛ چیزی تغییر نکرد.'
    await payload.update({ collection: 'ai-actions', id, overrideAccess: true, req, data: { status: 'failed', error: String((err as Error).message ?? err).slice(0, 300) } })
    await writeAudit(req, { tenants: [tenantId], action: 'ai.action.failed', collection: 'ai-actions', docId: id, note: String((err as Error).message ?? err).slice(0, 300) })
    return { ok: false, status: 'failed', message }
  }
}
