import { BarCompare, ConsoleIcon, Donut, MiniBar, SPARK_THIN_HINT, Sparkline, sparkShape, type ActivityItem, type AlertItem, type KpiCardProps, type QuickAction, type Tone } from '@edvora/ui/console'
import type { ReactNode } from 'react'
import type { OverviewData } from '../../lib/consoleData'

/**
 * /admin side of the console (E-035). Payload's admin has no Tailwind, so these server components emit the `c-*`
 * classes defined in custom.scss; charts and icons are the shared SVG components. Same data types as /staff.
 */
export const Kpi = ({ label, value, icon, delta, progress, spark, href, hint }: KpiCardProps) => (
  <div className="c-kpi">
    <div className="c-kpi__top">
      <div className="c-kpi__main">
        <p className="c-kpi__label">{href ? <a href={href}>{label}</a> : label}</p>
        <p className={value.length > 8 ? 'c-kpi__value c-kpi__value--long' : 'c-kpi__value'}>{value}</p>
      </div>
      <span className="c-tile" aria-hidden="true">
        <ConsoleIcon name={icon} />
      </span>
    </div>
    {delta ? (
      <p className={`c-kpi__delta c-kpi__delta--${delta.tone}`}>
        {delta.trend !== 'flat' ? <ConsoleIcon name={delta.trend === 'up' ? 'trendUp' : 'trendDown'} className="c-ico-sm" /> : null}
        <span>{delta.text}</span>
        <span className="c-muted">{delta.note}</span>
      </p>
    ) : hint ? (
      <p className="c-kpi__hint">{hint}</p>
    ) : null}
    {progress || spark ? (
      <div className="c-kpi__foot">
        {progress ? (
          <div className="c-kpi__bar">
            <MiniBar pct={progress.pct} tone={progress.tone} label={progress.text} />
            <p className="c-kpi__hint">{progress.text}</p>
          </div>
        ) : spark && sparkShape(spark.values).kind === 'flat' ? (
          <p className="c-kpi__bar c-kpi__hint">{SPARK_THIN_HINT}</p>
        ) : (
          <span className="c-kpi__bar" />
        )}
        {spark ? (
          <span className="c-kpi__spark">
            <Sparkline values={spark.values} label={spark.label} tone={spark.tone} />
          </span>
        ) : null}
      </div>
    ) : null}
  </div>
)

export const Kpis = ({ items }: { items: readonly (KpiCardProps & { key?: string })[] }) => (
  <div className="c-kpis">
    {items.map((k, i) => (
      <Kpi key={k.key ?? i} {...k} />
    ))}
  </div>
)

export const Panel = ({ title, chip, children, id }: { title: string; chip?: string; children: ReactNode; id?: string }) => (
  <section className="c-panel" aria-labelledby={id}>
    <header className="c-panel__head">
      <h2 id={id} className="c-panel__title">
        {title}
      </h2>
      {chip ? <span className="c-chip">{chip}</span> : null}
    </header>
    <div className="c-panel__body">{children}</div>
  </section>
)

export const Empty = ({ icon = 'inbox', title, text }: { icon?: Parameters<typeof ConsoleIcon>[0]['name']; title: string; text?: string }) => (
  <div className="c-empty">
    <span className="c-tile c-tile--lg" aria-hidden="true">
      <ConsoleIcon name={icon} />
    </span>
    <p className="c-empty__title">{title}</p>
    {text ? <p className="c-muted">{text}</p> : null}
  </div>
)

export const Pill = ({ tone, children }: { tone: Tone; children: ReactNode }) => <span className={`c-pill c-pill--${tone}`}>{children}</span>

export const Alerts = ({ items }: { items: readonly AlertItem[] }) =>
  items.length === 0 ? (
    <Empty icon="check" title="موردی نیاز به توجه ندارد." text="اقساط سررسیدگذشته، تکلیف‌های بی‌نمره و سرنخ‌های بی‌پیگیری اینجا نمایش داده می‌شوند." />
  ) : (
    <ul className="c-list">
      {items.map((a) => (
        <li key={a.key} className="c-alert">
          <span className="c-tile c-tile--warn" aria-hidden="true">
            <ConsoleIcon name={a.icon ?? 'alert'} />
          </span>
          <div className="c-alert__text">
            <p className="c-alert__title">
              {a.title} {a.pill ? <Pill tone={a.pill.tone}>{a.pill.label}</Pill> : null}
            </p>
            {a.detail ? <p className="c-muted c-small">{a.detail}</p> : null}
          </div>
          {a.action ? (
            <a className="c-btn c-btn--small" href={a.action.href}>
              {a.action.label}
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  )

export const Quick = ({ items }: { items: readonly QuickAction[] }) =>
  items.length === 0 ? (
    <Empty icon="bolt" title="میان‌بری برای نقش شما تعریف نشده است." />
  ) : (
    <ul className="c-quick">
      {items.map((q) => (
        <li key={q.key}>
          <a className="c-quick__item" href={q.href}>
            <span className="c-tile" aria-hidden="true">
              <ConsoleIcon name={q.icon} />
            </span>
            <span className="c-quick__text">
              <strong>{q.title}</strong>
              <span className="c-muted c-small">{q.hint}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )

export const Activity = ({ items }: { items: readonly ActivityItem[] }) =>
  items.length === 0 ? (
    <Empty icon="clock" title="هنوز رویدادی ثبت نشده است." text="سفارش‌ها، ثبت‌نام‌ها، سرنخ‌ها و تکلیف‌ها که برسند، اینجا دیده می‌شوند." />
  ) : (
    <ol className="c-activity">
      {items.map((a) => (
        <li key={a.key} className="c-activity__row">
          <span className="c-muted c-small">{a.time}</span>
          <Pill tone={a.kind.tone}>{a.kind.label}</Pill>
          <span className="c-activity__text">
            <span>{a.title}</span>
            {a.meta ? <span className="c-muted c-small">{a.meta}</span> : null}
          </span>
          {a.status ? <Pill tone={a.status.tone}>{a.status.label}</Pill> : <span />}
        </li>
      ))}
    </ol>
  )

const TONES = [1, 2, 3, 4, 5] as const

export const DonutBlock = ({ donut }: { donut: NonNullable<OverviewData['donut']> }) =>
  donut.segments.length === 0 ? (
    <Empty icon="student" title="ثبت‌نام فعالی وجود ندارد." />
  ) : (
    <div className="c-donut">
      <span className="c-donut__chart">
        <Donut segments={donut.segments.map((s, i) => ({ ...s, tone: TONES[i % 5] }))} centerValue={donut.centerValue} centerLabel={donut.centerLabel} label="سهم هر دوره از ثبت‌نام‌های فعال" />
      </span>
      <ul className="c-legend">
        {donut.segments.map((s, i) => (
          <li key={s.label}>
            <span className={`c-swatch c-swatch--${TONES[i % 5]}`} aria-hidden="true" />
            <span className="c-legend__label">{s.label}</span>
            <strong>{s.display}</strong>
          </li>
        ))}
      </ul>
    </div>
  )

export const BarsBlock = ({ bars }: { bars: NonNullable<OverviewData['bars']> }) =>
  bars.empty ? (
    <Empty icon="chart" title="در ۱۴ روز گذشته رویدادی ثبت نشده است." />
  ) : (
    <>
      <span className="c-bars">
        <BarCompare categories={bars.categories} series={bars.series} label={`مقایسهٔ ${bars.what} این هفته با هفتهٔ قبل`} />
      </span>
      <ul className="c-legend c-legend--row">
        {bars.series.map((s) => (
          <li key={s.label}>
            <span className={`c-swatch c-swatch--${s.tone ?? 1}`} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>
    </>
  )

export const SummaryBlock = ({ s }: { s: NonNullable<OverviewData['summary']> }) => (
  <div className="c-summary">
    <div className="c-summary__total">
      <p className="c-muted c-small">مجموع سفارش‌های باز و تسویه‌شده</p>
      <p className="c-summary__value">{s.totalValue}</p>
    </div>
    <ul className="c-list">
      {s.rows.map((r) => (
        <li key={r.label}>
          <p className="c-summary__row">
            <span className="c-muted">{r.label}</span>
            <strong>{r.value}</strong>
          </p>
          <MiniBar pct={r.pct} tone={r.tone} label={`${r.label}: ${r.value}`} />
        </li>
      ))}
    </ul>
    <dl className="c-summary__foot">
      {s.footer.map((f) => (
        <div key={f.label}>
          <dt className="c-muted">{f.label}</dt>
          <dd>{f.value}</dd>
        </div>
      ))}
    </dl>
  </div>
)
