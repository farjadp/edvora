import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BareAuthLayout } from '../../../../components/staff/BareAuthLayout'
import { ErrorText, btnPrimary, fieldInput, linkClass } from '../../../../components/staff/ui'
import { isActive, remainingFa } from '../../../../lib/sandbox/demoState'
import { demoRequest } from '../../../../lib/sandbox/guard'
import { getSelectedSandbox } from '../../../../lib/tenant'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'ورود به آکادمی آزمایشی', robots: { index: false, follow: false } }

const ERRORS: Record<string, string> = {
  invalid: 'نام کاربری یا رمز عبور درست نیست.',
  locked: 'ورود موقتاً بسته شده است. چند دقیقه بعد دوباره امتحان کنید.',
  rate: 'درخواست‌ها زیاد بود. کمی بعد دوباره تلاش کنید.',
}

type Props = { searchParams: Promise<{ error?: string }> }

/** Sandbox login (second device): username + password for either account, posts to a 303 route handler (ADR 005). */
export default async function DemoLoginPage({ searchParams }: Props) {
  if (!(await demoRequest())) notFound()
  const tenant = await getSelectedSandbox()
  // Server component redirect: allowed (ADR 005 is about server actions).
  if (!tenant || !isActive(tenant)) redirect('/demo?state=ended')
  const error = ERRORS[(await searchParams).error ?? '']
  return (
    <BareAuthLayout tenantName={tenant.name} title="ورود به آکادمی آزمایشی">
      <form method="post" action="/demo/api/login" className="grid gap-4">
        <p className="text-sm leading-7 text-muted">{remainingFa(tenant.expiresAt)} تا پایان این آکادمی آزمایشی.</p>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <label className="grid gap-2 text-sm font-bold">
          نام کاربری
          <input name="email" type="email" required autoComplete="username" dir="ltr" spellCheck={false} className={`${fieldInput} text-start font-latin`} />
        </label>
        <label className="grid gap-2 text-sm font-bold">
          رمز عبور
          <input name="password" type="password" required autoComplete="current-password" dir="ltr" className={`${fieldInput} text-start font-latin`} />
        </label>
        <button type="submit" className={btnPrimary(true)}>
          ورود
        </button>
        <p className="text-center text-sm">
          <a className={linkClass} href="/demo">
            صفحهٔ دمو
          </a>
        </p>
      </form>
    </BareAuthLayout>
  )
}
