import type { ReactNode } from 'react'
import { cx } from './cx'
import { clampPct, ringDash } from './geometry'

export type ProgressRingProps = {
  /** 0–100. Computed on the server; clamped here. */
  value: number
  /** Accessible name, e.g. «۴۰ درصد از دوره». The number must also be in visible text next to the ring. */
  label: string
  /** Size classes for the fixed box (no layout shift), e.g. `size-14`. */
  className?: string
  tone?: 'brand' | 'milestone' | 'ok'
  /** Sweep once on mount (CSS only, `motion-safe`). */
  animate?: boolean
  /** Optional content centred in the ring. */
  children?: ReactNode
  /** `data-testid` on the wrapper (the value is in `data-ring-value`). */
  testId?: string
}

const STROKE = { brand: 'stroke-brand', milestone: 'stroke-milestone', ok: 'stroke-ok' } as const

/** Thin brand ring. Inline SVG, no images; the value is a `stroke-dasharray` on a 100-long path. */
export function ProgressRing({ value, label, className = 'size-14', tone = 'brand', animate = true, children, testId }: ProgressRingProps) {
  const pct = clampPct(value)
  return (
    <span data-ring-value={pct} data-testid={testId} className={cx('relative inline-grid shrink-0 place-items-center', className)}>
      <svg viewBox="0 0 64 64" role="img" aria-label={label} className="size-full">
        <g transform="rotate(-90 32 32)" fill="none">
          <circle cx="32" cy="32" r="28" strokeWidth="3" className="stroke-e-track" />
          {pct > 0 ? (
            <circle
              cx="32"
              cy="32"
              r="28"
              strokeWidth="3"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={ringDash(pct)}
              className={cx(STROKE[tone], animate && 'motion-safe:animate-e-sweep')}
            />
          ) : null}
        </g>
      </svg>
      {children ? <span className="absolute inset-0 grid place-items-center">{children}</span> : null}
    </span>
  )
}
