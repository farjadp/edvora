import { toPersianDigits } from '@edvora/core'
import Link from 'next/link'

type Props = { searchParams: Promise<{ status?: string; order?: string }> }

const COPY = {
  paid: { title: 'پرداخت موفق بود', text: 'ثبت‌نام شما قطعی شد. پیامک تأیید برایتان ارسال شد.', tone: 'text-ok' },
  partial: { title: 'قسط اول پرداخت شد', text: 'ثبت‌نام شما قطعی شد. اقساط بعدی را از پنل خود پرداخت کنید؛ قبل از هر سررسید پیامک یادآوری می‌گیرید.', tone: 'text-ok' },
  failed: { title: 'پرداخت انجام نشد', text: 'اگر مبلغی از حساب شما کسر شده، طبق قوانین بانکی حداکثر تا ۷۲ ساعت بازمی‌گردد. می‌توانید دوباره تلاش کنید.', tone: 'text-danger' },
} as const

export default async function PaymentResultPage({ searchParams }: Props) {
  const { status, order } = await searchParams
  const copy = COPY[(status as keyof typeof COPY) ?? 'failed'] ?? COPY.failed

  return (
    <div className="mx-auto max-w-md px-4 pt-16 text-center">
      <div className="rounded-3xl border border-line bg-surface p-8">
        <h1 className={`text-2xl font-black ${copy.tone}`}>{copy.title}</h1>
        <p className="mt-3 leading-8 text-muted">{copy.text}</p>
        {order ? <p className="mt-2 text-xs text-muted">شماره سفارش: {toPersianDigits(order)}</p> : null}
        <Link href="/dashboard" className="mt-6 inline-block rounded-xl bg-brand px-6 py-3 font-bold text-brand-ink">
          رفتن به پنل من
        </Link>
      </div>
    </div>
  )
}
