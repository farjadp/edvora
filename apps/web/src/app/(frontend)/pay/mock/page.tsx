import { formatToman, rial } from '@edvora/core'
import { notFound } from 'next/navigation'
import { env } from '../../../../env'
import { getRequestOrigin } from '../../../../lib/origin'

/** Simulated bank page for the mock gateway. Only exists when PAYMENT_PROVIDER=mock. */
type Props = { searchParams: Promise<{ authority?: string; amount?: string; callback?: string }> }

export default async function MockGatewayPage({ searchParams }: Props) {
  if (env().PAYMENT_PROVIDER !== 'mock') notFound()
  const { authority = '', amount = '0', callback = '' } = await searchParams

  // Only allow callbacks to this same academy site.
  const origin = await getRequestOrigin()
  let cb: URL
  try {
    cb = new URL(callback)
  } catch {
    notFound()
  }
  if (cb.origin !== origin || cb.pathname !== '/payments/callback') notFound()
  const link = (status: 'OK' | 'NOK') => {
    const u = new URL(cb)
    u.searchParams.set('Authority', authority)
    u.searchParams.set('Status', status)
    return u.toString()
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-16">
      <div className="rounded-3xl border-2 border-dashed border-accent bg-surface p-8 text-center">
        <p className="text-xs font-bold text-accent">درگاه آزمایشی — پولی جابه‌جا نمی‌شود</p>
        <p className="mt-4 text-sm text-muted">مبلغ قابل پرداخت</p>
        <p className="mt-1 text-3xl font-black">{formatToman(rial(Number(amount) || 0))}</p>
        <p dir="ltr" className="mt-2 font-latin text-xs text-muted">{authority}</p>
        <div className="mt-8 grid gap-3">
          <a href={link('OK')} className="rounded-xl bg-ok py-3 font-bold text-white">پرداخت موفق</a>
          <a href={link('NOK')} className="rounded-xl border border-line py-3 font-bold">انصراف از پرداخت</a>
        </div>
      </div>
    </div>
  )
}
