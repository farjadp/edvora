import { cx, focusRing } from '@edvora/ui'
import type { OptionId } from '../_lib/options'

/** Display face (Morabba) for headings and big numbers. */
export const disp = 'font-[family-name:var(--e-display)]'

/**
 * Input look per option. The structure (label above, hint/error below, ids) is identical;
 * A = boxed on paper, B = boxed, tinted, square-ish (sits on the card), C = hairline underline only.
 */
export function inputCls(o: OptionId, invalid = false): string {
  const base = 'block w-full text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none'
  if (o === 'c')
    return cx(
      base,
      'h-12 rounded-none border-0 border-b bg-transparent px-0 text-lg transition-colors focus:border-b-[3px]',
      invalid ? 'border-danger focus:border-danger' : 'border-line-strong focus:border-focus',
    )
  return cx(
    base,
    'h-12 border px-3.5 text-base focus:ring-1 focus:ring-focus',
    o === 'a' ? 'rounded-lg bg-surface' : 'rounded-sm bg-bg',
    invalid ? 'border-danger focus:border-danger focus:ring-danger' : 'border-line-strong focus:border-focus',
  )
}

export function primaryCls(o: OptionId): string {
  const base = cx('inline-flex w-full items-center font-bold bg-brand text-brand-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60', focusRing)
  if (o === 'a') return cx(base, 'h-12 justify-center gap-2 rounded-lg')
  if (o === 'b') return cx(base, 'h-12 justify-center gap-2 rounded-md ring-1 ring-inset ring-brand-ink/30 outline-offset-4')
  return cx(base, 'h-14 justify-between rounded-none px-5 text-lg')
}

export function secondaryCls(o: OptionId): string {
  const base = cx('inline-flex w-full items-center justify-center gap-2 font-medium text-ink transition-colors hover:bg-sunken disabled:opacity-60', focusRing)
  if (o === 'a') return cx(base, 'min-h-12 rounded-lg border border-line-strong px-4')
  if (o === 'b') return cx(base, 'min-h-12 rounded-md border border-line-strong px-4')
  return cx(base, 'min-h-12 rounded-none border-0 border-b border-ink px-0 hover:bg-transparent hover:border-b-2')
}

/** Small inline text link / button. Underlined; never colour-only. */
export const linkCls = cx('inline-flex min-h-11 items-center font-medium text-ink underline decoration-brand decoration-2 underline-offset-[6px] hover:decoration-4', focusRing)

/** Surface used by alerts etc. */
export function boxCls(o: OptionId): string {
  if (o === 'a') return 'rounded-lg border border-line-strong'
  if (o === 'b') return 'rounded-md border border-line-strong'
  return 'rounded-none border-0 border-s-4 border-ink ps-4'
}
