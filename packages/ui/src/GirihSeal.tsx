import { useId } from 'react'
import { cx } from './cx'
import { starPoints } from './geometry'

export type SealProps = {
  /** `issued` = gold seal; `sealed` = dashed outline, the certificate is not released yet. */
  state?: 'issued' | 'sealed'
  /** Accessible name. Omit when the meaning is printed next to it (then it is decorative). */
  label?: string
  /** Size classes, e.g. `size-24`. */
  className?: string
  /** One sheen pass (1.2 s, CSS, `motion-safe`). The certificate finale only. */
  sheen?: boolean
}

/**
 * The certificate seal: an eight-pointed girih star in the milestone gold (option B's star on option A's chassis).
 * It is the only gold seal on a page. Colour is never the only signal: sealed state is dashed and carries a lock.
 */
export function Seal({ state = 'issued', label, className = 'size-24', sheen = false }: SealProps) {
  const id = useId()
  const a11y = label ? ({ role: 'img', 'aria-label': label } as const) : ({ 'aria-hidden': true } as const)
  const sealed = state === 'sealed'
  return (
    <svg viewBox="0 0 96 96" className={cx('shrink-0', className)} {...a11y}>
      {sealed ? (
        <>
          <polygon points={starPoints(48, 48, 44)} fill="none" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="miter" className="stroke-milestone" />
          <g fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="stroke-milestone">
            <rect x="38" y="46" width="20" height="14" rx="2.5" />
            <path d="M42 46v-5a6 6 0 0 1 12 0v5" />
          </g>
        </>
      ) : (
        <>
          <defs>
            <clipPath id={`${id}-star`}>
              <polygon points={starPoints(48, 48, 46)} />
            </clipPath>
          </defs>
          <polygon points={starPoints(48, 48, 46)} className="fill-milestone" />
          <polygon points={starPoints(48, 48, 34)} fill="none" strokeWidth="1.4" strokeLinejoin="miter" className="stroke-milestone-ink" />
          <circle cx="48" cy="48" r="21" fill="none" strokeWidth="1.2" className="stroke-milestone-ink" />
          <circle cx="48" cy="48" r="17.5" fill="none" strokeWidth="0.8" strokeDasharray="1.6 2.4" className="stroke-milestone-ink" />
          <path d="M39.5 48.5l6 6 11-12" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="stroke-milestone-ink" />
          {sheen ? (
            <g clipPath={`url(#${id}-star)`}>
              <rect x="0" y="0" width="22" height="96" className="fill-white/40 motion-safe:animate-e-sheen" />
            </g>
          ) : null}
        </>
      )}
    </svg>
  )
}
