'use client'

import { useState } from 'react'
import { ErrorText, btnPrimary, fieldInput, linkClass } from './ui'

export type StaffLoginError = 'invalid' | 'inactive' | 'locked' | 'network' | 'error'

const messages: Record<StaffLoginError, string> = {
  invalid: 'ایمیل یا رمز عبور درست نیست.',
  inactive: 'حساب شما غیرفعال است. با مدیر آکادمی تماس بگیرید.',
  locked: 'ورود موقتاً بسته شده است. چند دقیقه بعد دوباره امتحان کنید.',
  network: 'اتصال برقرار نشد. اینترنت خود را بررسی و دوباره تلاش کنید.',
  error: 'مشکلی پیش آمد. دوباره تلاش کنید.',
}

export type StaffLoginResult = { ok: true } | { ok: false; error: StaffLoginError }

export type StaffLoginFormProps = {
  /** Validated by the server: starts with /staff, never //. */
  next: string
  /** Shown on first render, e.g. «حساب غیرفعال» after a redirect from the guard. */
  initialError?: StaffLoginError
  studentLoginHref?: string
  /** Override the login call (previews, tests). Defaults to POST /api/users/login. */
  onSubmit?: (email: string, password: string) => Promise<StaffLoginResult>
}

async function payloadLogin(email: string, password: string): Promise<StaffLoginResult> {
  try {
    const res = await fetch('/api/users/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (res.ok) return { ok: true }
    if (res.status === 429 || res.status === 423) return { ok: false, error: 'locked' }
    if (res.status === 403) return { ok: false, error: 'inactive' }
    if (res.status >= 500) return { ok: false, error: 'error' }
    return { ok: false, error: 'invalid' }
  } catch {
    return { ok: false, error: 'network' }
  }
}

export function StaffLoginForm({ next, initialError, studentLoginHref = '/login', onSubmit = payloadLogin }: StaffLoginFormProps) {
  const [error, setError] = useState<StaffLoginError | null>(initialError ?? null)
  const [pending, setPending] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending) return
    const data = new FormData(e.currentTarget)
    setPending(true)
    setError(null)
    const r = await onSubmit(String(data.get('email') ?? '').trim(), String(data.get('password') ?? ''))
    if (r.ok) {
      // Full navigation keeps the academy's Host header (ADR 005); the guard then routes to verify/enrol if needed.
      window.location.assign(next)
      return
    }
    setPending(false)
    setError(r.error)
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      {error ? <ErrorText>{messages[error]}</ErrorText> : null}
      <label className="grid gap-2 text-sm font-bold">
        ایمیل
        <input name="email" type="email" required autoComplete="username" dir="ltr" spellCheck={false} className={`${fieldInput} text-start font-latin`} />
      </label>
      <label className="grid gap-2 text-sm font-bold">
        رمز عبور
        <input name="password" type="password" required autoComplete="current-password" dir="ltr" className={`${fieldInput} text-start font-latin`} />
      </label>
      <button type="submit" disabled={pending} className={btnPrimary(true)}>
        {pending ? 'در حال ورود…' : 'ورود'}
      </button>
      <p className="text-center text-sm">
        <a href={studentLoginHref} className={linkClass}>دانشجو هستید؟ ورود با شماره موبایل</a>
      </p>
    </form>
  )
}
