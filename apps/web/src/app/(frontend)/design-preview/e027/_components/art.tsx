import { cx } from '@edvora/ui'
import type { ReactNode } from 'react'
import type { OptionId } from '../_lib/options'

/* ------------------------------------------------------------------ icons -- */

export type IconName = 'check' | 'play' | 'chevron' | 'half' | 'phone' | 'lock' | 'book' | 'target' | 'clock' | 'inbox'

const PATHS: Record<IconName, ReactNode> = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  play: <path d="M8 5.5v13l11-6.5z" />,
  chevron: <path d="M14.5 6l-6 6 6 6" />,
  half: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" />
    </>
  ),
  phone: <path d="M6.5 4h3l1.5 4-2 1.5a10 10 0 0 0 5.5 5.5L16 13l4 1.5v3a2 2 0 0 1-2 2A14 14 0 0 1 4.5 6a2 2 0 0 1 2-2z" />,
  lock: (
    <>
      <rect x="6" y="11" width="12" height="8" rx="1.5" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </>
  ),
  book: <path d="M4 5.5c3-1 5.5-.8 8 1 2.5-1.8 5-2 8-1v12c-3-1-5.5-.8-8 1-2.5-1.8-5-2-8-1zM12 6.5v12" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  inbox: <path d="M4 13l2.5-7h11L20 13v5H4zM4 13h5l1 2h4l1-2h5" />,
}

/** One stroke personality per option: thin & round (seal), angular (girih), heavy & square (block). */
const STROKE: Record<OptionId, { w: number; cap: 'round' | 'butt' | 'square'; join: 'round' | 'miter' }> = {
  seal: { w: 1.5, cap: 'round', join: 'round' },
  girih: { w: 1.9, cap: 'butt', join: 'miter' },
  block: { w: 3, cap: 'square', join: 'miter' },
}

export function Icon({ name, option, className }: { name: IconName; option: OptionId; className?: string }) {
  const s = STROKE[option]
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={s.w}
      strokeLinecap={s.cap}
      strokeLinejoin={s.join}
      className={cx('size-5 shrink-0', className)}
    >
      {PATHS[name]}
    </svg>
  )
}

/* ---------------------------------------------------------------- geometry -- */

const f = (n: number) => Math.round(n * 100) / 100
const pt = (cx0: number, cy0: number, r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180
  return [f(cx0 + r * Math.cos(a)), f(cy0 + r * Math.sin(a))]
}
const poly = (pts: [number, number][]) => pts.map((p) => p.join(',')).join(' ')

/** Eight-pointed star (two squares). Outer radius R, inner vertices at 0.765 R. */
export function starPoints(cx0: number, cy0: number, R: number): string {
  const pts: [number, number][] = []
  for (let k = 0; k < 16; k++) pts.push(pt(cx0, cy0, k % 2 === 0 ? R : R * 0.765, k * 22.5))
  return poly(pts)
}

function kitePoints(cx0: number, cy0: number, R: number, k: number): string {
  const tip = pt(cx0, cy0, R, k * 45)
  const left = pt(cx0, cy0, R * 0.765, k * 45 - 22.5)
  const right = pt(cx0, cy0, R * 0.765, k * 45 + 22.5)
  return poly([[cx0, cy0], left, tip, right])
}

function rosettePoints(cx0: number, cy0: number, R: number, teeth = 28): string {
  const pts: [number, number][] = []
  for (let k = 0; k < teeth * 2; k++) pts.push(pt(cx0, cy0, k % 2 === 0 ? R : R * 0.93, (k * 360) / (teeth * 2)))
  return poly(pts)
}

const PETAL_DELAY = [
  '[animation-delay:0ms]',
  '[animation-delay:90ms]',
  '[animation-delay:180ms]',
  '[animation-delay:270ms]',
  '[animation-delay:360ms]',
  '[animation-delay:450ms]',
  '[animation-delay:540ms]',
  '[animation-delay:630ms]',
]

/* -------------------------------------------------------------------- ring -- */

export type RingProps = {
  option: OptionId
  /** 0-100 */
  value: number
  /** Accessible name, e.g. «۴۰ درصد از دوره». The number is always also in visible text. */
  label: string
  /** Where the ring sits: on a surface or on the solid brand colour. */
  on?: 'surface' | 'brand'
  /** Size classes for the wrapper, e.g. `size-14`. */
  className?: string
  animate?: boolean
  children?: ReactNode
}

export function Ring({ option, value, label, on = 'surface', className = 'size-14', animate = true, children }: RingProps) {
  const body =
    option === 'girih' ? (
      <GirihRingSvg value={value} label={label} animate={animate} />
    ) : (
      <svg viewBox="0 0 64 64" role="img" aria-label={label} className="size-full">
        <g transform="rotate(-90 32 32)" fill="none">
          <circle
            cx="32"
            cy="32"
            r={option === 'block' ? 26 : 28}
            strokeWidth={option === 'block' ? 10 : 3}
            className={on === 'brand' ? 'stroke-brand-ink/30' : 'stroke-[var(--e-track)]'}
          />
          <circle
            cx="32"
            cy="32"
            r={option === 'block' ? 26 : 28}
            strokeWidth={option === 'block' ? 10 : 3}
            strokeLinecap={option === 'block' ? 'butt' : 'round'}
            pathLength={100}
            strokeDasharray={`${value} 100`}
            className={cx(on === 'brand' ? 'stroke-brand-ink' : 'stroke-brand', animate && 'e-sweep')}
          />
        </g>
      </svg>
    )
  return (
    <span className={cx('relative inline-grid shrink-0 place-items-center', className)}>
      {body}
      {children ? <span className="absolute inset-0 grid place-items-center">{children}</span> : null}
    </span>
  )
}

function GirihRingSvg({ value, label, animate }: { value: number; label: string; animate: boolean }) {
  const exact = (value / 100) * 8
  const whole = Math.floor(exact)
  const partial = exact - whole >= 0.1
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label={label} className="size-full">
      {Array.from({ length: 8 }, (_, k) => {
        const state = k < whole ? 'full' : k === whole && partial ? 'part' : 'empty'
        return (
          <polygon
            key={k}
            points={kitePoints(32, 32, 31, k)}
            strokeWidth="1.6"
            strokeLinejoin="miter"
            className={cx(
              'stroke-surface',
              state === 'full' && 'fill-brand',
              state === 'part' && 'fill-brand/40',
              state === 'empty' && 'fill-[var(--e-track)]',
              animate && state !== 'empty' && 'e-petal',
              animate && state !== 'empty' && PETAL_DELAY[k],
            )}
          />
        )
      })}
      <circle cx="32" cy="32" r="9" className="fill-surface" />
    </svg>
  )
}

/* ----------------------------------------------------------------- emblem -- */

export type EmblemProps = {
  option: OptionId
  icon?: IconName
  /** Accessible name; omit when the name is printed next to it. */
  label?: string
  className?: string
  animate?: boolean
  sheen?: boolean
}

/** The gold achievement mark (badge / level / certificate seal). One shape per option. */
export function Emblem({ option, icon = 'check', label, className = 'size-14', animate = false, sheen = false }: EmblemProps) {
  const a11y = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const }
  return (
    <span className={cx('relative inline-block shrink-0 overflow-hidden', option === 'block' ? 'rounded-none' : 'rounded-full', className)}>
      <svg viewBox="0 0 64 64" className={cx('size-full', animate && 'e-stamp')} {...a11y}>
        {option === 'seal' ? (
          <>
            <polygon points={rosettePoints(32, 32, 31)} className="fill-[var(--milestone)]" />
            <circle cx="32" cy="32" r="22" fill="none" strokeWidth="1" className="stroke-[var(--milestone-ink)]" />
            <circle cx="32" cy="32" r="19.5" fill="none" strokeWidth="0.6" strokeDasharray="1.5 2.2" className="stroke-[var(--milestone-ink)]" />
          </>
        ) : null}
        {option === 'girih' ? (
          <>
            <polygon points={starPoints(32, 32, 31)} className="fill-[var(--milestone)]" />
            <polygon points={starPoints(32, 32, 21)} fill="none" strokeWidth="1.2" strokeLinejoin="miter" className="stroke-[var(--milestone-ink)]" />
          </>
        ) : null}
        {option === 'block' ? (
          <>
            <polygon points={poly([pt(32, 32, 31, 0), pt(32, 32, 31, 60), pt(32, 32, 31, 120), pt(32, 32, 31, 180), pt(32, 32, 31, 240), pt(32, 32, 31, 300)])} className="fill-[var(--milestone)]" />
          </>
        ) : null}
      </svg>
      <Icon
        name={icon}
        option={option}
        className="absolute inset-0 m-auto size-[42%] text-[var(--milestone-ink)]"
      />
      {sheen ? (
        <span aria-hidden="true" className="e-sheen pointer-events-none absolute inset-y-0 start-0 w-1/3 bg-white/35" />
      ) : null}
    </span>
  )
}

/* ---------------------------------------------------------------- patterns -- */

/** Girih lattice: only ever placed over areas that carry no text. */
export function GirihPattern({ className, band = false }: { className?: string; band?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={cx(
        'pointer-events-none absolute text-brand',
        band ? 'inset-x-0 top-0 h-14 w-full opacity-[.22] [mask-image:linear-gradient(to_bottom,black,transparent)]' : 'inset-0 size-full',
        className,
      )}
    >
      <defs>
        <pattern id="e027-girih" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M8 8h24v24H8zM20 0l20 20-20 20L0 20z" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="20" cy="20" r="2.5" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#e027-girih)" />
    </svg>
  )
}

/** Concentric hairlines, like banknote guilloche. Seal option watermark. */
export function Guilloche({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 200" className={cx('pointer-events-none absolute text-brand', className)}>
      {Array.from({ length: 12 }, (_, i) => (
        <circle key={i} cx="100" cy="100" r={14 + i * 7.5} fill="none" stroke="currentColor" strokeWidth="0.6" />
      ))}
    </svg>
  )
}

/* ------------------------------------------------------------ week rhythm -- */

export type WeekDay = { short: string; full: string; done: boolean; today: boolean }

export function WeekDots({ option, days }: { option: OptionId; days: readonly WeekDay[] }) {
  return (
    <ol className="grid grid-cols-7 gap-1.5">
      {days.map((d) => (
        <li key={d.full} className="flex min-w-0 flex-col items-center gap-1.5">
          <span className="sr-only">{`${d.full}: ${d.done ? 'انجام شد' : d.today ? 'امروز' : 'هنوز نه'}`}</span>
          {option === 'seal' ? (
            <span
              aria-hidden="true"
              className={cx(
                'grid size-8 place-items-center rounded-full border',
                d.done ? 'border-ink bg-ink text-bg' : d.today ? 'border-2 border-brand text-brand' : 'border-line-strong text-transparent',
              )}
            >
              <Icon name="check" option="seal" className="size-4" />
            </span>
          ) : null}
          {option === 'girih' ? (
            <svg aria-hidden="true" viewBox="0 0 32 32" className="size-9">
              <polygon
                points={starPoints(16, 16, 15)}
                strokeWidth={d.today && !d.done ? 2 : 0}
                strokeLinejoin="miter"
                className={cx(d.done ? 'fill-brand' : d.today ? 'fill-surface stroke-brand' : 'fill-[var(--e-track)]')}
              />
              {d.done ? <path d="M10.5 16.5l3.8 3.8 7.2-7.6" fill="none" strokeWidth="2" className="stroke-brand-ink" /> : null}
            </svg>
          ) : null}
          {option === 'block' ? (
            <span
              aria-hidden="true"
              className={cx(
                'e-grow grid w-full max-w-9 place-items-start justify-items-center pt-1 text-accent',
                d.done ? 'h-14 bg-accent-ink' : d.today ? 'h-9 border-2 border-accent-ink' : 'h-9 bg-accent-ink/20',
              )}
            >
              {d.done ? <Icon name="check" option="block" className="size-4" /> : null}
            </span>
          ) : null}
          <span aria-hidden="true" className={cx('text-xs font-bold', option === 'block' ? '' : d.today ? 'text-ink' : 'text-muted')}>
            {d.short}
          </span>
        </li>
      ))}
    </ol>
  )
}
