import type { ReactNode } from 'react'
import { cx } from './cx'

/*
 * Seal (مُهر) art for the login family (E-034, option B): seal mark, guilloche watermark, star rule, line icons.
 * Presentational and server-safe: no hooks, no data, no external assets. Every drawing is one small inline SVG in
 * currentColor, so the tenant colour comes from the text colour class the caller sets.
 */

/* ------------------------------------------------------------------ icons -- */

export type SealIconName = 'alert' | 'info' | 'lock' | 'eye' | 'eye-off' | 'check' | 'phone' | 'pencil' | 'refresh' | 'wifi-off' | 'compass'

const PATHS: Record<SealIconName, ReactNode> = {
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
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </>
  ),
}

/** Thin round-stroke line icon (the Seal icon personality). Decorative: always aria-hidden. */
export function SealIcon({ name, className }: { name: SealIconName; className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={cx('size-5 shrink-0', className)}>
      {PATHS[name]}
    </svg>
  )
}

/* ---------------------------------------------------------------- geometry -- */

const round = (n: number) => Math.round(n * 100) / 100
const polar = (cx0: number, cy0: number, r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180
  return [round(cx0 + r * Math.cos(a)), round(cy0 + r * Math.sin(a))]
}
const poly = (pts: [number, number][]) => pts.map((p) => p.join(',')).join(' ')

/** Eight-pointed girih star (two squares) as an SVG `points` string. */
export function starPoints(cx0: number, cy0: number, r: number): string {
  const pts: [number, number][] = []
  for (let k = 0; k < 16; k++) pts.push(polar(cx0, cy0, k % 2 === 0 ? r : r * 0.765, k * 22.5))
  return poly(pts)
}

/** Toothed seal edge as an SVG `points` string. */
export function rosettePoints(cx0: number, cy0: number, r: number, teeth = 28): string {
  const pts: [number, number][] = []
  for (let k = 0; k < teeth * 2; k++) pts.push(polar(cx0, cy0, k % 2 === 0 ? r : r * 0.93, (k * 360) / (teeth * 2)))
  return poly(pts)
}

/** Rotation angles (degrees) of the guilloche ellipses. Exported for non-Tailwind renderers (Payload admin). */
export function guillocheAngles(count = 36): number[] {
  return Array.from({ length: count }, (_, k) => round((k * 180) / count))
}

/* -------------------------------------------------------------- seal mark -- */

/**
 * The academy mark: a toothed seal in the tenant colour carrying the logo, or the first letter of the academy name when
 * there is no logo. The image keeps its alt text; the initial is decorative (the name is always printed next to it).
 */
export function SealMark({ name, logoUrl, logoAlt, className = 'size-16', stamp = false }: { name: string; logoUrl?: string | null; logoAlt?: string | null; className?: string; stamp?: boolean }) {
  return (
    <span className={cx('relative inline-grid shrink-0 place-items-center', className)}>
      <svg aria-hidden="true" focusable="false" viewBox="0 0 64 64" className={cx('size-full', stamp && 'seal-stamp')}>
        <polygon points={rosettePoints(32, 32, 31)} className="fill-brand" />
        <circle cx="32" cy="32" r="23.5" fill="none" strokeWidth="0.9" className="stroke-brand-ink" />
        <circle cx="32" cy="32" r="21" fill="none" strokeWidth="0.5" strokeDasharray="1.2 2" className="stroke-brand-ink" />
      </svg>
      {logoUrl ? (
        <span className="absolute inset-[22%] grid place-items-center overflow-hidden rounded-full bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element -- tenant upload, any size; no optimiser on the national network */}
          <img src={logoUrl} alt={logoAlt || name} className="size-full object-contain" />
        </span>
      ) : (
        <span aria-hidden="true" className="absolute inset-0 grid place-items-center font-display text-[1.7em] font-black leading-none text-brand-ink">
          {name.trim().slice(0, 1)}
        </span>
      )}
    </span>
  )
}

/* --------------------------------------------------------------- patterns -- */

/** Banknote-style rosette: hairline ellipses on one centre. Static, one inline SVG (< 10 KB rendered). */
export function Guilloche({ className, count = 36 }: { className?: string; count?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 400 400" className={cx('pointer-events-none', className)}>
      <g fill="none" stroke="currentColor" strokeWidth="0.55">
        {guillocheAngles(count).map((deg) => (
          <ellipse key={deg} cx="200" cy="200" rx="188" ry="64" transform={`rotate(${deg} 200 200)`} />
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

/** Small solid eight-point star. */
export function SealStar({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className={cx('size-3 shrink-0', className)}>
      <polygon points={starPoints(12, 12, 11)} fill="currentColor" />
    </svg>
  )
}

/** Hairline rule with a small star in the middle (certificate divider). */
export function StarRule({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cx('flex items-center gap-3 text-brand', className)}>
      <span className="h-px flex-1 bg-line-strong/60" />
      <SealStar />
      <span className="h-px flex-1 bg-line-strong/60" />
    </div>
  )
}
