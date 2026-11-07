'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CodeBoxes, LockCountdown, PrimaryButton, UnlockedStatus } from '../auth/fields'
import { AuthAlert, AuthPostButton } from '../auth/kit'
import { submitCode } from './twoFactorClient'
import type { CodeSubmit } from './twoFactorClient'
import { useCodeSubmit } from './useCodeSubmit'

const verifyCode = submitCode('verify')
const LOCK_TEXT = 'چند بار کد اشتباه وارد شد. تا ۱۵ دقیقهٔ دیگر امکان ورود ندارید.'

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

/** Per-session TOTP step (V1–V9). The page renders the heading; this is the card body. */
export function TwoFactorVerifyForm({ email, next, logoutHref, initialLockedUntil = null, onSubmit = verifyCode }: TwoFactorVerifyFormProps) {
  const s = useCodeSubmit(initialLockedUntil)
  const done = useRef(false)
  const codeRef = useRef<HTMLInputElement>(null)
  const [unlocked, setUnlocked] = useState(false)
  // Bumped after a failed attempt; focusing happens in an effect so it runs after React re-enables the field (V3).
  const [refocus, setRefocus] = useState(0)
  useEffect(() => {
    if (refocus > 0) codeRef.current?.focus()
  }, [refocus])
  const locked = s.lockedUntil !== null
  const { clearLock } = s
  const onExpire = useCallback(() => {
    clearLock()
    setUnlocked(true)
  }, [clearLock])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (locked || s.pending || done.current) return
    setUnlocked(false)
    const out = await s.run(onSubmit)
    if (out === 'ok') {
      done.current = true
      window.location.assign(next)
      return
    }
    setRefocus((n) => n + 1)
  }

  return (
    <>
      <p dir="ltr" className="mb-5 block truncate text-center font-latin text-sm font-bold">
        {email}
      </p>
      {s.lockedUntil !== null ? <LockCountdown text={LOCK_TEXT} lockedUntil={s.lockedUntil} onExpire={onExpire} /> : null}
      {unlocked && !locked ? <UnlockedStatus /> : null}
      <form onSubmit={submit} aria-busy={s.pending || undefined} noValidate>
        <CodeBoxes
          label="کد تأیید"
          length={6}
          value={s.code}
          onChange={s.setCode}
          disabled={locked || s.pending || done.current}
          invalid={Boolean(s.error)}
          hint={locked ? null : s.hint}
          describedBy="verify-alert"
          inputRef={codeRef}
        />
        <div className="mt-5">
          <AuthAlert id="verify-alert">{locked ? null : s.error}</AuthAlert>
        </div>
        <PrimaryButton busy={s.pending || done.current} disabled={locked}>
          {s.pending || done.current ? 'در حال بررسی…' : 'تأیید و ادامه'}
        </PrimaryButton>
      </form>
      <details className="mt-5 border-b border-line pb-3 text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          گوشی خود را ندارید؟
        </summary>
        <p className="leading-7 text-muted">از مدیر آکادمی بخواهید تأیید دومرحله‌ای حساب شما را بازنشانی کند.</p>
      </details>
      <div className="mt-6">
        <AuthPostButton action={logoutHref}>خروج از حساب</AuthPostButton>
      </div>
    </>
  )
}
