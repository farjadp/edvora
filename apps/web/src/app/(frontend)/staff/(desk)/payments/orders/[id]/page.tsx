import { MANUAL_CHANNELS, formatJalali, formatToman, rial, rialToToman, toPersianDigits } from '@edvora/core'
import { EmptyState, Panel, Pill } from '@edvora/ui/console'
import { meets } from '@edvora/core/staff'
import type { Metadata } from 'next'
import { forbidden, notFound } from 'next/navigation'
import { DeskPage, PageHeader, consoleBtn } from '../../../../../../../components/staff/Desk'
import { RefundRequestForm } from '../../../../../../../components/staff/finance/FinanceForms'
import { RefundRow } from '../../../../../../../components/staff/finance/FinanceViews'
import { ManualPaymentForm } from '../../../../../../../components/staff/payments/PaymentForms'
import { financeActor, orderRefundInfo } from '../../../../../../../lib/finance'
import { PaymentCard } from '../../../../../../../components/staff/payments/ReviewQueue'
import { ORDER_STATUS, pill } from '../../../../../../../lib/consoleLabels'
import { docOf, idOf } from '../../../../../../../lib/ids'
import { orderPayments, staffActor } from '../../../../../../../lib/payments'
import { requireStaff } from '../../../../../../../lib/staff'
import type { Course, User } from '../../../../../../../payload-types'

export const metadata: Metadata = { title: 'پرداخت‌های سفارش' }

type Props = { params: Promise<{ id: string }> }

/** Per-order payment history (ADR 017 §8): every attempt, who recorded and confirmed it, and a manual-payment form. */
export default async function OrderPaymentsPage({ params }: Props) {
  const id = Number((await params).id)
  const s = await requireStaff(`/staff/payments/orders/${(await params).id}`, 'finance')
  if (!Number.isInteger(id) || id <= 0) notFound()
  if (!meets(s, { any: ['orders.view', 'finance.view', 'payments.manual.record', 'payments.manual.approve', 'refunds.request', 'refunds.approve'] })) forbidden()
  const payload = s.req.payload
  const order = await payload.findByID({ collection: 'orders', id, depth: 1, overrideAccess: true, disableErrors: true })
  if (!order || idOf(order.tenant) !== s.tenant.id) notFound()
  const [payments, actor, fin, refund] = await Promise.all([orderPayments(payload, s.tenant.id, id), staffActor(s), financeActor(s), orderRefundInfo(payload, s.tenant.id, order)])
  const st = pill(ORDER_STATUS, order.status)
  const back = `/staff/payments/orders/${id}`
  const legacy = order.payments ?? []

  return (
    <DeskPage desk="finance">
      <div className="grid min-w-0 gap-6" data-testid="order-payments">
        <PageHeader
          eyebrow="مالی"
          title={`پرداخت‌های سفارش ${toPersianDigits(id)}`}
          subtitle={`${docOf<User>(order.user)?.name ?? '—'} · ${docOf<Course>(order.course)?.title ?? ''} · ${formatToman(rial(order.total))}`}
          actions={
            <a href="/staff/finance" className={consoleBtn.secondary}>
              بازگشت به میز مالی
            </a>
          }
        />
        <Panel title="اقساط" headingId="h-inst" chip={<Pill tone={st.tone}>{st.label}</Pill>}>
          <ol className="grid gap-2 text-sm">
            {(order.instalments ?? []).map((i) => (
              <li key={i.index} className="flex flex-wrap justify-between gap-2 rounded-lg bg-sunken px-3 py-2" data-testid={`instalment-${i.index}`} data-status={i.status ?? 'pending'}>
                <span>
                  قسط {toPersianDigits(i.index + 1)} · سررسید {formatJalali(i.dueDate)}
                </span>
                <span className="font-bold">
                  {formatToman(rial(i.amount))} · {i.status === 'paid' ? `پرداخت شده${i.paidAt ? ` (${formatJalali(i.paidAt)})` : ''}` : 'پرداخت نشده'}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel title="تاریخچهٔ پرداخت‌ها" headingId="h-hist">
          <div className="grid gap-3">
            {payments.length === 0 && legacy.length === 0 ? <EmptyState icon="card" title="هنوز پرداختی برای این سفارش ثبت نشده است." /> : null}
            {payments.map((p) => (
              <PaymentCard key={p.id} p={p} actor={actor} back={back} showOrder={false} />
            ))}
            {legacy.length ? (
              <details className="rounded-xl border border-line p-4 text-sm">
                <summary className="cursor-pointer font-bold">تلاش‌های پرداخت پیش از روش‌های جدید ({toPersianDigits(legacy.length)})</summary>
                <ul className="mt-2 grid gap-1">
                  {legacy.map((l, n) => (
                    <li key={n}>
                      قسط {toPersianDigits((l.instalmentIndex ?? 0) + 1)} · {l.gatewayTitle || l.provider} · {formatToman(rial(l.amount))} · {l.status}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        </Panel>
        {refund.refunds.length > 0 || (fin.canRequest && refund.refundable > 0) ? (
          <Panel
            title="بازپرداخت"
            subtitle={`پرداخت‌شده: ${formatToman(rial(refund.paid))} · قابل بازپرداخت: ${formatToman(rial(refund.refundable))}`}
            headingId="h-refund"
          >
            <div className="grid gap-4">
              {refund.refunds.length ? (
                <ul className="grid gap-3">
                  {refund.refunds.map((r) => (
                    <RefundRow
                      key={r.id}
                      r={{
                        ...r,
                        studentName: docOf<User>(order.user)?.name ?? '—',
                        courseTitle: docOf<Course>(order.course)?.title ?? '—',
                        requester: (docOf<User>(r.requestedBy)?.name || docOf<User>(r.requestedBy)?.email) ?? '—',
                        approver: r.approvedBy ? ((docOf<User>(r.approvedBy)?.name || docOf<User>(r.approvedBy)?.email) ?? '—') : null,
                      }}
                      actor={fin}
                      back={`${back}#h-refund`}
                      showOrder={false}
                    />
                  ))}
                </ul>
              ) : null}
              {fin.canRequest && refund.refundable > 0 && !refund.refunds.some((r) => r.status === 'requested' || r.status === 'approved') && order.source !== 'import' ? (
                <RefundRequestForm orderId={id} maxToman={rialToToman(rial(refund.refundable))} maxLabel={formatToman(rial(refund.refundable))} />
              ) : null}
            </div>
          </Panel>
        ) : null}
        {actor.canRecord && order.source !== 'import' && (order.instalments ?? []).some((i) => i.status !== 'paid') ? (
          <Panel title="ثبت پرداخت دستی" subtitle="نقدی، کارت‌خوان یا واریز بانکی. تأیید نهایی با همکار دیگری است." headingId="h-manual">
            <ManualPaymentForm orderId={id} channels={Object.entries(MANUAL_CHANNELS).map(([value, label]) => ({ value, label }))} />
          </Panel>
        ) : null}
      </div>
    </DeskPage>
  )
}
