'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { allowCelebration, dayKey, parseLedger, recordCelebration } from './celebrationBudget'
import { cx } from './cx'

const STORAGE_KEY = 'edvora:celebrations'
/** Celebrations shown in the current page view (resets when the path changes). */
const view = { path: '', shown: 0 }

export type CelebrationProps = {
  /** Stable id of the moment, e.g. `lesson:12`. The same id is never counted twice in a day. */
  id: string
  /** Render the moment. The container itself is always in the DOM, so a screen reader announces the injected text. */
  show: boolean
  /** One plain sentence for screen readers, no emoji: «این جلسه تکمیل شد. ده امتیاز اضافه شد.» */
  announce: string
  /** The visual (decorative: it is hidden from assistive tech, `announce` speaks instead). Put links/buttons outside. */
  children: ReactNode
  /** What to show when the budget is used up or motion is off: a quiet one-liner. Omit to show nothing. */
  quiet?: ReactNode
  /** Academy switch «جلوه‌های تبریک». Off = the quiet version only, no motion. */
  enabled?: boolean
  className?: string
}

/**
 * Inline celebration (never a modal, never steals focus). `role="status"` polite live region. Budget: 1 per view,
 * 3 per day (localStorage, try/catch). Animation is CSS only and `motion-safe`; reduced motion shows the final state.
 */
export function Celebration({ id, show, announce, children, quiet, enabled = true, className }: CelebrationProps) {
  const [mode, setMode] = useState<'idle' | 'full' | 'quiet'>('idle')
  const decided = useRef<string | null>(null)

  useEffect(() => {
    if (!show) {
      decided.current = null
      setMode('idle')
      return
    }
    if (decided.current === id) return
    decided.current = id
    if (!enabled) {
      setMode('quiet')
      return
    }
    if (view.path !== window.location.pathname) {
      view.path = window.location.pathname
      view.shown = 0
    }
    const day = dayKey(new Date())
    let ledger = parseLedger(null, day)
    try {
      ledger = parseLedger(window.localStorage.getItem(STORAGE_KEY), day)
    } catch {
      /* storage blocked: the per-view cap still holds */
    }
    if (!allowCelebration(ledger, id, view.shown)) {
      setMode('quiet')
      return
    }
    view.shown += 1
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recordCelebration(ledger, id)))
    } catch {
      /* ignore */
    }
    setMode('full')
  }, [show, id, enabled])

  return (
    <div role="status" aria-live="polite" aria-atomic="true" data-testid="celebration" data-celebration={mode} className={className}>
      {mode === 'full' ? (
        <>
          <span className="sr-only">{announce}</span>
          <div aria-hidden="true" className={cx(enabled && 'motion-safe:animate-e-rise')}>
            {children}
          </div>
        </>
      ) : null}
      {mode === 'quiet' ? (
        <>
          <span className="sr-only">{announce}</span>
          {quiet ? <div aria-hidden="true">{quiet}</div> : null}
        </>
      ) : null}
    </div>
  )
}
