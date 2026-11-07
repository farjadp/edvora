import { cx, focusRing } from '@edvora/ui'
import { SealIcon } from '@edvora/ui/seal'
import type { ReactNode, Ref } from 'react'

/*
 * Seal login kit (E-034, option B): class helpers and the static pieces every login screen shares.
 * Server-safe (no hooks). Interactive pieces live in ./fields.tsx. Copy rules: docs/ux/E-034-login.md §5.
 */

export function authInput(invalid = false): string {
  return cx(
    'block h-12 w-full rounded-sm border bg-bg px-3.5 text-base text-ink placeholder:text-muted focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-60',
    invalid ? 'border-danger focus:border-danger focus:ring-danger' : 'border-line-strong focus:border-focus focus:ring-focus',
  )
}

export const authPrimary = cx(
  'inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 font-bold text-brand-ink ring-1 ring-inset ring-brand-ink/30 outline-offset-4 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60',
  focusRing,
)

export const authSecondary = cx(
  'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-line-strong px-4 text-center font-medium text-ink transition-colors hover:bg-sunken disabled:opacity-60',
  focusRing,
)

/** Inline text link / button. Underlined in the brand colour; never colour-only. */
export const authLink = cx(
  'inline-flex min-h-11 items-center rounded-sm font-medium text-ink underline decoration-brand decoration-2 underline-offset-[6px] hover:decoration-4',
  focusRing,
)

/** Link inside a sentence (hints): no min height, wraps with the text. */
export const authInlineLink = cx('rounded-sm font-medium text-ink underline decoration-brand decoration-2 underline-offset-4 hover:decoration-4', focusRing)

/** Title block of a login card: optional tag, Morabba heading, sub line. */
export function AuthHeading({ title, sub, tag, headingRef, as: Tag = 'h1' }: { title: string; sub?: ReactNode; tag?: string; headingRef?: Ref<HTMLHeadingElement>; as?: 'h1' | 'h2' }) {
  return (
    <div className="text-center">
      {tag ? (
        <p className="mb-3 inline-flex items-center gap-2 border border-line-strong px-2.5 py-0.5 text-xs font-bold">
          <SealIcon name="lock" className="size-3.5" />
          {tag}
        </p>
      ) : null}
      <Tag ref={headingRef} tabIndex={-1} className="text-balance font-display text-2xl font-black leading-snug focus:outline-none md:text-3xl">
        {title}
      </Tag>
      {sub ? <p className="mt-3 text-pretty leading-8 text-muted">{sub}</p> : null}
    </div>
  )
}

/**
 * Error region: in the DOM from the first render (empty), filled on error so it is announced (spec §4).
 * One error at a time, no auto-dismiss. The word «خطا» + icon keep it from being colour-only.
 */
export function AuthAlert({ id, children, className }: { id?: string; children?: ReactNode; className?: string }) {
  return (
    <div role="alert" id={id} className={children ? cx('mb-5', className) : undefined}>
      {children ? (
        <div className="flex items-start gap-2.5 rounded-md border border-danger/60 bg-danger/10 py-3 pe-4 ps-3.5 leading-7">
          <SealIcon name="alert" className="mt-1 text-danger" />
          <p className="min-w-0">
            <strong className="text-danger">خطا.</strong> {children}
          </p>
        </div>
      ) : null}
    </div>
  )
}

/** Information line (session expired, code already sent). role=status, polite. */
export function AuthNotice({ children, icon = 'info' }: { children: ReactNode; icon?: 'info' | 'check' }) {
  return (
    <div role="status" className="mb-5 flex items-start gap-2.5 rounded-md border border-brand/40 bg-brand/10 py-3 pe-4 ps-3.5 leading-7">
      <SealIcon name={icon} className="mt-1" />
      <p className="min-w-0">{children}</p>
    </div>
  )
}

/** Lock banner without a countdown (S14, T6 today): announced once as an alert. */
export function LockBanner({ children, timer }: { children: ReactNode; timer?: ReactNode }) {
  return (
    <div role="alert" className="mb-5 rounded-md border-2 border-danger p-4">
      <p className="flex items-start gap-2.5 leading-7">
        <SealIcon name="lock" className="mt-1 text-danger" />
        <span>
          <strong className="text-danger">قفل.</strong> {children}
        </span>
      </p>
      {timer}
    </div>
  )
}

/** Academy support line (S15). Only rendered when the tenant has a contact phone. */
export function SupportLine({ label, phone }: { label: string; phone: string }) {
  return (
    <p className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line-strong p-3.5">
      <SealIcon name="phone" />
      <span className="text-sm">{label}</span>
      <a href={`tel:${phone.replace(/[^\d+۰-۹]/g, '')}`} dir="ltr" className={cx('rounded-sm font-bold tabular-nums underline underline-offset-4', focusRing)}>
        {phone}
      </a>
    </p>
  )
}

/** POST form-button that ends the session (route handler answers 303, ADR 005). */
export function AuthPostButton({ action, children }: { action: string; children: ReactNode }) {
  return (
    <form method="post" action={action}>
      <button type="submit" className={authSecondary}>
        {children}
      </button>
    </form>
  )
}
