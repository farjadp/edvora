import { cx } from '@edvora/ui'
import type { ReactNode } from 'react'

/* ------------------------------------------------------------------ icons -- */

export type IconName = 'alert' | 'info' | 'lock' | 'eye' | 'eye-off' | 'arrow' | 'check' | 'phone' | 'pencil' | 'refresh' | 'wifi-off' | 'tool' | 'compass'

const PATHS: Record<IconName, ReactNode> = {
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.2M12 16v.2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8v.2" />
    </>
  ),
  lock: (
    <>
      <rect x="6" y="11" width="12" height="8" rx="1.5" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.2 5.7A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15 15 0 0 1-3 3.7M6.6 7.3A15 15 0 0 0 2.5 12S6 18.5 12 18.5c1.4 0 2.6-.3 3.7-.8" />
      <path d="M9.9 9.9a2.8 2.8 0 0 0 4 4" />
    </>
  ),
  /** Points to the visual end of a line in RTL (left). */
  arrow: <path d="M19 12H5M11 6l-6 6 6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  phone: <path d="M6.5 4h3l1.5 4-2 1.5a10 10 0 0 0 5.5 5.5L16 13l4 1.5v3a2 2 0 0 1-2 2A14 14 0 0 1 4.5 6a2 2 0 0 1 2-2z" />,
  pencil: <path d="M4 20l1-4L16.5 4.5a1.8 1.8 0 0 1 2.5 0l.5.5a1.8 1.8 0 0 1 0 2.5L8 19zM14.5 6.5l3 3" />,
  refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v3.8h-3.8" />,
  'wifi-off': (
    <>
      <path d="M3 3l18 18" />
      <path d="M5 10a10 10 0 0 1 4-2.2M19 10a10 10 0 0 0-5.5-2.8M8.5 13.5a5.5 5.5 0 0 1 2.5-1.2M15.5 13.5a5.5 5.5 0 0 0-1.5-1" />
      <path d="M12 17v.2" />
    </>
  ),
  tool: <path d="M14.5 6.5a4 4 0 0 0 4.8 4.8L9 21.5a2.2 2.2 0 0 1-3-3zM14.5 6.5l3-3 3 3-3 3" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </>
  ),
}

/** Thin round strokes: the Seal icon personality (matches E-027). */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={cx('size-5 shrink-0', className)}>
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

/** Eight-pointed star (two squares). */
export function starPoints(cx0: number, cy0: number, R: number): string {
  const pts: [number, number][] = []
  for (let k = 0; k < 16; k++) pts.push(pt(cx0, cy0, k % 2 === 0 ? R : R * 0.765, k * 22.5))
  return poly(pts)
}

function rosettePoints(cx0: number, cy0: number, R: number, teeth = 28): string {
  const pts: [number, number][] = []
  for (let k = 0; k < teeth * 2; k++) pts.push(pt(cx0, cy0, k % 2 === 0 ? R : R * 0.93, (k * 360) / (teeth * 2)))
  return poly(pts)
}

/* -------------------------------------------------------------- seal mark -- */

export type SealTone = 'brand' | 'on-brand' | 'ink'

/**
 * The academy mark: a toothed seal carrying the logo, or the first letter of the academy name when there is no logo.
 * `brand` = solid tenant colour (on paper), `on-brand` = paper-coloured (on a tenant-colour panel), `ink` = outline only.
 */
export function SealMark({
  name,
  logoUrl,
  logoAlt,
  tone = 'brand',
  className = 'size-16',
  stamp = false,
}: {
  name: string
  logoUrl?: string | null
  logoAlt?: string | null
  tone?: SealTone
  className?: string
  stamp?: boolean
}) {
  const teeth = tone === 'ink' ? 'fill-none stroke-ink' : tone === 'on-brand' ? 'fill-brand-ink' : 'fill-brand'
  const ring = tone === 'ink' ? 'stroke-ink' : tone === 'on-brand' ? 'stroke-brand' : 'stroke-brand-ink'
  const letter = tone === 'ink' ? 'text-ink' : tone === 'on-brand' ? 'text-brand' : 'text-brand-ink'
  return (
    <span className={cx('relative inline-grid shrink-0 place-items-center', className)}>
      <svg aria-hidden="true" viewBox="0 0 64 64" className={cx('size-full', stamp && 'e034-stamp')}>
        <polygon points={rosettePoints(32, 32, 31)} strokeWidth={tone === 'ink' ? 1.2 : 0} strokeLinejoin="round" className={teeth} />
        <circle cx="32" cy="32" r="23.5" fill="none" strokeWidth="0.9" className={ring} />
        <circle cx="32" cy="32" r="21" fill="none" strokeWidth="0.5" strokeDasharray="1.2 2" className={ring} />
      </svg>
      {logoUrl ? (
        <span className="absolute inset-[22%] grid place-items-center overflow-hidden rounded-full bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={logoAlt ?? name} className="size-full object-contain" />
        </span>
      ) : (
        <span aria-hidden="true" className={cx('absolute inset-0 grid place-items-center font-[family-name:var(--e-display)] text-[1.7em] font-black leading-none', letter)}>
          {name.slice(0, 1)}
        </span>
      )}
    </span>
  )
}

/* --------------------------------------------------------------- patterns -- */

/** Eight-point star lattice. Only ever laid over areas without text (or under a fade). */
export function GirihPattern({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={cx('pointer-events-none absolute inset-0 size-full', className)}>
      <defs>
        <pattern id="e034-girih" width="72" height="72" patternUnits="userSpaceOnUse">
          <polygon points={starPoints(36, 36, 30)} fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="miter" />
          <polygon points={starPoints(36, 36, 14)} fill="none" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="miter" />
          <path d="M0 0l7 7M72 0l-7 7M0 72l7-7M72 72l-7-7" stroke="currentColor" strokeWidth="1" fill="none" />
          <rect x="-5" y="-5" width="10" height="10" transform="rotate(45)" fill="none" stroke="currentColor" strokeWidth="0.8" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#e034-girih)" />
    </svg>
  )
}

/** Large outlined star, cut off by the panel edge. */
export function BigStar({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 200" className={cx('pointer-events-none absolute', className)}>
      <polygon points={starPoints(100, 100, 96)} fill="none" stroke="currentColor" strokeWidth="0.8" />
      <polygon points={starPoints(100, 100, 74)} fill="none" stroke="currentColor" strokeWidth="0.8" />
      <polygon points={starPoints(100, 100, 52)} fill="none" stroke="currentColor" strokeWidth="0.8" />
      <circle cx="100" cy="100" r="22" fill="none" stroke="currentColor" strokeWidth="0.8" />
    </svg>
  )
}

/** Banknote-style rosette: many hairline ellipses on one centre. Static, one inline SVG. */
export function Guilloche({ className, count = 36 }: { className?: string; count?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 400 400" className={cx('pointer-events-none', className)}>
      <g fill="none" stroke="currentColor" strokeWidth="0.55">
        {Array.from({ length: count }, (_, k) => (
          <ellipse key={k} cx="200" cy="200" rx="188" ry="64" transform={`rotate(${f((k * 180) / count)} 200 200)`} />
        ))}
        <circle cx="200" cy="200" r="196" />
        <circle cx="200" cy="200" r="190" strokeDasharray="1.5 3" />
        <circle cx="200" cy="200" r="70" />
        <circle cx="200" cy="200" r="46" />
        <polygon points={starPoints(200, 200, 40)} />
      </g>
    </svg>
  )
}

export function Star({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cx('size-3 shrink-0', className)}>
      <polygon points={starPoints(12, 12, 11)} fill="currentColor" />
    </svg>
  )
}

/** Hairline rule with a small star in the middle (certificate divider). */
export function StarRule({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cx('flex items-center gap-3 text-brand', className)}>
      <span className="h-px flex-1 bg-line-strong/60" />
      <Star />
      <span className="h-px flex-1 bg-line-strong/60" />
    </div>
  )
}

/** Fake QR code for the 2FA enrolment mock: an SVG of seeded squares, clearly a placeholder. */
export function QrPlaceholder({ className }: { className?: string }) {
  const n = 25
  const cells: ReactNode[] = []
  let seed = 7
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const finder = (x: number, y: number) => x < 8 && y < 8 ? true : x > n - 9 && y < 8 ? true : x < 8 && y > n - 9
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (finder(x, y)) continue
      if (rnd() > 0.52) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />)
    }
  const eye = (x: number, y: number) => (
    <g key={`e${x}${y}`}>
      <rect x={x} y={y} width="7" height="7" fill="currentColor" />
      <rect x={x + 1} y={y + 1} width="5" height="5" className="fill-white" />
      <rect x={x + 2} y={y + 2} width="3" height="3" fill="currentColor" />
    </g>
  )
  return (
    <svg role="img" aria-label="کد QR تأیید دومرحله‌ای" viewBox={`-1 -1 ${n + 2} ${n + 2}`} className={cx('bg-white text-black', className)}>
      <g fill="currentColor">{cells}</g>
      {eye(0, 0)}
      {eye(n - 7, 0)}
      {eye(0, n - 7)}
    </svg>
  )
}
