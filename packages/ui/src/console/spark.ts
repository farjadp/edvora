/**
 * Sparkline shape (E-035). A line needs at least two days with something in them; one busy day among zeros would
 * otherwise draw a tall triangle that reads as a trend. Fewer: a flat baseline, a dot on the one day (if any), and
 * the caller shows «دادهٔ کافی برای روند نیست».
 */
export type SparkShape = { kind: 'line' } | { kind: 'flat'; dotAt: number | null }

export function sparkShape(values: readonly number[]): SparkShape {
  const busy: number[] = []
  values.forEach((v, i) => {
    if (Number.isFinite(v) && v !== 0) busy.push(i)
  })
  if (values.length >= 2 && busy.length >= 2) return { kind: 'line' }
  return { kind: 'flat', dotAt: busy[0] ?? null }
}

/** x position (0–100) of value i; time runs right to left in RTL (the first value sits at the right edge). */
export function sparkX(i: number, n: number, rtl: boolean): number {
  if (n <= 1) return rtl ? 100 : 0
  const t = i / (n - 1)
  return (rtl ? 1 - t : t) * 100
}
