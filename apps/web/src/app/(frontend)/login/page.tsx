import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LoginForm } from '../../../components/LoginForm'
import { getCurrentUser } from '../../../lib/session'

export const metadata: Metadata = { title: 'ورود' }

type Props = { searchParams: Promise<{ next?: string }> }

export default async function LoginPage({ searchParams }: Props) {
  const raw = (await searchParams).next
  const next = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard'
  if (await getCurrentUser()) redirect(next)

  return (
    <div className="mx-auto max-w-md px-4 pt-16">
      <div className="rounded-3xl border border-line bg-surface p-8">
        <h1 className="text-2xl font-black">ورود / ثبت‌نام</h1>
        <p className="mb-6 mt-2 text-sm leading-7 text-muted">با شماره موبایل وارد شوید. رمز عبور لازم نیست.</p>
        <LoginForm next={next} />
      </div>
    </div>
  )
}
