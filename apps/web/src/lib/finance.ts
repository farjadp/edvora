import 'server-only'
import {
  AWAITING_REVIEW,
  CONTACT_OUTCOMES,
  PAYMENT_STATUS_LABELS,
  REFUND_ACTION_ERRORS,
  REFUND_REQUEST_ERRORS,
  REFUND_STATUS_LABELS,
  checkRefundAction,
  checkRefundRequest,
  financeKpis,
  formatJalali,
  formatToman,
  instalmentKey,
  lastContacts,
  paidAmount,
  refundEffects,
  rial,
  rialToToman,
  unpaidInstalments,
  type ContactOutcome,
  type DueInstalment,
  type FinanceKpis,
  type FinanceOrder,
  type RefundAction,
  type RefundActor,
  type RefundStatus,
} from '@edvora/core'
import type { Payload, PayloadRequest, Where } from 'payload'
import { canIn } from '../access/permissions'
import { writeAudit } from '../hooks/audit'
import type { Cohort, Course, FinanceContact, Order, Refund, Tenant, User } from '../payload-types'
import { idOf } from './ids'
import { notify } from './providers'
import type { Sheet } from './xlsx'

/**
 * Finance desk (E-023, ADR 021). Reads are tenant-filtered and run in server code that already checked the staff
 * session and permission; writes re-check tenant, permission and four-eyes (rules in `@edvora/core/finance`), go
 * through overrideAccess (the collections refuse all API writes) and leave an audit-log row.
 */

export class FinanceError extends Error {}

export type FinanceCtx = { tenant: Tenant; user: User; req: PayloadRequest }

export type FinanceActor = RefundActor & { canView: boolean; canExport: boolean }

export async function financeActor(s: FinanceCtx): Promise<FinanceActor> {
  const [canView, canRequest, canApprove, canExport] = await Promise.all(
    (['finance.view', 'refunds.request', 'refunds.approve', 'finance.export'] as const).map((k) => canIn(s.req, s.tenant.id, k)),
  )
  return { id: s.user.id, canView, canRequest, canApprove, canExport }
}

async function audit(s: FinanceCtx, entry: { action: string; collection: string; docId: number | string; note?: string; changes?: Record<string, { from: unknown; to: unknown }> }) {
  try {
    await writeAudit(s.req, { tenants: [s.tenant.id], ...entry })
  } catch (err) {
    // Same rule as payments: a missing audit row is logged loudly, it never hides the result from the person.
    console.error('[finance] audit failed', entry.action, entry.docId, err)
  }
}

// ---------------------------------------------------------------- Instalments

const MAX_ORDERS = 5000

const toFinanceOrder = (o: Order): FinanceOrder => ({
  id: o.id,
  status: o.status,
  source: o.source ?? null,
  userId: idOf(o.user)!,
  courseId: idOf(o.course),
  cohortId: idOf(o.cohort),
  instalments: (o.instalments ?? []).map((i) => ({ index: i.index, amount: i.amount, dueDate: i.dueDate, status: i.status, paidAt: i.paidAt })),
})

export type InstalmentRow = DueInstalment & {
  student: string
  phone: string | null
  course: string
  cohort: string | null
  lastContact: { at: string; outcome: ContactOutcome; note: string | null; by: string } | null
}

export type FinanceData = {
  kpis: FinanceKpis
  pendingConfirmations: number
  rows: InstalmentRow[]
  courses: { id: number; title: string }[]
  cohorts: { id: number; title: string; courseId: number | null }[]
  /** More open orders than one desk load reads. */
  capped: boolean
}

async function byIds<T extends { id: number }>(payload: Payload, collection: 'users' | 'courses' | 'cohorts', tenantId: number, ids: Iterable<number>): Promise<Map<number, T>> {
  const list = [...new Set(ids)]
  if (list.length === 0) return new Map()
  const where: Where = collection === 'users' ? { id: { in: list } } : { and: [{ id: { in: list } }, { tenant: { equals: tenantId } }] }
  const res = await payload.find({ collection, where, depth: 0, limit: list.length, pagination: false, overrideAccess: true })
  return new Map((res.docs as unknown as T[]).map((d) => [d.id, d]))
}

/**
 * Everything the overview, overdue and upcoming views need, in one tenant-filtered read: open orders, payments
 * waiting for a person (they mark instalments "awaiting review" and count as pending confirmations) and the last
 * contact note of each unpaid instalment. Closed orders are read only for "collected this month".
 */
export async function loadFinanceData(s: FinanceCtx, now = new Date()): Promise<FinanceData> {
  const payload = s.req.payload
  const t = s.tenant.id
  const monthAgo = new Date(now.getTime() - 32 * 24 * 60 * 60 * 1000).toISOString()
  const [open, recent, waiting] = await Promise.all([
    payload.find({ collection: 'orders', where: { and: [{ tenant: { equals: t } }, { status: { in: ['pending', 'partially_paid'] } }] }, depth: 0, limit: MAX_ORDERS, sort: 'id', overrideAccess: true }),
    // Paid orders that may have collected money this Jalali month (≤ 31 days ago); open ones are already in `open`.
    payload.find({ collection: 'orders', where: { and: [{ tenant: { equals: t } }, { status: { in: ['paid', 'refunded'] } }, { updatedAt: { greater_than_equal: monthAgo } }] }, depth: 0, limit: MAX_ORDERS, pagination: false, overrideAccess: true }),
    payload.find({ collection: 'payments', where: { and: [{ tenant: { equals: t } }, { status: { in: [...AWAITING_REVIEW] } }] }, depth: 0, limit: MAX_ORDERS, pagination: false, overrideAccess: true }),
  ])
  const awaiting = new Map<number, Set<number>>()
  for (const p of waiting.docs) {
    const oid = idOf(p.order)!
    const set = awaiting.get(oid) ?? new Set<number>()
    for (const i of p.instalmentIndexes ?? []) set.add(i)
    awaiting.set(oid, set)
  }
  const openOrders = open.docs.map(toFinanceOrder)
  const due = unpaidInstalments(openOrders, now, awaiting)
  const kpis = financeKpis({ orders: [...openOrders, ...recent.docs.map(toFinanceOrder)], rows: due, now })

  const orderIds = [...new Set(due.map((r) => r.orderId))]
  const [users, courses, cohorts, notes] = await Promise.all([
    byIds<User>(payload, 'users', t, due.map((r) => r.userId)),
    payload.find({ collection: 'courses', where: { tenant: { equals: t } }, depth: 0, limit: 500, pagination: false, sort: 'title', overrideAccess: true, select: { title: true } }),
    payload.find({ collection: 'cohorts', where: { tenant: { equals: t } }, depth: 0, limit: 1000, pagination: false, sort: '-startDate', overrideAccess: true, select: { title: true, course: true } }),
    orderIds.length
      ? payload.find({ collection: 'finance-contacts', where: { and: [{ tenant: { equals: t } }, { order: { in: orderIds } }] }, depth: 0, limit: 10_000, pagination: false, overrideAccess: true })
      : Promise.resolve({ docs: [] as FinanceContact[] }),
  ])
  const courseById = new Map(courses.docs.map((c) => [c.id, c as Pick<Course, 'id' | 'title'>]))
  const cohortById = new Map(cohorts.docs.map((c) => [c.id, c as Pick<Cohort, 'id' | 'title' | 'course'>]))
  const last = lastContacts(notes.docs.map((n) => ({ ...n, orderId: idOf(n.order)!, instalmentIndex: n.instalmentIndex })))
  const staff = await byIds<User>(payload, 'users', t, [...last.values()].map((n) => idOf(n.by)!).filter(Boolean))

  const rows: InstalmentRow[] = due.map((r) => {
    const u = users.get(r.userId)
    const n = last.get(instalmentKey(r.orderId, r.index))
    return {
      ...r,
      student: u?.name || u?.email || '—',
      phone: u?.phone ?? null,
      course: (r.courseId && courseById.get(r.courseId)?.title) || '—',
      cohort: (r.cohortId && cohortById.get(r.cohortId)?.title) || null,
      lastContact: n ? { at: n.at, outcome: n.outcome as ContactOutcome, note: n.note ?? null, by: staff.get(idOf(n.by)!)?.name ?? '—' } : null,
    }
  })
  return {
    kpis,
    pendingConfirmations: waiting.totalDocs,
    rows,
    courses: courses.docs.map((c) => ({ id: c.id, title: c.title })),
    cohorts: cohorts.docs.map((c) => ({ id: c.id, title: c.title, courseId: idOf(c.course) })),
    capped: open.totalDocs > open.docs.length,
  }
}

// ---------------------------------------------------------------- Contact notes

export async function recordContact(s: FinanceCtx, input: { orderId: number; instalmentIndex: number; outcome: ContactOutcome; note?: string }): Promise<void> {
  if (!(await canIn(s.req, s.tenant.id, 'finance.view'))) throw new FinanceError('نقش شما اجازهٔ این کار را ندارد.')
  const payload = s.req.payload
  const order = await payload.findByID({ collection: 'orders', id: input.orderId, depth: 0, overrideAccess: true, disableErrors: true })
  if (!order || idOf(order.tenant) !== s.tenant.id) throw new FinanceError('این سفارش در این آکادمی پیدا نشد.')
  if (!(order.instalments ?? []).some((i) => i.index === input.instalmentIndex)) throw new FinanceError('این قسط در سفارش نیست.')
  if (!(input.outcome in CONTACT_OUTCOMES)) throw new FinanceError('نتیجهٔ تماس را انتخاب کنید.')
  const doc = await payload.create({
    collection: 'finance-contacts',
    overrideAccess: true,
    data: { tenant: s.tenant.id, order: order.id, instalmentIndex: input.instalmentIndex, user: idOf(order.user)!, outcome: input.outcome, by: s.user.id, at: new Date().toISOString(), note: input.note || null },
  })
  await audit(s, { action: 'finance.contact.recorded', collection: 'finance-contacts', docId: doc.id, note: `order ${order.id} instalment ${input.instalmentIndex + 1}: ${input.outcome}` })
}

// ---------------------------------------------------------------- Refunds

async function orderRefundRows(payload: Payload, tenantId: number, orderId: number): Promise<Refund[]> {
  // depth 1: the order page shows who requested and approved.
  const res = await payload.find({ collection: 'refunds', where: { and: [{ tenant: { equals: tenantId } }, { order: { equals: orderId } }] }, sort: '-createdAt', depth: 1, limit: 200, pagination: false, overrideAccess: true })
  return res.docs
}

export type OrderRefundInfo = { paid: number; refundable: number; refunds: Refund[] }

export async function orderRefundInfo(payload: Payload, tenantId: number, order: Order): Promise<OrderRefundInfo> {
  const refunds = await orderRefundRows(payload, tenantId, order.id)
  const paid = paidAmount(order.instalments ?? [])
  const committed = refunds.filter((r) => r.status === 'requested' || r.status === 'approved' || r.status === 'refunded').reduce((n, r) => n + r.amount, 0)
  return { paid, refundable: Math.max(0, paid - committed), refunds }
}

async function loadOrder(s: FinanceCtx, orderId: number): Promise<Order> {
  const order = await s.req.payload.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true, disableErrors: true })
  if (!order || idOf(order.tenant) !== s.tenant.id) throw new FinanceError('این سفارش در این آکادمی پیدا نشد.')
  return order
}

export async function requestRefund(s: FinanceCtx, input: { orderId: number; amount: number; reason: string }): Promise<Refund> {
  const payload = s.req.payload
  const order = await loadOrder(s, input.orderId)
  const refunds = await orderRefundRows(payload, s.tenant.id, order.id)
  const actor = await financeActor(s)
  const d = checkRefundRequest({
    order: { status: order.status, source: order.source, studentId: idOf(order.user)!, paid: paidAmount(order.instalments ?? []) },
    refunds: refunds.map((r) => ({ amount: r.amount, status: r.status })),
    amount: input.amount,
    reason: input.reason,
    actor,
  })
  if (!d.ok) throw new FinanceError(d.reason === 'over_limit' && d.max !== undefined ? `${REFUND_REQUEST_ERRORS.over_limit} سقف: ${formatToman(d.max)}` : REFUND_REQUEST_ERRORS[d.reason])
  const now = new Date().toISOString()
  const doc = await payload.create({
    collection: 'refunds',
    overrideAccess: true,
    data: {
      tenant: s.tenant.id,
      order: order.id,
      user: idOf(order.user)!,
      course: idOf(order.course),
      cohort: idOf(order.cohort),
      amount: d.amount,
      full: d.full,
      status: 'requested',
      reason: input.reason.trim(),
      requestedBy: s.user.id,
      requestedAt: now,
    },
  })
  await audit(s, { action: 'refunds.requested', collection: 'refunds', docId: doc.id, note: `order ${order.id} ${formatToman(d.amount)}${d.full ? ' (full)' : ''}` })
  return doc
}

/** Compare-and-set on status, so two people clicking at once cannot both win. */
async function moveRefund(payload: Payload, id: number, from: RefundStatus | RefundStatus[], data: Partial<Refund>): Promise<Refund | null> {
  const res = await payload.update({
    collection: 'refunds',
    where: { and: [{ id: { equals: id } }, { status: Array.isArray(from) ? { in: from } : { equals: from } }] },
    data,
    overrideAccess: true,
    depth: 0,
  })
  return res.docs[0] ?? null
}

export async function refundAction(s: FinanceCtx, refundId: number, action: RefundAction, input: { reason?: string; reference?: string } = {}): Promise<RefundStatus> {
  const payload = s.req.payload
  const r = await payload.findByID({ collection: 'refunds', id: refundId, depth: 0, overrideAccess: true, disableErrors: true })
  if (!r || idOf(r.tenant) !== s.tenant.id) throw new FinanceError('این بازپرداخت پیدا نشد.')
  const actor = await financeActor(s)
  const d = checkRefundAction(action, { status: r.status, requestedBy: idOf(r.requestedBy), studentId: idOf(r.user)! }, actor, input)
  if (!d.ok) throw new FinanceError(REFUND_ACTION_ERRORS[d.reason])
  const now = new Date().toISOString()
  const wrong = () => new FinanceError(REFUND_ACTION_ERRORS.wrong_status)
  const change = (to: RefundStatus) => ({ status: { from: r.status, to } })

  switch (action) {
    case 'approve': {
      if (!(await moveRefund(payload, r.id, 'requested', { status: 'approved', approvedBy: s.user.id, approvedAt: now }))) throw wrong()
      await audit(s, { action: 'refunds.approved', collection: 'refunds', docId: r.id, changes: change('approved') })
      return 'approved'
    }
    case 'reject': {
      const text = (input.reason ?? '').trim()
      if (!(await moveRefund(payload, r.id, ['requested', 'approved'], { status: 'rejected', closedBy: s.user.id, closedAt: now, rejectionReason: text }))) throw wrong()
      await audit(s, { action: 'refunds.rejected', collection: 'refunds', docId: r.id, note: text, changes: change('rejected') })
      return 'rejected'
    }
    case 'cancel': {
      if (!(await moveRefund(payload, r.id, 'requested', { status: 'cancelled', closedBy: s.user.id, closedAt: now }))) throw wrong()
      await audit(s, { action: 'refunds.cancelled', collection: 'refunds', docId: r.id, changes: change('cancelled') })
      return 'cancelled'
    }
    case 'complete':
      return completeRefund(s, r, (input.reference ?? '').trim(), now)
  }
}

/**
 * Approved → refunded. Re-reads the order and checks the amount still fits what was paid (an instalment may have
 * changed since), then applies the core effects: a full refund closes the order, cancels the enrolment and frees
 * the cohort seat that the first payment took (mirror of `onFirstPayment`).
 */
async function completeRefund(s: FinanceCtx, r: Refund, reference: string, now: string): Promise<RefundStatus> {
  const payload = s.req.payload
  const order = await loadOrder(s, idOf(r.order)!)
  const all = await orderRefundRows(payload, s.tenant.id, order.id)
  const paid = paidAmount(order.instalments ?? [])
  const refundedBefore = all.filter((x) => x.status === 'refunded').reduce((n, x) => n + x.amount, 0)
  if (refundedBefore + r.amount > paid) throw new FinanceError(`${REFUND_REQUEST_ERRORS.over_limit} سقف: ${formatToman(rial(Math.max(0, paid - refundedBefore)))}`)
  const effects = refundEffects({ paid, refundedBefore, amount: r.amount })
  if (!(await moveRefund(payload, r.id, 'approved', { status: 'refunded', refundedBy: s.user.id, refundedAt: now, reference, full: effects.full }))) {
    throw new FinanceError(REFUND_ACTION_ERRORS.wrong_status)
  }
  await audit(s, { action: 'refunds.refunded', collection: 'refunds', docId: r.id, note: `order ${order.id} ${formatToman(rial(r.amount))} ref ${reference}${effects.full ? ' (full)' : ''}`, changes: { status: { from: 'approved', to: 'refunded' } } })

  if (effects.orderStatus) {
    await payload.update({ collection: 'orders', id: order.id, overrideAccess: true, data: { status: effects.orderStatus } })
    await audit(s, { action: 'orders.refunded', collection: 'orders', docId: order.id, changes: { status: { from: order.status, to: effects.orderStatus } } })
  }
  if (effects.cancelEnrollment) {
    const enr = await payload.find({
      collection: 'enrollments',
      where: { and: [{ tenant: { equals: s.tenant.id } }, { or: [{ order: { equals: order.id } }, { and: [{ user: { equals: idOf(order.user) } }, { course: { equals: idOf(order.course) } }] }] }, { status: { equals: 'active' } }] },
      depth: 0,
      limit: 5,
      overrideAccess: true,
    })
    for (const e of enr.docs) {
      await payload.update({ collection: 'enrollments', id: e.id, overrideAccess: true, data: { status: 'cancelled' } })
      await audit(s, { action: 'enrollments.cancelled_by_refund', collection: 'enrollments', docId: e.id, note: `refund ${r.id}` })
    }
    const cohortId = idOf(order.cohort)
    if (cohortId && enr.docs.length > 0) {
      const cohort = await payload.findByID({ collection: 'cohorts', id: cohortId, depth: 0, overrideAccess: true, disableErrors: true })
      if (cohort) await payload.update({ collection: 'cohorts', id: cohortId, overrideAccess: true, data: { seatsTaken: Math.max(0, (cohort.seatsTaken ?? 0) - 1) } })
    }
    // TODO(farjad): refund → XP / badges / certificate. No core rule exists yet (open gamification decision, ADR 014);
    // XP earned on a cancelled enrolment stays on the ledger until that is decided. See docs/agents/handoffs/E-023.md.
  }
  try {
    const user = await payload.findByID({ collection: 'users', id: idOf(order.user)!, depth: 0, overrideAccess: true })
    await notify(user.phone, `${s.tenant.name}: مبلغ ${formatToman(rial(r.amount))} از سفارش ${order.id} به شما بازگردانده شد. شمارهٔ پیگیری: ${reference}`, s.tenant.id)
  } catch (err) {
    console.error('[finance] refund notification failed', r.id, err)
  }
  return 'refunded'
}

export type RefundListRow = Refund & { studentName: string; courseTitle: string; requester: string; approver: string | null }

/** Refunds of the academy for the desk list: open ones first (oldest first), then the latest closed ones. */
export async function refundList(s: FinanceCtx, status: RefundStatus | null): Promise<RefundListRow[]> {
  const payload = s.req.payload
  const where: Where[] = [{ tenant: { equals: s.tenant.id } }]
  if (status) where.push({ status: { equals: status } })
  const res = await payload.find({ collection: 'refunds', where: { and: where }, sort: '-createdAt', depth: 0, limit: 200, pagination: false, overrideAccess: true })
  const users = await byIds<User>(payload, 'users', s.tenant.id, res.docs.flatMap((r) => [idOf(r.user), idOf(r.requestedBy), idOf(r.approvedBy)].filter((x): x is number => x !== null)))
  const courses = await byIds<Course>(payload, 'courses', s.tenant.id, res.docs.map((r) => idOf(r.course)).filter((x): x is number => x !== null))
  const open = (r: Refund) => r.status === 'requested' || r.status === 'approved'
  return res.docs
    .map((r) => ({
      ...r,
      studentName: users.get(idOf(r.user)!)?.name || users.get(idOf(r.user)!)?.email || '—',
      courseTitle: courses.get(idOf(r.course) ?? -1)?.title ?? '—',
      requester: users.get(idOf(r.requestedBy) ?? -1)?.name ?? '—',
      approver: idOf(r.approvedBy) ? (users.get(idOf(r.approvedBy)!)?.name ?? '—') : null,
    }))
    .sort((a, b) => Number(open(b)) - Number(open(a)) || (open(a) ? a.id - b.id : b.id - a.id))
}

// ---------------------------------------------------------------- Excel export

const EXPORT_MAX_ROWS = 20_000

const jalali = (v: string | null | undefined) => (v ? formatJalali(v, 'yyyy/MM/dd HH:mm') : '')
const jalaliDay = (v: string | null | undefined) => (v ? formatJalali(v, 'yyyy/MM/dd') : '')
const toman = (rials: number) => rialToToman(rial(rials))

/**
 * Payments (created in range), instalments (due in range) and refunds (requested in range) of this academy as
 * three sheets. Money in toman (and rials, exact), dates in Jalali (Tehran time). Caller checks `finance.export`.
 */
export async function financeExport(s: FinanceCtx, from: Date, to: Date): Promise<{ sheets: Sheet[]; counts: { payments: number; instalments: number; refunds: number } }> {
  const payload = s.req.payload
  const t = s.tenant.id
  const range = { greater_than_equal: from.toISOString(), less_than: to.toISOString() }
  const [payments, orders, refunds] = await Promise.all([
    payload.find({ collection: 'payments', where: { and: [{ tenant: { equals: t } }, { createdAt: range }] }, sort: 'createdAt', depth: 0, limit: EXPORT_MAX_ROWS, pagination: false, overrideAccess: true }),
    payload.find({ collection: 'orders', where: { and: [{ tenant: { equals: t } }, { 'instalments.dueDate': range }] }, sort: 'id', depth: 0, limit: EXPORT_MAX_ROWS, pagination: false, overrideAccess: true }),
    payload.find({ collection: 'refunds', where: { and: [{ tenant: { equals: t } }, { createdAt: range }] }, sort: 'createdAt', depth: 0, limit: EXPORT_MAX_ROWS, pagination: false, overrideAccess: true }),
  ])
  const userIds = [...payments.docs.map((p) => idOf(p.user)), ...orders.docs.map((o) => idOf(o.user)), ...refunds.docs.flatMap((r) => [idOf(r.user), idOf(r.requestedBy), idOf(r.approvedBy), idOf(r.refundedBy)])]
  const courseIds = [...payments.docs.map((p) => idOf(p.course)), ...orders.docs.map((o) => idOf(o.course)), ...refunds.docs.map((r) => idOf(r.course))]
  const [users, courses] = await Promise.all([
    byIds<User>(payload, 'users', t, userIds.filter((x): x is number => x !== null)),
    byIds<Course>(payload, 'courses', t, courseIds.filter((x): x is number => x !== null)),
  ])
  const name = (id: number | null) => (id === null ? '' : (users.get(id)?.name || users.get(id)?.email || String(id)))
  const course = (id: number | null) => (id === null ? '' : (courses.get(id)?.title ?? String(id)))

  const paymentSheet: Sheet = {
    name: 'پرداخت‌ها',
    rtl: true,
    columns: [
      { header: 'شناسه', width: 9 },
      { header: 'سفارش', width: 9 },
      { header: 'دانشجو', width: 24 },
      { header: 'دوره', width: 28 },
      { header: 'روش', width: 22 },
      { header: 'قسط‌ها', width: 10 },
      { header: 'مبلغ (تومان)', width: 16 },
      { header: 'مبلغ (ریال)', width: 16 },
      { header: 'وضعیت', width: 22 },
      { header: 'تاریخ ثبت', width: 18 },
      { header: 'تاریخ تأیید', width: 18 },
      { header: 'شمارهٔ مرجع', width: 20 },
    ],
    rows: payments.docs.map((p) => [
      p.id,
      idOf(p.order),
      name(idOf(p.user)),
      course(idOf(p.course)),
      p.methodTitle ?? p.method,
      (p.instalmentIndexes ?? []).map((i) => i + 1).join('، '),
      toman(p.amount),
      p.amount,
      PAYMENT_STATUS_LABELS[p.status].staff,
      jalali(p.createdAt),
      jalali(p.confirmedAt),
      p.refId || p.card?.tracking || p.manual?.reference || p.usdt?.txHash || '',
    ]),
  }

  const fromMs = from.getTime()
  const toMs = to.getTime()
  const instalmentRows = orders.docs.flatMap((o) =>
    (o.instalments ?? [])
      .filter((i) => {
        const d = new Date(i.dueDate).getTime()
        return d >= fromMs && d < toMs
      })
      .map((i) => [
        o.id,
        name(idOf(o.user)),
        course(idOf(o.course)),
        i.index + 1,
        toman(i.amount),
        i.amount,
        jalaliDay(i.dueDate),
        i.status === 'paid' ? 'پرداخت شده' : 'پرداخت نشده',
        jalali(i.paidAt),
        o.status,
      ]),
  )
  const instalmentSheet: Sheet = {
    name: 'اقساط',
    rtl: true,
    columns: [
      { header: 'سفارش', width: 9 },
      { header: 'دانشجو', width: 24 },
      { header: 'دوره', width: 28 },
      { header: 'قسط', width: 7 },
      { header: 'مبلغ (تومان)', width: 16 },
      { header: 'مبلغ (ریال)', width: 16 },
      { header: 'سررسید', width: 14 },
      { header: 'وضعیت قسط', width: 14 },
      { header: 'تاریخ پرداخت', width: 18 },
      { header: 'وضعیت سفارش', width: 14 },
    ],
    rows: instalmentRows,
  }

  const refundSheet: Sheet = {
    name: 'بازپرداخت‌ها',
    rtl: true,
    columns: [
      { header: 'شناسه', width: 9 },
      { header: 'سفارش', width: 9 },
      { header: 'دانشجو', width: 24 },
      { header: 'دوره', width: 28 },
      { header: 'مبلغ (تومان)', width: 16 },
      { header: 'مبلغ (ریال)', width: 16 },
      { header: 'کامل', width: 7 },
      { header: 'وضعیت', width: 24 },
      { header: 'دلیل', width: 36 },
      { header: 'درخواست‌کننده', width: 20 },
      { header: 'تاریخ درخواست', width: 18 },
      { header: 'تأییدکننده', width: 20 },
      { header: 'تاریخ واریز', width: 18 },
      { header: 'شمارهٔ پیگیری واریز', width: 20 },
    ],
    rows: refunds.docs.map((r) => [
      r.id,
      idOf(r.order),
      name(idOf(r.user)),
      course(idOf(r.course)),
      toman(r.amount),
      r.amount,
      r.full ? 'بله' : 'خیر',
      REFUND_STATUS_LABELS[r.status].label,
      r.reason,
      name(idOf(r.requestedBy)),
      jalali(r.requestedAt ?? r.createdAt),
      name(idOf(r.approvedBy)),
      jalali(r.refundedAt),
      r.reference ?? '',
    ]),
  }
  return { sheets: [paymentSheet, instalmentSheet, refundSheet], counts: { payments: payments.docs.length, instalments: instalmentRows.length, refunds: refunds.docs.length } }
}

/** Written BEFORE the file is sent; if the audit row cannot be written, the export is refused (personal data). */
export async function auditExport(s: FinanceCtx, note: string): Promise<void> {
  await writeAudit(s.req, { tenants: [s.tenant.id], action: 'finance.exported', collection: 'orders', docId: 'export', note })
}
