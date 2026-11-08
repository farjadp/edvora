import { PAYMENT_STATUS_LABELS, USDT_CHECK_MESSAGES, USDT_TOKENS, formatJalali, formatToman, rial, toPersianDigits } from '@edvora/core'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { UsdtHashForm } from '../../../../components/pay/PayForms'
import { idOf } from '../../../../lib/ids'
import { getPayloadClient } from '../../../../lib/payload'
import { studentPayment } from '../../../../lib/payments'
import { qrSvg } from '../../../../lib/qr'
import { requireUser } from '../../../../lib/session'
import { getCurrentTenant } from '../../../../lib/tenant'

export const metadata: Metadata = { title: 'وضعیت پرداخت', robots: { index: false } }
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

const TONE = { ok: 'text-ok', danger: 'text-danger', warn: 'text-warn', info: 'text-info', neutral: 'text-ink' } as const

/** A student's payment (ADR 017 §7): waiting, confirmed, rejected with the reason, or the Tether instructions. Calm Persian copy. */
export default async function PaymentStatusPage({ params }: Props) {
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const user = await requireUser(`/payments/${id}`)
  const [payload, tenant] = await Promise.all([getPayloadClient(), getCurrentTenant()])
  const p = await studentPayment(payload, tenant.id, user.id, id)
  if (!p) notFound()

  const label = PAYMENT_STATUS_LABELS[p.status]
  const orderId = idOf(p.order)
  const usdt = p.method === 'usdt' ? p.usdt : null
  const waitingChain = usdt && p.status === 'started'

  const copy: Record<typeof p.status, { title: string; text: string }> = {
    started: usdt
      ? { title: 'پرداخت با تتر', text: 'مبلغ دقیق را به آدرس زیر روی همین شبکه بفرستید، سپس شناسهٔ تراکنش را ثبت کنید.' }
      : { title: 'پرداخت ناتمام است', text: 'این پرداخت کامل نشد. می‌توانید از صفحهٔ پرداخت دوباره تلاش کنید.' },
    submitted: { title: 'پرداخت شما ثبت شد', text: 'کارشناسان مالی آکادمی آن را بررسی می‌کنند. نتیجه را همین‌جا و با پیامک می‌بینید. نیازی به پرداخت دوباره نیست.' },
    recorded: { title: 'پرداخت شما بررسی شد', text: 'یک کارشناس واریز را بررسی کرده و منتظر تأیید نهایی نفر دوم است. نیازی به پرداخت دوباره نیست.' },
    confirmed: { title: 'پرداخت تأیید شد', text: 'سپاس از شما. وضعیت سفارش و ثبت‌نام‌تان به‌روز شد.' },
    rejected: { title: 'پرداخت تأیید نشد', text: 'اگر فکر می‌کنید اشتباهی رخ داده، با پشتیبانی آکادمی تماس بگیرید. می‌توانید دوباره پرداخت کنید.' },
    failed: { title: 'پرداخت انجام نشد', text: 'از این پرداخت مبلغی به حساب آکادمی نرسید. اگر مبلغی از حساب شما کسر شده، طبق قوانین بانکی حداکثر تا ۷۲ ساعت بازمی‌گردد.' },
  }
  const c = copy[p.status]
  const failedUsdt = usdt && p.status === 'failed' && usdt.check?.startsWith('failed:')

  return (
    <div className="mx-auto max-w-lg px-4 pb-20 pt-12">
      <div className="rounded-3xl border border-line bg-surface p-7" data-testid="payment-status" data-status={p.status}>
        <p className="text-sm text-muted">
          پرداخت {toPersianDigits(p.id)} · {p.methodTitle}
        </p>
        <h1 className={`mt-2 text-2xl font-black ${TONE[label.tone]}`}>{c.title}</h1>
        <p className="mt-3 leading-8 text-muted">{c.text}</p>

        {p.status === 'rejected' && p.rejectionReason ? (
          <div className="mt-4 rounded-2xl bg-danger-wash p-4 text-sm leading-7" data-testid="rejection-reason">
            <p className="font-bold">دلیل:</p>
            <p>{p.rejectionReason}</p>
          </div>
        ) : null}
        {failedUsdt ? (
          <p className="mt-3 rounded-2xl bg-danger-wash p-4 text-sm leading-7" data-testid="usdt-failed">
            {USDT_CHECK_MESSAGES[(usdt?.check?.replace('failed: ', '') ?? '') as keyof typeof USDT_CHECK_MESSAGES] ?? 'تراکنش با این صورت‌حساب هم‌خوانی نداشت.'}
          </p>
        ) : null}

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-sunken p-3">
            <dt className="text-muted">مبلغ</dt>
            <dd className="mt-1 font-bold">{formatToman(rial(p.amount))}</dd>
          </div>
          <div className="rounded-xl bg-sunken p-3">
            <dt className="text-muted">وضعیت</dt>
            <dd className="mt-1 font-bold">{label.student}</dd>
          </div>
          <div className="col-span-2 rounded-xl bg-sunken p-3">
            <dt className="text-muted">ثبت</dt>
            <dd className="mt-1 font-bold">{formatJalali(p.createdAt, 'd MMMM yyyy، HH:mm')}</dd>
          </div>
        </dl>

        {waitingChain && usdt?.network && usdt.wallet ? (
          <section className="mt-6 grid gap-4" aria-labelledby="usdt-pay">
            <h2 id="usdt-pay" className="font-bold">
              مشخصات واریز تتر
            </h2>
            <div className="rounded-2xl border border-warn bg-warn-wash p-4 text-sm leading-7">
              فقط <strong>USDT</strong> روی شبکهٔ <strong className="font-latin">{USDT_TOKENS[usdt.network].label}</strong> بفرستید. ارسال روی شبکه یا توکن دیگر قابل بازگشت نیست. کارمزد شبکه را جدا در نظر بگیرید تا مبلغ کامل برسد.
            </div>
            <div className="grid gap-1">
              <p className="text-sm text-muted">مبلغ دقیق</p>
              <p dir="ltr" className="text-end font-latin text-2xl font-black" data-testid="usdt-amount">
                {usdt.display} USDT
              </p>
            </div>
            <div className="grid gap-1">
              <p className="text-sm text-muted">آدرس کیف پول آکادمی</p>
              <p dir="ltr" className="break-all rounded-xl bg-sunken p-3 text-start font-latin text-sm" data-testid="usdt-wallet">
                {usdt.wallet}
              </p>
            </div>
            <div className="mx-auto w-48 rounded-xl bg-white p-2" role="img" aria-label="کد QR آدرس کیف پول" dangerouslySetInnerHTML={{ __html: qrSvg(usdt.wallet) }} />
            {usdt.check?.startsWith('waiting') ? (
              <p role="status" className="rounded-2xl bg-info-wash p-4 text-sm leading-7">
                تراکنش شما ثبت شده و منتظر تأیید شبکه است{usdt.confirmations ? ` (${toPersianDigits(usdt.confirmations)} تأیید تاکنون)` : ''}. چند دقیقهٔ دیگر دوباره بررسی کنید.
              </p>
            ) : null}
            <UsdtHashForm paymentId={p.id} hasHash={Boolean(usdt.txHash)} placeholder={usdt.network === 'bep20' ? '0x…' : '64 hex characters'} />
          </section>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/dashboard" className="rounded-xl bg-brand px-5 py-3 font-bold text-brand-ink">
            رفتن به پنل من
          </Link>
          {orderId && (p.status === 'rejected' || p.status === 'failed') ? (
            <Link href={`/pay/${orderId}`} className="rounded-xl border border-line-strong px-5 py-3 font-bold">
              پرداخت دوباره
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}
