import { buttonClass, focusRing, inputClass } from '@edvora/ui/classes'
import { cx } from '@edvora/ui'
import type { ReactNode } from 'react'

/** Shared look for the staff screens. Presentational only. */
const flexCenter = 'inline-flex items-center justify-center gap-2 px-5 text-center'

export const btnPrimary = (block = false) => buttonClass({ block, className: flexCenter })
export const btnSecondary = (block = false) =>
  cx(
    'h-12 rounded-xl border border-line-strong bg-transparent font-bold text-ink transition-colors hover:bg-sunken disabled:opacity-60',
    flexCenter,
    focusRing,
    block && 'w-full',
  )
// Solid danger: --danger against --bg keeps AA in both themes (white on the light dark-mode red would not).
export const btnDanger = (block = false) =>
  cx(
    'h-12 rounded-xl bg-danger font-bold text-bg transition-opacity hover:opacity-90 disabled:opacity-60',
    flexCenter,
    focusRing,
    block && 'w-full',
  )
export const linkClass = cx('rounded-sm font-medium text-ink underline underline-offset-4 hover:text-brand', focusRing)
export const fieldInput = inputClass({ tone: 'bg', block: true })

/** Opaque card surface. Never nested inside another card. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-2xl border border-line bg-surface p-5 sm:p-7', className)}>{children}</div>
}

export function ErrorText({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} role="alert" className="rounded-xl border border-danger bg-surface p-3 text-sm leading-7 text-danger">
      {children}
    </p>
  )
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'ok' | 'warn' }) {
  return (
    <p
      className={cx(
        'rounded-xl border bg-sunken p-3 text-sm leading-7 text-ink',
        tone === 'ok' ? 'border-ok' : tone === 'warn' ? 'border-accent' : 'border-line',
      )}
    >
      {children}
    </p>
  )
}

/** POST form-button for ending the session (the logout route handler answers with a 303). */
export function PostButton({ action, children, className, primary = false }: { action: string; children: ReactNode; className?: string; primary?: boolean }) {
  return (
    <form method="post" action={action} className={className}>
      <button type="submit" className={primary ? btnPrimary(true) : btnSecondary(true)}>
        {children}
      </button>
    </form>
  )
}
