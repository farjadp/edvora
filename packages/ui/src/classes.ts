import { cx } from './cx'

/**
 * Class helpers for native <button>/<a> and <input> elements, so forms and links that live in the app
 * (they are bound to server actions) still share one look. Pass extra classes for one-off tweaks.
 */

export type ButtonClassOptions = {
  /** Stretch to full width. */
  block?: boolean
  className?: string
}

/** Primary brand button: tenant colour, 48px tall, dims while disabled. */
export function buttonClass({ block = false, className }: ButtonClassOptions = {}): string {
  return cx(
    'h-12 rounded-xl bg-brand font-bold text-brand-ink transition-opacity hover:opacity-90 disabled:opacity-60',
    block && 'w-full',
    className,
  )
}

export type InputClassOptions = {
  /** Background: `bg` sits on a surface card, `surface` sits on the page background. */
  tone?: 'bg' | 'surface'
  /** `md` = 48px (default), `sm` = 44px with small text. */
  size?: 'md' | 'sm'
  block?: boolean
  className?: string
}

/** Text input with a brand-coloured focus border. */
export function inputClass({ tone = 'surface', size = 'md', block = false, className }: InputClassOptions = {}): string {
  return cx(
    size === 'sm' ? 'h-11 text-sm' : 'h-12',
    'rounded-xl border border-line px-4 outline-none focus:border-brand',
    tone === 'bg' ? 'bg-bg' : 'bg-surface',
    block && 'w-full',
    className,
  )
}
