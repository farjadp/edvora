import { cx } from './cx'
import { Icon } from './icons'
import { ProgressRing } from './ProgressRing'

export type GoalRingProps = {
  done: number
  total: number
  /** Accessible name, e.g. «۵ از ۸ پیگیری امروز». */
  label: string
  /** Big text beside the ring, e.g. «۵ از ۸» (Persian digits, already formatted). Always visible. */
  valueText: string
  /** Small caption under it, e.g. «پیگیری انجام شد». */
  caption?: string
  className?: string
}

/**
 * Staff goal: a ring with the numbers always beside it. Counts only what the server confirms (recorded outcomes).
 * When the goal is complete the ring closes in `ok` green with a tick; nothing flashes.
 */
export function GoalRing({ done, total, label, valueText, caption, className }: GoalRingProps) {
  const complete = total > 0 && done >= total
  const pct = total > 0 ? (done / total) * 100 : 0
  return (
    <div className={cx('flex items-center gap-4', className)} data-goal-complete={complete}>
      <ProgressRing value={pct} label={label} tone={complete ? 'ok' : 'brand'} className="size-14">
        {complete ? <Icon name="check" className="size-5 text-ok" /> : null}
      </ProgressRing>
      <div className="min-w-0">
        <p data-testid="goal-count" className="font-display text-2xl font-black leading-tight">
          {valueText}
        </p>
        {caption ? <p className="text-sm text-muted">{caption}</p> : null}
      </div>
    </div>
  )
}
