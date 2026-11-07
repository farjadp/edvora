'use client'

import { classifyStaffLogin, looksLikePhone } from '@edvora/core/login'
import { useRef, useState, type FormEvent } from 'react'
import { AuthField, PasswordField, PrimaryButton } from '../auth/fields'
import { AuthAlert, AuthNotice, LockBanner, authInlineLink, authSecondary } from '../auth/kit'

export type StaffLoginError = 'invalid' | 'inactive' | 'locked' | 'network' | 'error'

const messages: Record<Exclude<StaffLoginError, 'locked'>, string> = {
  invalid: 'ایمیل یا رمز عبور درست نیست.',
  inactive: 'حساب شما غیرفعال است. با مدیر آکادمی تماس بگیرید.',
  network: 'اتصال برقرار نشد. اینترنت خود را بررسی و دوباره تلاش کنید.',
  error: 'مشکلی پیش آمد. دوباره تلاش کنید.',
}
/** T6. No time: Payload's lock response carries no `lockUntil` (BACKEND for a countdown). */
const LOCKED = 'ورود موقتاً بسته شده است. چند دقیقه بعد دوباره امتحان کنید.'

const NOTICES = {
  expired: 'نشست شما تمام شده است. دوباره وارد شوید.',
  out: 'از حساب خارج شدید.',
} as const
export type StaffLoginNotice = keyof typeof NOTICES

export type StaffLoginResult = { ok: true } | { ok: false; error: StaffLoginError }

export type StaffLoginFormProps = {
  /** Validated by the server: starts with /staff, never //. */
  next: string
  /** Shown on first render, e.g. «حساب غیرفعال» after a redirect from the guard. */
  initialError?: StaffLoginError
  /** T11 session expired (wired when `?next=` is present) or T12 signed out (needs `?out=1` from the logout route: not sent yet). */
  notice?: StaffLoginNotice
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
    const body: unknown = res.ok ? null : await res.json().catch(() => null)
    const outcome = classifyStaffLogin(res.status, body)
    return outcome === 'ok' ? { ok: true } : { ok: false, error: outcome }
  } catch {
    return { ok: false, error: 'network' }
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Staff sign-in (E2, E-034 option B). Same POST /api/users/login and field names; Payload decides everything. */
export function StaffLoginForm({ next, initialError, notice, studentLoginHref = '/login', onSubmit = payloadLogin }: StaffLoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<StaffLoginError | null>(initialError ?? null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [phoneHint, setPhoneHint] = useState(false)
  const [pending, setPending] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending) return
    const cleanEmail = email.trim()
    const isPhone = looksLikePhone(cleanEmail)
    const eErr = isPhone ? null : EMAIL_RE.test(cleanEmail) ? null : 'ایمیل را کامل بنویسید؛ مثل name@example.com.'
    const pErr = password ? null : 'رمز عبور را وارد کنید.'
    setPhoneHint(isPhone)
    setEmailError(eErr)
    setPasswordError(pErr)
    if (isPhone || eErr || pErr) {
      setError(null)
      ;(isPhone || eErr ? emailRef : passwordRef).current?.focus()
      return
    }
    setPending(true)
    setError(null)
    const r = await onSubmit(cleanEmail, password)
    if (r.ok) {
      // Full navigation keeps the academy's Host header (ADR 005); the guard then routes to verify/enrol if needed.
      window.location.assign(next)
      return
    }
    setPending(false)
    setError(r.error)
    if (r.error === 'invalid') {
      setPassword('')
      passwordRef.current?.focus()
    }
  }

  const showNotice = notice && !error
  return (
    <>
      {showNotice ? <AuthNotice>{NOTICES[notice]}</AuthNotice> : null}
      {error === 'locked' ? <LockBanner>{LOCKED}</LockBanner> : null}
      <form onSubmit={submit} aria-busy={pending || undefined} noValidate>
        <div className="grid gap-5">
          <AuthField
            id="staff-email"
            name="email"
            type="email"
            label="ایمیل"
            latin
            inputMode="email"
            autoComplete="username"
            placeholder="name@example.com"
            required
            value={email}
            onChange={(v) => {
              setEmail(v)
              setEmailError(null)
              setPhoneHint(false)
            }}
            readOnly={pending}
            error={emailError}
            invalid={phoneHint}
            hint={
              phoneHint ? (
                <>
                  اینجا ایمیل کارکنان لازم است. دانشجو هستید؟{' '}
                  <a href={studentLoginHref} className={authInlineLink}>
                    با شماره موبایل وارد شوید
                  </a>
                  .
                </>
              ) : undefined
            }
            describedBy="staff-alert"
            inputRef={emailRef}
          />
          <PasswordField
            id="staff-password"
            value={password}
            onChange={(v) => {
              setPassword(v)
              setPasswordError(null)
            }}
            readOnly={pending}
            error={passwordError}
            describedBy="staff-alert"
            inputRef={passwordRef}
          />
        </div>
        <div className="mt-5">
          <AuthAlert id="staff-alert">{error && error !== 'locked' ? messages[error] : null}</AuthAlert>
        </div>
        <PrimaryButton busy={pending}>{pending ? 'در حال ورود…' : 'ورود'}</PrimaryButton>
      </form>
      <p className="mt-5 text-sm leading-7 text-muted">رمز را فراموش کرده‌اید؟ از مدیر آکادمی بخواهید رمز تازه برایتان تعیین کند.</p>
      <div className="mt-6 grid gap-3">
        <a href={studentLoginHref} className={authSecondary}>
          دانشجو هستید؟ ورود با شماره موبایل
        </a>
      </div>
    </>
  )
}
