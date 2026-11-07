import type { ReactNode } from 'react'
import { cx } from './cx'

export type IconName = 'check' | 'play' | 'chevron' | 'half' | 'phone' | 'lock' | 'book' | 'target' | 'clock' | 'inbox' | 'spark' | 'calendar'

const PATHS: Record<IconName, ReactNode> = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  play: <path d="M8 5.5v13l11-6.5z" />,
  chevron: <path d="M14.5 6l-6 6 6 6" />,
  half: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" />
    </>
  ),
  phone: <path d="M6.5 4h3l1.5 4-2 1.5a10 10 0 0 0 5.5 5.5L16 13l4 1.5v3a2 2 0 0 1-2 2A14 14 0 0 1 4.5 6a2 2 0 0 1 2-2z" />,
  lock: (
    <>
      <rect x="6" y="11" width="12" height="8" rx="1.5" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </>
  ),
  book: <path d="M4 5.5c3-1 5.5-.8 8 1 2.5-1.8 5-2 8-1v12c-3-1-5.5-.8-8 1-2.5-1.8-5-2-8-1zM12 6.5v12" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  inbox: <path d="M4 13l2.5-7h11L20 13v5H4zM4 13h5l1 2h4l1-2h5" />,
  spark: <path d="M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z" />,
  calendar: (
    <>
      <rect x="4.5" y="6" width="15" height="13" rx="1.5" />
      <path d="M4.5 10h15M9 4v4M15 4v4" />
    </>
  ),
}

/** Thin, round-capped line icons (the Seal personality). Decorative: pair with visible text. */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={cx('size-5 shrink-0', className)}>
      {PATHS[name]}
    </svg>
  )
}
