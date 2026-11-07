import type { ReactNode } from 'react'
import { focusRing } from '../classes'
import { cx } from '../cx'
import { Donut, Sparkline, type ChartTone, type DonutSegment } from './charts'
import { ConsoleIcon, type ConsoleIconName } from './icons'

/**
 * Operator-console building blocks (E-035), Tailwind. Presentational only: no data fetching, no next/* imports,
 * numbers and dates arrive already formatted (Persian digits, Jalali) from the app. Server-component friendly.
 * Use inside [data-console] (the AppShell root) so the console palette applies.
 */

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'brand' | 'gold'

const PILL: Record<Tone, string> = {
  ok: 'bg-ok-wash text-ok',
  warn: 'bg-warn-wash text-warn',
  danger: 'bg-danger-wash text-danger',
  info: 'bg-info-wash text-info',
  neutral: 'bg-sunken text-muted',
  brand: 'bg-wash text-brand-text',
  gold: 'bg-gold text-gold-ink',
}

export function Pill({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold', PILL[tone], className)}>{children}</span>
}

const BAR = { ok: 'var(--c-ok)', warn: 'var(--c-warn)', danger: 'var(--c-danger)', brand: 'var(--c-chart-1)' } as const

/** Thin value bar drawn in SVG (no inline style; fills from the right edge, the console is RTL): `pct` 0–100; the number is always shown next to it by the caller. */
export function MiniBar({ pct, tone = 'brand', label, className }: { pct: number; tone?: keyof typeof BAR; label: string; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(pct)))
  return (
    <svg role="img" aria-label={label} width="100%" height="6" className={cx('block', className)}>
      <rect width="100%" height="6" rx="3" fill="var(--c-chart-track)" />
      {v > 0 ? <rect x={`${100 - Math.max(v, 3)}%`} width={`${Math.max(v, 3)}%`} height="6" rx="3" fill={BAR[tone]} /> : null}
    </svg>
  )
}

/* ---------------------------------------------------------------- Page header */

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-sm font-medium text-brand-text">{eyebrow}</p> : null}
        <h1 className="font-display text-3xl font-black leading-tight md:text-4xl">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm leading-7 text-muted md:text-base">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/** Buttons for PageHeader actions and panels. */
const BTN = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors disabled:opacity-60'
export const consoleBtn = {
  primary: cx(BTN, 'bg-brand text-brand-ink hover:opacity-90', focusRing),
  secondary: cx(BTN, 'border border-line-strong bg-surface text-ink hover:bg-sunken', focusRing),
  ghost: cx(BTN, 'text-brand-text hover:bg-wash', focusRing),
  small: cx('inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-bold text-ink transition-colors hover:bg-sunken', focusRing),
}

/* ---------------------------------------------------------------- Panels */

export function Panel({
  title,
  subtitle,
  chip,
  actions,
  children,
  className,
  bodyClassName,
  headingId,
}: {
  title?: string
  subtitle?: string
  /** Small pill-shaped tag at the end of the header, e.g. «۷ روز گذشته». */
  chip?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  headingId?: string
}) {
  return (
    <section aria-labelledby={title ? headingId : undefined} className={cx('min-w-0 rounded-2xl border border-line bg-surface shadow-card', className)}>
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <h2 id={headingId} className="text-lg font-black leading-7">
              {title}
            </h2>
            {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            {chip ? <span className="inline-flex items-center gap-1.5 rounded-lg bg-wash px-2.5 py-1 text-xs font-bold text-brand-text">{chip}</span> : null}
            {actions}
          </div>
        </header>
      ) : null}
      <div className={cx('p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

export function EmptyState({ icon = 'inbox', title, description, action }: { icon?: ConsoleIconName; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 px-4 py-8 text-center">
      <span aria-hidden className="grid size-12 place-items-center rounded-2xl bg-wash text-brand-text">
        <ConsoleIcon name={icon} className="size-6" />
      </span>
      <p className="font-bold">{title}</p>
      {description ? <p className="max-w-sm text-sm leading-7 text-muted">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}

/* ---------------------------------------------------------------- KPI */

export type KpiDelta = {
  /** Already formatted, e.g. «٪۱۲+». */
  text: string
  trend: 'up' | 'down' | 'flat'
  /** Whether this movement is good news: colours it green/red; neutral otherwise. */
  tone: 'ok' | 'danger' | 'neutral'
  /** What it is compared with, e.g. «نسبت به ۳۰ روز قبل». */
  note: string
}

export type KpiCardProps = {
  label: string
  /** Already formatted (Persian digits, separators). */
  value: string
  icon: ConsoleIconName
  delta?: KpiDelta
  /** Share bar; `text` is the visible/announced value. */
  progress?: { pct: number; text: string; tone?: keyof typeof BAR }
  spark?: { values: readonly number[]; label: string; tone?: ChartTone }
  href?: string
  hint?: string
}

const DELTA_TONE = { ok: 'text-ok', danger: 'text-danger', neutral: 'text-muted' } as const

export function KpiCard({ label, value, icon, delta, progress, spark, href, hint }: KpiCardProps) {
  return (
    <div className="relative grid min-w-0 content-start gap-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted">
            {href ? (
              <a href={href} className={cx('rounded-sm after:absolute after:inset-0 after:rounded-2xl hover:text-ink', focusRing)}>
                {label}
              </a>
            ) : (
              label
            )}
          </p>
          <p className="mt-1 font-display text-4xl font-black leading-none">{value}</p>
        </div>
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-wash text-brand-text">
          <ConsoleIcon name={icon} />
        </span>
      </div>
      {delta ? (
        <p className={cx('flex flex-wrap items-center gap-x-1.5 text-xs font-bold', DELTA_TONE[delta.tone])}>
          {delta.trend !== 'flat' ? <ConsoleIcon name={delta.trend === 'up' ? 'trendUp' : 'trendDown'} className="size-4" /> : null}
          <span>{delta.text}</span>
          <span className="font-normal text-muted">{delta.note}</span>
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
      {progress || spark ? (
        <div className="flex items-center gap-4">
          {progress ? (
            <div className="min-w-0 flex-1">
              <MiniBar pct={progress.pct} tone={progress.tone} label={progress.text} />
              <p className="mt-1 truncate text-xs text-muted">{progress.text}</p>
            </div>
          ) : (
            <span className="flex-1" />
          )}
          {spark ? (
            <span className="block h-8 w-24 shrink-0">
              <Sparkline values={spark.values} label={spark.label} tone={spark.tone} />
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Four-up row; one column on mobile, two on tablets. */
export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(4,minmax(0,1fr))]">{children}</div>
}

/* ---------------------------------------------------------------- Filter bar */

const FIELD = cx('h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm outline-none focus:border-focus focus:ring-1 focus:ring-focus')

/** GET form: filters live in the URL, so every desk is a plain server page. */
export function FilterBar({ children, action, resetHref, applyLabel = 'اعمال', resetLabel = 'پاک کردن' }: { children: ReactNode; action?: string; resetHref?: string; applyLabel?: string; resetLabel?: string }) {
  return (
    <form method="get" action={action} role="search" className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
      {children}
      <div className="flex items-center gap-2">
        <button type="submit" className={consoleBtn.primary}>
          {applyLabel}
        </button>
        {resetHref ? (
          <a href={resetHref} className={consoleBtn.ghost}>
            {resetLabel}
          </a>
        ) : null}
      </div>
    </form>
  )
}

export function FilterSearch({ name = 'q', label, placeholder, defaultValue }: { name?: string; label: string; placeholder?: string; defaultValue?: string }) {
  return (
    <label className="relative block min-w-56 flex-[2_1_16rem]">
      <span className="sr-only">{label}</span>
      <ConsoleIcon name="search" className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
      <input type="search" name={name} defaultValue={defaultValue} placeholder={placeholder ?? label} className={cx(FIELD, 'ps-10')} />
    </label>
  )
}

export function FilterSelect({ name, label, options, defaultValue = '' }: { name: string; label: string; options: readonly { value: string; label: string }[]; defaultValue?: string }) {
  return (
    <label className="block min-w-40 flex-[1_1_10rem]">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <select name={name} defaultValue={defaultValue} className={FIELD}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/* ---------------------------------------------------------------- Data table */

export type Column<T> = {
  key: string
  header: string
  cell: (row: T) => ReactNode
  align?: 'start' | 'end'
  /** Sortable: a link that toggles the sort in the URL (server-side sort). */
  sort?: { href: string; dir: 'asc' | 'desc' | null }
  className?: string
}

export function DataTable<T>({ columns, rows, rowKey, caption, empty }: { columns: readonly Column<T>[]; rows: readonly T[]; rowKey: (row: T) => string; caption: string; empty?: ReactNode }) {
  if (rows.length === 0 && empty) return <>{empty}</>
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-max border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-sunken">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={c.sort?.dir === 'asc' ? 'ascending' : c.sort?.dir === 'desc' ? 'descending' : undefined}
                className={cx('whitespace-nowrap px-4 py-3 text-xs font-black text-muted', c.align === 'end' ? 'text-end' : 'text-start')}
              >
                {c.sort ? (
                  <a href={c.sort.href} className={cx('inline-flex items-center gap-1 rounded-sm hover:text-ink', c.sort.dir && 'text-ink', focusRing)}>
                    {c.header}
                    <ConsoleIcon name={c.sort.dir === 'asc' ? 'up' : c.sort.dir === 'desc' ? 'down' : 'sort'} className="size-4" />
                  </a>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={rowKey(r)} className="hover:bg-sunken/60">
              {columns.map((c) => (
                <td key={c.key} className={cx('px-4 py-3 align-middle', c.align === 'end' && 'text-end', c.className)}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** First cell of a row: icon tile, name and a muted code line. */
export function EntityCell({ icon, title, code, href }: { icon: ConsoleIconName; title: string; code?: string; href?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-wash text-brand-text">
        <ConsoleIcon name={icon} className="size-[1.125rem]" />
      </span>
      <span className="min-w-0">
        {href ? (
          <a href={href} className={cx('block max-w-56 truncate rounded-sm font-bold hover:text-brand-text', focusRing)}>
            {title}
          </a>
        ) : (
          <span className="block max-w-56 truncate font-bold">{title}</span>
        )}
        {code ? (
          <span dir="ltr" className="block max-w-56 truncate text-start font-latin text-xs text-muted">
            {code}
          </span>
        ) : null}
      </span>
    </span>
  )
}

export type PageLink = { label: string; href: string; current: boolean }

export function Pagination({ summary, pages, prev, next, prevLabel = 'قبلی', nextLabel = 'بعدی' }: { summary: string; pages: readonly PageLink[]; prev: string | null; next: string | null; prevLabel?: string; nextLabel?: string }) {
  const item = 'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm font-bold'
  return (
    <nav aria-label="صفحه‌بندی" className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <p className="text-sm text-muted">{summary}</p>
      <ul className="flex flex-wrap items-center gap-1.5">
        <li>
          {prev ? (
            <a href={prev} rel="prev" className={cx(item, 'border-line-strong bg-surface hover:bg-sunken', focusRing)}>
              {prevLabel}
            </a>
          ) : (
            <span className={cx(item, 'border-line text-muted opacity-60')}>{prevLabel}</span>
          )}
        </li>
        {pages.map((p) => (
          <li key={p.label}>
            <a
              href={p.href}
              aria-current={p.current ? 'page' : undefined}
              className={cx(item, p.current ? 'border-transparent bg-brand text-brand-ink' : 'border-line-strong bg-surface hover:bg-sunken', focusRing)}
            >
              {p.label}
            </a>
          </li>
        ))}
        <li>
          {next ? (
            <a href={next} rel="next" className={cx(item, 'border-line-strong bg-surface hover:bg-sunken', focusRing)}>
              {nextLabel}
            </a>
          ) : (
            <span className={cx(item, 'border-line text-muted opacity-60')}>{nextLabel}</span>
          )}
        </li>
      </ul>
    </nav>
  )
}

/* ---------------------------------------------------------------- Side panels */

export type AlertItem = { key: string; icon?: ConsoleIconName; title: string; detail?: string; pill?: { tone: Tone; label: string }; action?: { label: string; href: string } }

export function AlertList({ items, emptyTitle, emptyDescription }: { items: readonly AlertItem[]; emptyTitle: string; emptyDescription?: string }) {
  if (items.length === 0) return <EmptyState icon="check" title={emptyTitle} description={emptyDescription} />
  return (
    <ul className="grid gap-2">
      {items.map((it) => (
        <li key={it.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-bg p-3">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-warn-wash text-warn">
            <ConsoleIcon name={it.icon ?? 'alert'} className="size-[1.125rem]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-bold">
              <span className="min-w-0 truncate">{it.title}</span>
              {it.pill ? <Pill tone={it.pill.tone}>{it.pill.label}</Pill> : null}
            </p>
            {it.detail ? <p className="truncate text-xs text-muted">{it.detail}</p> : null}
          </div>
          {it.action ? (
            <a href={it.action.href} className={consoleBtn.small}>
              {it.action.label}
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export type QuickAction = { key: string; icon: ConsoleIconName; title: string; hint: string; href: string }

export function QuickActions({ items }: { items: readonly QuickAction[] }) {
  if (items.length === 0) return <EmptyState icon="bolt" title="میان‌بری برای نقش شما تعریف نشده است." />
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
      {items.map((a) => (
        <li key={a.key} className="min-w-0">
          <a href={a.href} className={cx('flex h-full items-center gap-3 rounded-xl border border-line bg-bg p-3 transition-colors hover:border-line-strong hover:bg-sunken', focusRing)}>
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-lg bg-wash text-brand-text">
              <ConsoleIcon name={a.icon} />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-bold">{a.title}</span>
              <span className="block truncate text-xs text-muted">{a.hint}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

export type ActivityItem = { key: string; time: string; kind: { tone: Tone; label: string }; title: string; meta?: string; status?: { tone: Tone; label: string } }

export function ActivityList({ items, emptyTitle, emptyDescription }: { items: readonly ActivityItem[]; emptyTitle: string; emptyDescription?: string }) {
  if (items.length === 0) return <EmptyState icon="clock" title={emptyTitle} description={emptyDescription} />
  return (
    <ol className="divide-y divide-line">
      {items.map((a) => (
        <li key={a.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3 sm:grid-cols-[5.5rem_6rem_minmax(0,1fr)_auto]">
          <span className="text-xs text-muted sm:text-sm">{a.time}</span>
          <span className="justify-self-end sm:justify-self-start">
            <Pill tone={a.kind.tone}>{a.kind.label}</Pill>
          </span>
          <span className="col-span-2 min-w-0 sm:col-span-1">
            <span className="block truncate font-medium">{a.title}</span>
            {a.meta ? <span className="block truncate text-xs text-muted">{a.meta}</span> : null}
          </span>
          {a.status ? (
            <span className="hidden sm:block">
              <Pill tone={a.status.tone}>{a.status.label}</Pill>
            </span>
          ) : (
            <span className="hidden sm:block" />
          )}
        </li>
      ))}
    </ol>
  )
}

export type SummaryRow = { label: string; value: string; pct: number; tone?: keyof typeof BAR }

export function SummaryCard({ totalLabel, totalValue, totalNote, rows, footer }: { totalLabel: string; totalValue: string; totalNote?: string; rows: readonly SummaryRow[]; footer?: readonly { label: string; value: string }[] }) {
  return (
    <div className="grid gap-4">
      <div className="rounded-xl bg-wash p-4">
        <p className="text-xs text-muted">{totalLabel}</p>
        <p className="mt-1 font-display text-3xl font-black text-brand-text">{totalValue}</p>
        {totalNote ? <p className="mt-1 text-xs text-muted">{totalNote}</p> : null}
      </div>
      <ul className="grid gap-3">
        {rows.map((r) => (
          <li key={r.label}>
            <p className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted">{r.label}</span>
              <span className="font-bold">{r.value}</span>
            </p>
            <MiniBar pct={r.pct} tone={r.tone} label={`${r.label}: ${r.value}`} className="mt-1.5" />
          </li>
        ))}
      </ul>
      {footer?.length ? (
        <dl className="grid gap-1 border-t border-line pt-3 text-sm">
          {footer.map((f) => (
            <div key={f.label} className="flex justify-between gap-3">
              <dt className="text-muted">{f.label}</dt>
              <dd className="font-bold">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}

/** Donut + legend (labelled values, so colour is never the only signal). */
export function DonutWithLegend({ segments, centerValue, centerLabel, label, format }: { segments: readonly (DonutSegment & { display: string })[]; centerValue?: string; centerLabel?: string; label: string; format?: never }) {
  void format
  const tones: ChartTone[] = [1, 2, 3, 4, 5]
  const toneBg = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5']
  return (
    <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
      <span className="mx-auto block aspect-square w-full max-w-44">
        <Donut segments={segments.map((s, i) => ({ ...s, tone: s.tone ?? tones[i % 5]! }))} centerValue={centerValue} centerLabel={centerLabel} label={label} />
      </span>
      <ul className="grid gap-2 text-sm">
        {segments.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span aria-hidden className={cx('size-3 shrink-0 rounded-sm', toneBg[((s.tone ?? tones[i % 5]!) - 1) % 5])} />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className="font-bold">{s.display}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Series legend for BarCompare. */
export function SeriesLegend({ items }: { items: readonly { label: string; tone: ChartTone }[] }) {
  const toneBg = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5']
  return (
    <ul className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className={cx('size-2.5 rounded-sm', toneBg[i.tone - 1])} />
          {i.label}
        </li>
      ))}
    </ul>
  )
}
