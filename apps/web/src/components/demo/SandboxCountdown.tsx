'use client'

import { countdownTone, formatRemainingFa } from '@edvora/core/sandbox'
import { cx } from '@edvora/ui'
import { useEffect, useState } from 'react'

/**
 * Display only — the server decides expiry. First render uses the server's clock (no layout shift on hydrate, no
 * mismatch); afterwards it ticks with the browser clock corrected by the server offset. Fixed single-line height,
 * truncates on 360 px, logical spacing only (RTL). No close button.
 */
export function SandboxCountdown({ expiresAt, serverNow, contactHref }: { expiresAt: string; serverNow: number; contactHref: string }) {
  const end = new Date(expiresAt).getTime()
  const [left, setLeft] = useState(end - serverNow)

  useEffect(() => {
    const offset = serverNow - Date.now()
    const tick = () => {
      const ms = end - (Date.now() + offset)
      setLeft(ms)
      // The server decides what happens next (proxy → ended state).
      if (ms <= 0) window.location.assign('/demo?state=ended')
    }
    tick()
    const id = window.setInterval(tick, 15_000)
    return () => window.clearInterval(id)
  }, [end, serverNow])

  const tone = countdownTone(left)
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        'flex h-10 items-center justify-between gap-3 border-b px-4 text-sm',
        tone === 'normal' ? 'border-line bg-sunken text-ink' : 'border-accent bg-accent text-accent-ink',
      )}
    >
      <span className="min-w-0 truncate">
        {tone === 'normal'
          ? `آکادمی آزمایشی · ${formatRemainingFa(left)} تا پایان`
          : `${left < 60_000 ? 'کمتر از ۱ دقیقه' : `کمتر از ${formatRemainingFa(left)}`} مانده است. کارهایتان پس از پایان پاک می‌شود.`}
      </span>
      <a href={contactHref} className="shrink-0 font-bold underline underline-offset-4">
        درباره ادورا صحبت کنیم
      </a>
    </div>
  )
}
