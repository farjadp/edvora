/** Pure SVG geometry for the Seal components (E-028). No React, so it is unit-tested directly. */

const f = (n: number) => Math.round(n * 100) / 100

/** Point on a circle; `deg` 0 = top, clockwise. */
export function pointOnCircle(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180
  return [f(cx + r * Math.cos(a)), f(cy + r * Math.sin(a))]
}

const poly = (pts: readonly [number, number][]) => pts.map((p) => p.join(',')).join(' ')

/** Eight-pointed girih star (two squares). Outer radius R, inner vertices at 0.765 R. */
export function starPoints(cx: number, cy: number, R: number): string {
  const pts: [number, number][] = []
  for (let k = 0; k < 16; k++) pts.push(pointOnCircle(cx, cy, k % 2 === 0 ? R : R * 0.765, k * 22.5))
  return poly(pts)
}

/** Scalloped rosette: the badge (emblem) outline. */
export function rosettePoints(cx: number, cy: number, R: number, teeth = 28): string {
  const pts: [number, number][] = []
  for (let k = 0; k < teeth * 2; k++) pts.push(pointOnCircle(cx, cy, k % 2 === 0 ? R : R * 0.93, (k * 360) / (teeth * 2)))
  return poly(pts)
}

/** Percent for a ring: clamped to 0–100 and rounded. NaN and ±Infinity become 0 / 100 safely. */
export function clampPct(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

/** `stroke-dasharray` for a ring drawn with `pathLength={100}`. */
export function ringDash(value: number): string {
  return `${clampPct(value)} 100`
}
