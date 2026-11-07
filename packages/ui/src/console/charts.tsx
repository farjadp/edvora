/**
 * Dependency-free SVG charts (E-035). Colours come from presentation attributes with var(--c-*) so the same
 * components render in /staff (Tailwind) and in Payload's admin (no Tailwind). Every chart has a text alternative.
 */
export type ChartTone = 1 | 2 | 3 | 4 | 5
const col = (t: ChartTone) => `var(--c-chart-${t})`

export type SparklineProps = {
  values: readonly number[]
  tone?: ChartTone
  /** Text alternative, e.g. «روند ۷ روز گذشته». */
  label: string
  className?: string
  /** Time flows right to left (default, the console is RTL): the first value is drawn at the right edge. */
  rtl?: boolean
}

/** Smooth-less area sparkline. Fewer than two points, or no variation at all: a quiet flat baseline (never invented data). */
export function Sparkline({ values, tone = 1, label, className, rtl = true }: SparklineProps) {
  const w = 100
  const h = 32
  const pad = 3
  const has = values.length >= 2
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const pts = has ? values.map((v, i) => [(rtl ? 1 - i / (values.length - 1) : i / (values.length - 1)) * w, h - pad - ((v - min) / span) * (h - pad * 2)] as const) : []
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = has ? `${line} L${w} ${h} L0 ${h} Z` : ''
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} width="100%" height="100%">
      {has ? (
        <>
          <path d={area} fill={col(tone)} fillOpacity={0.14} />
          <path d={line} fill="none" stroke={col(tone)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </>
      ) : (
        <line x1="0" x2={w} y1={h - pad} y2={h - pad} stroke="var(--c-line-strong)" strokeWidth={1.5} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  )
}

export type DonutSegment = { label: string; value: number; tone?: ChartTone }

export type DonutProps = {
  segments: readonly DonutSegment[]
  /** Big text in the hole (pre-formatted, e.g. Persian digits). */
  centerValue?: string
  centerLabel?: string
  label: string
  className?: string
}

/** Ring chart. Zero total: an empty track only. Segment i uses chart tone (i % 5) + 1 unless given. */
export function Donut({ segments, centerValue, centerLabel, label, className }: DonutProps) {
  const total = segments.reduce((n, s) => n + Math.max(0, s.value), 0)
  const r = 15.9155 // circumference 100
  let offset = 25 // start at 12 o'clock
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 0.8 : 0
  return (
    <svg role="img" aria-label={label} viewBox="0 0 42 42" className={className} width="100%" height="100%">
      <circle cx="21" cy="21" r={r} fill="none" stroke="var(--c-chart-track)" strokeWidth={5} />
      {total > 0
        ? segments.map((s, i) => {
            if (s.value <= 0) return null
            const pct = (s.value / total) * 100
            const dash = Math.max(0, pct - gap)
            const el = (
              <circle
                key={`${s.label}-${i}`}
                cx="21"
                cy="21"
                r={r}
                fill="none"
                stroke={col(s.tone ?? (((i % 5) + 1) as ChartTone))}
                strokeWidth={5}
                strokeDasharray={`${dash} ${100 - dash}`}
                strokeDashoffset={offset}
                transform="rotate(0 21 21)"
              />
            )
            offset -= pct
            return el
          })
        : null}
      {centerValue ? (
        <text x="21" y={centerLabel ? 21.5 : 23} textAnchor="middle" fontSize="7.5" fontWeight="700" fill="var(--c-ink)">
          {centerValue}
        </text>
      ) : null}
      {centerLabel ? (
        <text x="21" y="27.5" textAnchor="middle" fontSize="3.4" fill="var(--c-muted)">
          {centerLabel}
        </text>
      ) : null}
    </svg>
  )
}

export type BarSeries = { label: string; values: readonly number[]; tone?: ChartTone }

export type BarCompareProps = {
  /** One label per group (x axis), already formatted. */
  categories: readonly string[]
  series: readonly BarSeries[]
  label: string
  className?: string
  /** First category at the right edge (default). */
  rtl?: boolean
}

/** Grouped vertical bars, two series typical (this vs previous period). Zero everywhere: empty baseline. */
export function BarCompare({ categories, series, label, className, rtl = true }: BarCompareProps) {
  const W = 220
  const H = 110
  const top = 6
  const bottom = 18
  const plot = H - top - bottom
  const max = Math.max(1, ...series.flatMap((s) => s.values))
  const n = categories.length
  const groupW = W / Math.max(n, 1)
  const barW = Math.min(14, (groupW - 6) / Math.max(series.length, 1))
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} className={className} width="100%" height="100%">
      <line x1="0" x2={W} y1={H - bottom} y2={H - bottom} stroke="var(--c-line)" strokeWidth={1} />
      {categories.map((c, gi) => {
        const cx0 = (rtl ? n - 1 - gi : gi) * groupW + groupW / 2
        return (
          <g key={`${c}-${gi}`}>
            {series.map((s, si) => {
              const v = s.values[gi] ?? 0
              const bh = v > 0 ? Math.max(2, (v / max) * plot) : 0
              const x = cx0 - (series.length * barW) / 2 + si * barW + 1
              return <rect key={s.label} x={x} y={H - bottom - bh} width={barW - 2} height={bh} rx={2} fill={col(s.tone ?? (((si + 1) % 5 || 1) as ChartTone))} />
            })}
            <text x={cx0} y={H - 5} textAnchor="middle" fontSize="7" fill="var(--c-muted)">
              {c}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
