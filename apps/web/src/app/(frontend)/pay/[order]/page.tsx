import { AWAITING_REVIEW, formatJalali, formatToman, rial, selectInstalments, toPersianDigits, type InstalmentPick } from '@edvora/core'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CardTransferForm, UsdtStartForm } from '../../../../components/pay/PayForms'
import { docOf } from '../../../../lib/ids'
import { getPayloadClient } from '../../../../lib/payload'
import { PaymentError, checkoutMethods, loadStudentOrder } from '../../../../lib/payments'
import { requireUser } from '../../../../lib/session'
import { getCurrentTenant } from '../../../../lib/tenant'
import type { Course } from '../../../../payload-types'

export const metadata: Metadata = { title: 'پرداخت', robots: { index: false } }

type Props = { params: Promise<{ order: string }>; searchParams: Promise<{ pick?: string; error?: string }> }

const box = 'rounded-3xl border border-line bg-surface p-6'

function Calm({ title, text, href = '/dashboard', cta = 'رفتن به پنل من' }: { title: string; text: string; href?: string; cta?: string }) {
  return (
    <div className="mx-auto max-w-md px-4 pt-16 text-center">
      <div className={box}>
        <h1 className="text-xl font-black">{title}</h1>
        <p className="mt-3 leading-8 text-muted">{text}</p>
        <Link href={href} className="mt-6 inline-block rounded-xl bg-brand px-6 py-3 font-bold text-brand-ink">
          {cta}
        </Link>
      </div>
    </div>
  )
}

/**
 * The order's payment page (ADR 017 §7): the amount due and only the academy's enabled methods, in its order.
 * Works for instalments: the next one, or everything left.
 */
export default async function PayPage({ params, searchParams }: Props) {
  const { order: raw } = await params
  const sp = await searchParams
  const orderId = Number(raw)
  if (!Number.isInteger(orderId) || orderId <= 0) notFound()
  const user = await requireUser(`/pay/${orderId}`)
  const [payload, tenant] = await Promise.all([getPayloadClient(), getCurrentTenant()])

  let order
  try {
    order = await loadStudentOrder(payload, tenant.id, user.id, orderId)
  } catch (err) {
    if (err instanceof PaymentError) return <Calm title="این سفارش قابل پرداخت نیست" text={err.message} />
    throw err
  }
  const course = await payload.findByID({ collection: 'courses', id: docOf<Course>(order.course)?.id ?? (order.course as number), depth: 0, overrideAccess: true, disableErrors: true })
  const pending = await payload.find({
    collection: 'payments',
    where: { and: [{ order: { equals: order.id } }, { status: { in: [...AWAITING_REVIEW] } }] },
    limit: 10,
    depth: 0,
    overrideAccess: true,
  })
  const awaiting = new Set(pending.docs.flatMap((p) => p.instalmentIndexes ?? []))
  const instalments = order.instalments ?? []
  const unpaid = instalments.filter((i) => i.status !== 'paid')
  if (unpaid.length === 0) return <Calm title="این سفارش تسویه شده است" text="همهٔ اقساط این سفارش پرداخت شده است. سپاس از شما." />

  const pick: InstalmentPick = sp.pick === 'all' && unpaid.length > 1 ? 'all' : 'next'
  const sel = selectInstalments(instalments, pick, awaiting)
  const methods = await checkoutMethods(payload, tenant.id)
  const next = unpaid.sort((a, b) => a.index - b.index)[0]!

  return (
    <div className="mx-auto max-w-2xl px-4 pb-20 pt-10">
      <p className="text-sm text-muted">سفارش {toPersianDigits(order.id)}</p>
      <h1 className="mt-1 font-display text-3xl font-black">{course?.title ?? 'پرداخت'}</h1>

      {sp.error ? (
        <p role="alert" className="mt-6 rounded-2xl bg-danger-wash p-4 text-sm leading-7 text-danger">
          اتصال به درگاه انجام نشد. پولی از حساب شما برداشته نشده است. دوباره تلاش کنید یا روش دیگری را انتخاب کنید.
        </p>
      ) : null}

      {pending.docs.length > 0 ? (
        <div className="mt-6 rounded-2xl bg-info-wash p-4 text-sm leading-7" data-testid="pay-awaiting">
          <p className="font-bold">پرداختی از شما در انتظار بررسی است.</p>
          <p className="text-muted">تا نتیجهٔ آن مشخص شود، لازم نیست همان قسط را دوباره پرداخت کنید.</p>
          {pending.docs.map((p) => (
            <Link key={p.id} href={`/payments/${p.id}`} className="mt-1 inline-block font-bold text-brand-text underline-offset-4 hover:underline">
              دیدن وضعیت پرداخت {toPersianDigits(p.id)}
            </Link>
          ))}
        </div>
      ) : null}

      <section className={`${box} mt-6`} aria-labelledby="due">
        <h2 id="due" className="text-sm text-muted">
          مبلغ قابل پرداخت
        </h2>
        <p className="mt-1 text-3xl font-black" data-testid="pay-amount">
          {sel.ok ? formatToman(sel.amount) : formatToman(rial(next.amount))}
        </p>
        <p className="mt-2 text-sm text-muted">
          {pick === 'all'
            ? `همهٔ ${toPersianDigits(unpaid.length)} قسط باقی‌مانده`
            : instalments.length > 1
              ? `قسط ${toPersianDigits(next.index + 1)} از ${toPersianDigits(instalments.length)} · سررسید ${formatJalali(next.dueDate)}`
              : 'پرداخت یکجا'}
        </p>
        {unpaid.length > 1 ? (
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <Link href={`/pay/${order.id}`} aria-current={pick === 'next' ? 'true' : undefined} className="rounded-xl border border-line-strong px-3 py-2 aria-[current=true]:border-brand aria-[current=true]:bg-brand aria-[current=true]:text-brand-ink">
              فقط قسط بعدی
            </Link>
            <Link href={`/pay/${order.id}?pick=all`} aria-current={pick === 'all' ? 'true' : undefined} className="rounded-xl border border-line-strong px-3 py-2 aria-[current=true]:border-brand aria-[current=true]:bg-brand aria-[current=true]:text-brand-ink">
              همهٔ اقساط باقی‌مانده
            </Link>
          </div>
        ) : null}
      </section>

      {!sel.ok ? null : methods.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-sunken p-4 text-sm leading-7 text-muted" data-testid="pay-no-methods">
          پرداخت آنلاین در این آکادمی فعلاً فعال نیست. برای پرداخت با پشتیبانی آکادمی تماس بگیرید.
        </p>
      ) : (
        <section className="mt-8 grid gap-4" aria-labelledby="methods">
          <h2 id="methods" className="text-lg font-black">
            روش پرداخت را انتخاب کنید
          </h2>
          {methods.map((m) => (
            <details key={String(m.ref)} className={`${box} group`} data-testid={`method-${m.key}`} open={methods.length === 1}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-bold">
                <span>{m.title}</span>
                <span aria-hidden className="text-muted transition-transform group-open:rotate-180">
                  ⌄
                </span>
              </summary>
              <div className="mt-4 grid gap-4">
                {m.instructions ? <p className="text-sm leading-7 text-muted">{m.instructions}</p> : null}
                {m.kind === 'gateway' ? (
                  <form action="/payments/start" method="post">
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="method" value={String(m.ref)} />
                    <input type="hidden" name="pick" value={pick === 'all' ? 'all' : 'next'} />
                    <p className="mb-3 text-sm leading-7 text-muted">به صفحهٔ امن بانک می‌روید و پس از پرداخت به همین سایت برمی‌گردید.</p>
                    <button className="h-12 w-full rounded-xl bg-brand font-bold text-brand-ink">پرداخت {formatToman(sel.amount)}</button>
                  </form>
                ) : null}
                {m.kind === 'card' && typeof m.ref === 'number' ? (
                  <>
                    <div className="grid gap-2">
                      <p className="text-sm leading-7">
                        مبلغ <strong>{formatToman(sel.amount)}</strong> را به {m.cards.length > 1 ? 'یکی از این کارت‌ها' : 'این کارت'} واریز کنید و سپس اطلاعات واریز را ثبت کنید:
                      </p>
                      {m.cards.map((c) => (
                        <div key={c.number} className="rounded-2xl bg-sunken p-4">
                          <p dir="ltr" className="text-end font-latin text-lg font-bold tracking-wider" data-testid="card-number">
                            {c.number}
                          </p>
                          <p className="mt-1 text-sm text-muted">
                            به نام {c.holder}
                            {c.bank ? ` · ${c.bank}` : ''}
                          </p>
                        </div>
                      ))}
                      <p className="text-xs leading-6 text-muted">کارشناسان مالی آکادمی واریز را بررسی و تأیید می‌کنند؛ نتیجه را در پنل خود و با پیامک می‌بینید.</p>
                    </div>
                    <CardTransferForm orderId={order.id} method={m.ref} pick={pick === 'all' ? 'all' : 'next'} cards={m.cards} />
                  </>
                ) : null}
                {m.kind === 'usdt' && typeof m.ref === 'number' ? (
                  <UsdtStartForm orderId={order.id} method={m.ref} pick={pick === 'all' ? 'all' : 'next'} networks={m.networks} />
                ) : null}
              </div>
            </details>
          ))}
        </section>
      )}
      <p className="mt-8 text-center text-sm">
        <Link href="/dashboard" className="text-muted underline-offset-4 hover:underline">
          بازگشت به پنل
        </Link>
      </p>
    </div>
  )
}
