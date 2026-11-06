import { cx } from './cx'
import { Icon } from './icons'

export type WeekRhythmState = 'met' | 'missed' | 'frozen' | 'neutral' | 'in_progress'

export type WeekRhythmItem = {
  key: string
  /** Jalali week label, already formatted (Persian digits). */
  label: string
  state: WeekRhythmState
}

const SR: Record<WeekRhythmState, string> = {
  met: 'هدف کامل شد',
  missed: 'هدف کامل نشد',
  frozen: 'فرصت جبران استفاده شد',
  neutral: 'جلسهٔ تازه‌ای نبود',
  in_progress: 'در جریان',
}

/**
 * The weekly rhythm: one mark per Jalali week, oldest first, the current week last. Calm by design: a week that was
 * missed is an empty circle, never a red cross. Every state has text for screen readers; shape differs, not only colour.
 */
export function WeekRhythm({ weeks, label = 'ریتم هفتگی', max = 8, className }: { weeks: readonly WeekRhythmItem[]; label?: string; max?: number; className?: string }) {
  const shown = weeks.slice(-max)
  return (
    <ol aria-label={label} data-testid="week-rhythm" className={cx('grid grid-flow-col auto-cols-[minmax(0,1fr)] items-center gap-1.5', className)}>
      {shown.map((w) => (
        <li key={w.key} data-week-state={w.state} className="flex min-w-0 justify-center">
          <span className="sr-only">{`${w.label}: ${SR[w.state]}`}</span>
          <span
            aria-hidden="true"
            className={cx(
              'grid aspect-square w-full max-w-9 place-items-center rounded-full',
              w.state === 'met' && 'bg-ink text-bg',
              w.state === 'in_progress' && 'border-2 border-brand bg-surface text-brand',
              w.state === 'frozen' && 'border border-brand bg-e-tint text-brand',
              w.state === 'missed' && 'border border-line-strong',
              w.state === 'neutral' && 'border border-dashed border-line-strong',
            )}
          >
            {w.state === 'met' ? <Icon name="check" className="size-[55%]" /> : null}
            {w.state === 'frozen' ? <Icon name="half" className="size-[55%]" /> : null}
            {w.state === 'in_progress' ? <span className="size-1.5 rounded-full bg-brand" /> : null}
          </span>
        </li>
      ))}
    </ol>
  )
}
