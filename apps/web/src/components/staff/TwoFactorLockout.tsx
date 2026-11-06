'use client'

import { toPersianDigits } from '@edvora/core/digits'
import { useEffect, useState } from 'react'

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return toPersianDigits(`${mm}:${ss}`)
}

type Props = {
  /** Epoch milliseconds when the lock ends. */
  lockedUntil: number
  onExpire?: () => void
}

/** Lock message with a mm:ss countdown. The timer is not a live region, so screen readers are not spammed each second. */
export function TwoFactorLockout({ lockedUntil, onExpire }: Props) {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    let fired = false
    const tick = () => {
      const left = lockedUntil - Date.now()
      setRemaining(Math.max(0, left))
      if (left <= 0 && !fired) {
        fired = true
        onExpire?.()
      }
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [lockedUntil, onExpire])

  return (
    <div role="alert" className="grid gap-1 rounded-xl border border-danger bg-surface p-3 text-sm leading-7 text-danger">
      <p>چند بار کد اشتباه وارد شد. تا ۱۵ دقیقهٔ دیگر امکان ورود ندارید.</p>
      <p className="text-ink">
        زمان باقی‌مانده:{' '}
        <span role="timer" className="font-latin font-bold tabular-nums" dir="ltr">
          {remaining === null ? '' : formatCountdown(remaining)}
        </span>
      </p>
    </div>
  )
}

