import { formatToman, rial } from '@edvora/core'
import { toPersianDigits as fa } from '@edvora/core/digits'
import { Icon } from '@edvora/ui'
import type { FinanceInbox } from '@edvora/core'
import { Card, btnSecondary } from './ui'

const KIND_LABEL = { to_verify: 'در انتظار بررسی', needs_attention: 'نیازمند توجه', overdue: 'سررسید گذشته' } as const

/** Finance inbox (G10): real counters, a calm zero state, nothing about amounts collected per person. */
export function FinanceDesk({ title, inbox, checkedAt, adminLink, orderHref }: { title: string; inbox: FinanceInbox; checkedAt: string; adminLink?: { label: string; href: string }; orderHref: boolean }) {
  return (
    <div data-testid="finance-desk" data-zero={inbox.zero} className="grid gap-6">
      <h1 className="font-display text-3xl font-black leading-tight md:text-4xl">{title}</h1>
      {inbox.zero ? (
        <Card className="max-w-2xl">
          <div data-testid="inbox-zero" className="flex items-start gap-4">
            <Icon name="check" className="mt-1 size-10 text-ok" />
            <div>
              <h2 className="font-display text-2xl font-black">همه‌چیز بررسی شده است.</h2>
              <p className="mt-1 leading-8 text-muted">پرداختی در انتظار بررسی نیست.</p>
              <p className="mt-3 text-sm text-muted">آخرین بررسی: {checkedAt}</p>
            </div>
          </div>
          {adminLink ? (
            <div className="mt-5">
              <a href={adminLink.href} className={btnSecondary()}>
                {adminLink.label} <span aria-hidden>↗</span>
              </a>
            </div>
          ) : null}
        </Card>
      ) : (
        <>
          <dl data-testid="inbox-counts" className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
            {(
              [
                ['to_verify', inbox.toVerify],
                ['needs_attention', inbox.needsAttention],
                ['overdue', inbox.overdue],
              ] as const
            ).map(([k, n]) => (
              <Card key={k} className="!p-5">
                <dt className="text-sm text-muted">{KIND_LABEL[k]}</dt>
                <dd data-testid={`inbox-${k}`} className="mt-1 font-display text-4xl font-black">
                  {fa(n)}
                </dd>
              </Card>
            ))}
          </dl>
          <ul data-testid="inbox-items" className="max-w-3xl divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {inbox.items.map((it) => (
              <li key={`${it.orderId}-${it.instalmentIndex}-${it.kind}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-4 sm:px-6">
                <p className="font-bold">
                  سفارش <span className="font-latin">{String(it.orderId)}</span> · قسط {fa(it.instalmentIndex + 1)}
                </p>
                <p className="text-sm text-muted">
                  {KIND_LABEL[it.kind]} · {formatToman(rial(it.amount))}
                </p>
                {orderHref && adminLink ? (
                  <a href={`/admin/collections/orders/${it.orderId}`} className="inline-flex min-h-11 items-center text-sm font-bold text-brand-text underline-offset-4 hover:underline">
                    بررسی سفارش <span aria-hidden>↗</span>
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">آخرین بررسی: {checkedAt}</p>
        </>
      )}
    </div>
  )
}
