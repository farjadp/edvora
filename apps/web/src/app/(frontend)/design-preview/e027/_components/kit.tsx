import { cx, focusRing } from '@edvora/ui'
import type { ReactNode } from 'react'
import type { OptionId } from '../_lib/options'
import { Icon, starPoints, type IconName } from './art'
import type { PathState } from '../_lib/data'

/** Display-face utility (the face is set per option in preview.css). */
export const disp = 'font-[family-name:var(--e-display)]'

/** Primary call-to-action, 48px+ tall. `tone="on-brand"` is for buttons that sit on the solid brand block. */
export function ctaClass(option: OptionId, tone: 'default' | 'on-brand' = 'default'): string {
  const base = cx('inline-flex min-h-12 items-center justify-center gap-2 px-6 font-bold transition-opacity hover:opacity-90', focusRing)
  if (tone === 'on-brand') return cx(base, 'min-h-14 rounded-lg bg-accent px-7 text-lg font-black text-accent-ink', disp)
  if (option === 'seal') return cx(base, 'rounded-md bg-brand text-brand-ink')
  if (option === 'girih') return cx(base, 'rounded-xl bg-brand text-brand-ink')
  return cx(base, 'min-h-14 rounded-lg bg-brand px-7 text-lg font-black text-brand-ink', disp)
}

export function secondaryClass(option: OptionId): string {
  return cx(
    'inline-flex min-h-12 items-center justify-center gap-2 border px-5 font-medium hover:bg-sunken',
    focusRing,
    option === 'seal' && 'rounded-md border-line-strong',
    option === 'girih' && 'rounded-xl border-line-strong',
    option === 'block' && 'rounded-lg border-2 border-ink font-bold',
  )
}

/** A surface card. One level only: never put a card inside a card. */
export function cardClass(option: OptionId): string {
  if (option === 'seal') return 'rounded-md border border-line bg-surface'
  if (option === 'girih') return 'rounded-2xl border border-line bg-surface'
  return 'rounded-2xl border-2 border-ink bg-surface'
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 md:px-8 md:pt-12">{children}</div>
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('text-sm font-bold text-muted', className)}>{children}</p>
}

/** Percent text with a Persian percent sign; the number is always visible next to rings. */
export function Pct({ children }: { children: ReactNode }) {
  return <span className={cx(disp, 'font-black tabular-nums')}>{children}</span>
}

/** Lesson tiles: 30 cells, done ones filled. Block option's progress bar. */
export function Segments({ done, total, on = 'surface', label }: { done: number; total: number; on?: 'surface' | 'brand'; label: string }) {
  return (
    <div role="img" aria-label={label} className="grid h-3 grid-flow-col auto-cols-[minmax(0,1fr)] gap-0.5">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cx(i < done ? (on === 'brand' ? 'bg-brand-ink' : 'bg-brand') : on === 'brand' ? 'bg-brand-ink/25' : 'bg-[var(--e-track)]')} />
      ))}
    </div>
  )
}

const WIDTH: Record<number, string> = { 40: 'w-[40%]', 85: 'w-[85%]' }
/** Fixed-value bar: widths are literal classes so no inline style is needed. */
export function FixedBar({ value, tone = 'brand', label, className }: { value: 40 | 85; tone?: 'brand' | 'gold' | 'ink'; label: string; className?: string }) {
  return (
    <div role="img" aria-label={label} className={cx('h-2 w-full overflow-hidden rounded-full bg-[var(--e-track)]', className)}>
      <div className={cx('e-wipe h-full rounded-full', WIDTH[value], tone === 'brand' && 'bg-brand', tone === 'gold' && 'bg-[var(--milestone)]', tone === 'ink' && 'bg-ink')} />
    </div>
  )
}

/* ------------------------------------------------------------ cert path -- */

type Step = { label: string; detail: string; state: PathState }

function StepNode({ option, state }: { option: OptionId; state: PathState }) {
  const icon: IconName = state === 'done' ? 'check' : state === 'sealed' ? 'lock' : state === 'current' ? 'half' : 'check'
  if (option === 'girih') {
    return (
      <span className="relative grid size-10 place-items-center">
        <svg aria-hidden="true" viewBox="0 0 32 32" className="absolute inset-0 size-full">
          <polygon
            points={starPoints(16, 16, 15)}
            strokeLinejoin="miter"
            strokeWidth={state === 'current' || state === 'sealed' ? 1.8 : 0}
            strokeDasharray={state === 'sealed' ? '3 2' : undefined}
            className={cx(
              state === 'done' && 'fill-brand',
              state === 'current' && 'fill-surface stroke-brand',
              state === 'todo' && 'fill-[var(--e-track)]',
              state === 'sealed' && 'fill-surface stroke-[var(--milestone)]',
            )}
          />
        </svg>
        {state !== 'todo' ? (
          <Icon
            name={icon}
            option="girih"
            className={cx('relative size-4', state === 'done' && 'text-brand-ink', state === 'current' && 'text-brand', state === 'sealed' && 'text-[var(--milestone)]')}
          />
        ) : null}
      </span>
    )
  }
  const shape = option === 'seal' ? 'rounded-full size-9' : 'rounded-none size-10'
  return (
    <span
      className={cx(
        'relative grid place-items-center',
        shape,
        option === 'seal' &&
          cx(
            state === 'done' && 'bg-ink text-bg',
            state === 'current' && 'border-2 border-brand bg-surface text-brand',
            state === 'todo' && 'border border-line-strong bg-surface text-transparent',
            state === 'sealed' && 'border border-dashed border-[var(--milestone)] bg-surface text-[var(--milestone)]',
          ),
        option === 'block' &&
          cx(
            state === 'done' && 'bg-ink text-bg',
            state === 'current' && 'bg-brand text-brand-ink',
            state === 'todo' && 'border-2 border-ink bg-surface text-transparent',
            state === 'sealed' && 'bg-[var(--milestone)] text-[var(--milestone-ink)]',
          ),
      )}
    >
      <Icon name={icon} option={option} className="size-4" />
    </span>
  )
}

/** Horizontal stepper to the certificate: درس‌ها · تکلیف‌ها · آزمون‌ها · دفاع · گواهی. Not a card inside a card. */
export function CertPath({ option, steps, remaining }: { option: OptionId; steps: readonly Step[]; remaining: string }) {
  return (
    <div>
      <ol className="grid grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.label} className="relative flex min-w-0 flex-col items-center gap-2 text-center">
            {i < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={cx(
                  'absolute start-1/2 top-[1.15rem] w-full',
                  option === 'block' ? 'h-1' : 'h-px',
                  s.state === 'done' ? 'bg-ink' : 'bg-line-strong',
                  option === 'girih' && 'top-5',
                )}
              />
            ) : null}
            <StepNode option={option} state={s.state} />
            <span className="px-0.5 text-xs font-bold leading-5 sm:text-sm">{s.label}</span>
            <span className="hidden text-xs text-muted sm:block">{s.detail}</span>
            <span className="sr-only">{s.state === 'done' ? 'انجام شد' : s.state === 'current' ? 'در جریان' : s.state === 'sealed' ? 'مهر می‌شود' : 'در انتظار'}</span>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-sm leading-7">{remaining}</p>
    </div>
  )
}

/** Gamification-OFF version of the path: a plain checklist, no gold, no lock teaser. */
export function CertChecklist({ option, steps, remaining }: { option: OptionId; steps: readonly Step[]; remaining: string }) {
  return (
    <div>
      <ul className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        {steps
          .filter((s) => s.state !== 'sealed')
          .map((s) => (
            <li key={s.label} className="flex items-center gap-3 border-b border-line py-3">
              <span
                aria-hidden="true"
                className={cx(
                  'grid size-6 shrink-0 place-items-center border-2',
                  option === 'seal' ? 'rounded-full' : option === 'girih' ? 'rounded-md' : 'rounded-none',
                  s.state === 'done' ? 'border-brand bg-brand text-brand-ink' : 'border-line-strong',
                )}
              >
                {s.state === 'done' ? <Icon name="check" option={option} className="size-4" /> : null}
              </span>
              <span className="font-bold">{s.label}</span>
              <span className="ms-auto text-sm text-muted">{s.detail}</span>
            </li>
          ))}
      </ul>
      <p className="mt-4 text-sm leading-7">{remaining}</p>
    </div>
  )
}
