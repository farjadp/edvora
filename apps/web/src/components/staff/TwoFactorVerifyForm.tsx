'use client'

import { useRef } from 'react'
import { CodeField } from './CodeField'
import { submitCode } from './twoFactorClient'
import type { CodeSubmit } from './twoFactorClient'
import { TwoFactorLockout } from './TwoFactorLockout'
import { useCodeSubmit } from './useCodeSubmit'
import { btnPrimary, Notice, PostButton } from './ui'

const verifyCode = submitCode('verify')

export type TwoFactorVerifyFormProps = {
  /** Account email shown as context. */
  email: string
  /** Where to go after success (must start with /staff; the server validates it). */
  next: string
  /** POST route handler that ends the Payload session (303). */
  logoutHref: string
  /** Epoch ms if the account is already locked when the page loads. */
  initialLockedUntil?: number | null
  /** Override the network call (previews, tests). Defaults to POST /api/users/2fa/verify. */
  onSubmit?: CodeSubmit
}

export function TwoFactorVerifyForm({ email, next, logoutHref, initialLockedUntil = null, onSubmit = verifyCode }: TwoFactorVerifyFormProps) {
  const s = useCodeSubmit(initialLockedUntil)
  const done = useRef(false)
  const locked = s.lockedUntil !== null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (locked || s.pending || done.current) return
    const out = await s.run(onSubmit)
    if (out === 'ok') {
      done.current = true
      window.location.assign(next)
    }
  }

  return (
    <div className="grid gap-5">
      <p className="text-sm leading-7">
        کد ۶‌رقمی را از برنامهٔ احراز هویت گوشی خود وارد کنید.
        <span className="mt-1 block break-all font-latin text-muted" dir="ltr">
          {email}
        </span>
      </p>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {s.lockedUntil !== null ? <TwoFactorLockout lockedUntil={s.lockedUntil} onExpire={s.clearLock} /> : null}
        <CodeField label="کد تأیید" value={s.code} onChange={s.setCode} disabled={locked || s.pending} error={s.error} />
        {s.hint ? <Notice>{s.hint}</Notice> : null}
        <button type="submit" disabled={locked || s.pending} className={btnPrimary(true)}>
          {s.pending ? 'در حال بررسی…' : 'تأیید و ادامه'}
        </button>
      </form>
      <details className="rounded-xl border border-line px-4 py-3 text-sm leading-7">
        <summary className="min-h-11 cursor-pointer py-2.5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          گوشی خود را ندارید؟
        </summary>
        <p className="pb-2 text-muted">از مدیر آکادمی بخواهید تأیید دومرحله‌ای حساب شما را بازنشانی کند.</p>
      </details>
      <PostButton action={logoutHref}>خروج از حساب</PostButton>
    </div>
  )
}
