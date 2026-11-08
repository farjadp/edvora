import { MANUAL_CHANNELS, PAYMENT_STATUS_LABELS, formatJalali, formatToman, paymentActionsFor, rial, toPersianDigits, type PaymentActor } from '@edvora/core'
import { EmptyState, Panel, Pill } from '@edvora/ui/console'
import { docOf, idOf } from '../../../lib/ids'
import type { Order, Payment, User } from '../../../payload-types'
import { ReviewActions } from './PaymentForms'

const fa = (n: number | string) => toPersianDigits(String(n))
const who = (u: number | User | null | undefined) => docOf<User>(u)?.name || docOf<User>(u)?.email || '—'

/** One payment with its evidence, the people who handled it, and the actions this person may take. */
export function PaymentCard({ p, actor, back, showOrder = true }: { p: Payment; actor: PaymentActor; back: string; showOrder?: boolean }) {
  const label = PAYMENT_STATUS_LABELS[p.status]
  const actions = paymentActionsFor({ status: p.status, method: p.method, studentId: idOf(p.user)!, recordedBy: idOf(p.recordedBy) }, actor)
  const recorder = idOf(p.recordedBy)
  const receipt = idOf(p.card?.receipt)
  return (
    <article className="grid gap-3 rounded-xl border border-line p-4" data-testid={`payment-${p.id}`} data-status={p.status}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">
          {p.methodTitle} · {formatToman(rial(p.amount))}
        </p>
        <Pill tone={label.tone}>{label.staff}</Pill>
      </header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        {showOrder ? (
          <div>
            <dt className="text-muted">سفارش</dt>
            <dd>
              <a href={`/staff/payments/orders/${idOf(p.order)}`} className="font-bold text-brand-text underline-offset-4 hover:underline">
                {fa(idOf(p.order) ?? '')}
              </a>
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-muted">دانشجو</dt>
          <dd>{who(p.user)}</dd>
        </div>
        <div>
          <dt className="text-muted">قسط</dt>
          <dd>{(p.instalmentIndexes ?? []).map((i) => fa(i + 1)).join('، ')}</dd>
        </div>
        {p.card?.tracking ? (
          <>
            <div>
              <dt className="text-muted">پیگیری</dt>
              <dd className="font-latin" dir="ltr">
                {p.card.tracking}
              </dd>
            </div>
            <div>
              <dt className="text-muted">۴ رقم آخر · زمان</dt>
              <dd>
                <span className="font-latin">{p.card.last4}</span> · {p.card.paidAt ? formatJalali(p.card.paidAt, 'd MMM HH:mm') : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted">به کارت</dt>
              <dd className="font-latin" dir="ltr">
                {p.card.toCard}
              </dd>
            </div>
          </>
        ) : null}
        {p.usdt?.txHash ? (
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-muted">
              تتر {p.usdt.network?.toUpperCase()} · {p.usdt.display} USDT · {p.usdt.check}
            </dt>
            <dd className="break-all font-latin text-xs" dir="ltr">
              {p.usdt.txHash}
            </dd>
          </div>
        ) : null}
        {p.manual?.channel ? (
          <div>
            <dt className="text-muted">شیوه · مرجع</dt>
            <dd>
              {MANUAL_CHANNELS[p.manual.channel]} {p.manual.reference ? `· ${p.manual.reference}` : ''}
            </dd>
          </div>
        ) : null}
        {p.refId ? (
          <div>
            <dt className="text-muted">مرجع بانک</dt>
            <dd className="font-latin">{p.refId}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-muted">ثبت / بررسی اول</dt>
          <dd>{recorder ? who(p.recordedBy) : '—'}</dd>
        </div>
        {p.confirmedBy ? (
          <div>
            <dt className="text-muted">تأیید نهایی</dt>
            <dd>{who(p.confirmedBy)}</dd>
          </div>
        ) : null}
        {p.rejectionReason ? (
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-muted">دلیل رد</dt>
            <dd>{p.rejectionReason}</dd>
          </div>
        ) : null}
      </dl>
      {receipt ? (
        <a href={`/files/receipts/${receipt}`} target="_blank" rel="noopener" className="text-sm font-bold text-brand-text underline-offset-4 hover:underline">
          دیدن تصویر رسید
        </a>
      ) : null}
      {p.status === 'recorded' && recorder === actor.id ? <p className="text-xs text-muted">شما این پرداخت را ثبت کرده‌اید؛ تأیید نهایی با همکار دیگری است.</p> : null}
      <ReviewActions paymentId={p.id} actions={actions} back={back} />
    </article>
  )
}

/** Finance queue: payments that need a person (first check, then a different person's confirmation). */
export function ReviewQueue({ items, actor }: { items: readonly Payment[]; actor: PaymentActor }) {
  return (
    <Panel title="پرداخت‌های در انتظار بررسی" subtitle="کارت‌به‌کارت، ثبت دستی و تترهایی که بررسی خودکار نشدند. هر پرداخت را دو نفر بررسی و تأیید می‌کنند." headingId="h-review">
      <div data-testid="review-queue" className="grid gap-3">
        {items.length === 0 ? (
          <EmptyState icon="check" title="پرداختی در انتظار بررسی نیست." />
        ) : (
          items.map((p) => <PaymentCard key={p.id} p={p} actor={actor} back="/staff/finance" />)
        )}
      </div>
    </Panel>
  )
}

export const orderTitle = (o: Order) => `سفارش ${fa(o.id)}`
