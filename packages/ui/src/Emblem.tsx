import { cx } from './cx'
import { Icon, type IconName } from './icons'
import { rosettePoints } from './geometry'

export type EmblemProps = {
  icon?: IconName
  /** Accessible name; omit when the name is printed next to it. */
  label?: string
  className?: string
  /** Stamp in once (CSS, `motion-safe`). */
  animate?: boolean
  /** Not earned yet: a quiet outline, no gold (used inside the badge list). */
  locked?: boolean
}

/** The achievement mark for badges and level: a scalloped gold rosette. Never the certificate seal (that is `Seal`). */
export function Emblem({ icon = 'check', label, className = 'size-14', animate = false, locked = false }: EmblemProps) {
  const a11y = label ? ({ role: 'img', 'aria-label': label } as const) : ({ 'aria-hidden': true } as const)
  return (
    <span className={cx('relative inline-block shrink-0', animate && 'motion-safe:animate-e-stamp', className)}>
      <svg viewBox="0 0 64 64" className="size-full" {...a11y}>
        {locked ? (
          <polygon points={rosettePoints(32, 32, 31)} fill="none" strokeWidth="1.2" className="stroke-line-strong" />
        ) : (
          <>
            <polygon points={rosettePoints(32, 32, 31)} className="fill-milestone" />
            <circle cx="32" cy="32" r="22" fill="none" strokeWidth="1" className="stroke-milestone-ink" />
            <circle cx="32" cy="32" r="19.5" fill="none" strokeWidth="0.6" strokeDasharray="1.5 2.2" className="stroke-milestone-ink" />
          </>
        )}
      </svg>
      <Icon name={icon} className={cx('absolute inset-0 m-auto size-[42%]', locked ? 'text-muted' : 'text-milestone-ink')} />
    </span>
  )
}
