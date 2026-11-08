'use client'

import { countdownTone, formatRemainingFa } from '@edvora/core/sandbox'
import { cx } from '@edvora/ui'
import { useEffect, useState } from 'react'

/**
 * Display only — the server decides expiry. First render uses the server's clock (no layout shift on hydrate, no
 * mismatch); afterwards it ticks with the browser clock corrected by the server offset. Fixed single-line height,
 * wraps to two lines on 360 px inside a fixed-height bar, logical spacing only (RTL). No close button.
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
        // Fixed height per breakpoint (two lines on phones), so the tone change never moves the page (BUG-6).
        'flex h-14 items-center justify-between gap-3 border-b px-4 text-xs leading-5 sm:h-10 sm:text-sm',
        tone === 'normal' ? 'border-line bg-sunken text-ink' : 'border-accent bg-accent text-accent-ink',
      )}
    >
      <span className="line-clamp-2 min-w-0 sm:line-clamp-1">
        {tone === 'normal' ? (
          <>
            <span className="sm:hidden">{formatRemainingFa(left)} تا پایان دمو</span>
            <span className="hidden sm:inline">آکادمی آزمایشی · {formatRemainingFa(left)} تا پایان</span>
          </>
        ) : `${left < 60_000 ? 'کمتر از ۱ دقیقه' : `کمتر از ${formatRemainingFa(left)}`} مانده است. کارهایتان پس از پایان پاک می‌شود.`}
      </span>
      <a href={contactHref} className="shrink-0 font-bold underline underline-offset-4">
        <span className="sm:hidden">گفتگو با ادورا</span>
        <span className="hidden sm:inline">درباره ادورا صحبت کنیم</span>
      </a>
    </div>
  )
}
