'use client'

import { cx } from '@edvora/ui'
import { focusRing } from '@edvora/ui/classes'
import { useEffect, useState } from 'react'
import { btnPrimary } from './ui'

export type SecurityPromoCardProps = {
  /** Per-user key for the dismissal (localStorage). */
  userId: string
  href?: string
}

/** Dismissible nudge to turn on 2FA. Render only when 2FA is off and not required (server decides). */
export function SecurityPromoCard({ userId, href = '/staff/security' }: SecurityPromoCardProps) {
  const key = `staff-2fa-promo:${userId}`
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(key) !== '1')
    } catch {
      setVisible(true)
    }
  }, [key])

  if (!visible) return null

  const dismiss = () => {
    try {
      localStorage.setItem(key, '1')
    } catch {
      // Not remembered in private mode; fine.
    }
    setVisible(false)
  }

  return (
    <aside aria-label="امنیت حساب" className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-2xl border border-line border-s-4 border-s-accent bg-surface p-5">
      <p className="min-w-0 flex-1 basis-64 leading-7">
        <strong className="block">حساب خود را امن‌تر کنید.</strong>
        <span className="text-muted">تأیید دومرحله‌ای را روشن کنید.</span>
      </p>
      <div className="flex flex-wrap gap-3">
        <a href={href} className={btnPrimary()}>روشن‌کردن</a>
        <button
          type="button"
          onClick={dismiss}
          className={cx('inline-flex h-12 items-center rounded-xl px-5 font-bold text-ink hover:bg-sunken', focusRing)}
        >
          بعداً
        </button>
      </div>
    </aside>
  )
}
