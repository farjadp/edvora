import { ThemeToggle, cx } from '@edvora/ui'
import type { ReactNode } from 'react'
import type { DemoTenant } from '../_lib/data'
import type { OptionId } from '../_lib/options'
import { BigStar, GirihPattern, Guilloche, Icon, SealMark, Star, StarRule } from './art'
import type { ScreenContent } from './screens'
import { disp } from './ui'

export type ShellProps = { tenant: DemoTenant; content: ScreenContent }

const PLATFORM = { name: 'Edvora', welcome: '' }

function SkipLink() {
  return (
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-bg">
      پرش به محتوا
    </a>
  )
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 inline-flex items-center gap-2 border border-line-strong px-2.5 py-0.5 text-xs font-bold">
      <Icon name="lock" className="size-3.5" />
      {children}
    </p>
  )
}

function Toast({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mb-5', className)}>{children}</div>
}

/* ============================================================ A · split == */

export function ShellA({ tenant, content }: ShellProps) {
  const t = content.neutral ? { ...tenant, ...PLATFORM, tagline: '', stats: [] as DemoTenant['stats'], logoUrl: null } : tenant
  return (
    <div className="grid min-h-dvh grid-cols-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:grid-rows-1">
      <SkipLink />
      {/* The academy's side: a compact band on mobile, the full story panel from md. */}
      <header className="relative isolate overflow-hidden bg-brand px-5 py-5 text-brand-ink md:flex md:min-h-dvh md:flex-col md:justify-between md:p-12 lg:p-16">
        <GirihPattern className="-z-10 text-brand-ink opacity-[.14] [mask-image:linear-gradient(200deg,black_10%,transparent_75%)]" />
        <BigStar className="-bottom-40 -start-40 -z-10 hidden size-[36rem] text-brand-ink opacity-30 md:block" />
        <div className="flex items-center gap-3">
          <SealMark name={t.name} logoUrl={t.logoUrl} tone="on-brand" className="size-11 md:size-16" stamp />
          <div className="min-w-0">
            <p className={cx(disp, 'truncate text-lg font-black md:text-2xl')}>{t.name}</p>
            {t.welcome ? <p className="line-clamp-2 text-sm leading-6 md:hidden">{t.welcome}</p> : null}
          </div>
        </div>
        {t.welcome ? (
          <div className="hidden max-w-md md:block">
            <p className={cx(disp, 'text-4xl font-black leading-[1.5] lg:text-5xl lg:leading-[1.45]')}>{t.welcome}</p>
            {t.tagline ? <p className="mt-5 text-lg leading-8">{t.tagline}</p> : null}
          </div>
        ) : (
          <p className="hidden md:block" />
        )}
        {t.stats.length ? (
          <dl className="hidden grid-cols-3 gap-4 border-t border-brand-ink/50 pt-6 md:grid">
            {t.stats.map((s) => (
              <div key={s.label} className="min-w-0">
                <dd className={cx(disp, 'text-4xl font-black leading-none')}>{s.value}</dd>
                <dt className="mt-2 text-sm">{s.label}</dt>
              </div>
            ))}
          </dl>
        ) : (
          <p className="hidden md:block" />
        )}
      </header>

      <div className="flex min-w-0 flex-col px-5 pb-8 pt-4 md:px-14 md:py-8">
        <div className="flex justify-end">
          <ThemeToggle />
        </div>
        <main id="main" className="mx-auto my-auto w-full max-w-md py-8 md:py-12">
          {content.toast ? <Toast>{content.toast}</Toast> : null}
          {content.tag ? <Tag>{content.tag}</Tag> : null}
          <h1 className={cx(disp, 'text-3xl font-black leading-snug md:text-4xl')}>{content.title}</h1>
          {content.sub ? <p className="mt-3 leading-8 text-muted">{content.sub}</p> : null}
          <div className="e034-rise mt-7">{content.body}</div>
        </main>
      </div>
    </div>
  )
}

/* =========================================================== B · seal card == */

function Corner({ className }: { className: string }) {
  return <Star className={cx('absolute hidden size-4 text-brand md:block', className)} />
}

export function ShellB({ tenant, content }: ShellProps) {
  const t = content.neutral ? { ...tenant, ...PLATFORM, logoUrl: null } : tenant
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-bg px-4 py-4 md:px-8 md:py-8">
      <SkipLink />
      {/* Certificate frame (double hairline) + corner stars, and the guilloche watermark: one static inline SVG. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-2 -z-10 border border-line-strong/70 md:inset-4" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-3.5 -z-10 hidden border border-line md:block" />
      <Corner className="start-[1.85rem] top-[1.85rem]" />
      <Corner className="end-[1.85rem] top-[1.85rem]" />
      <Corner className="bottom-[1.85rem] start-[1.85rem]" />
      <Corner className="bottom-[1.85rem] end-[1.85rem]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 grid place-items-center">
        <Guilloche className="size-[46rem] max-w-none text-brand opacity-[.13] md:size-[64rem]" />
      </div>

      <header className="relative flex justify-end md:px-8 md:pt-4">
        <ThemeToggle />
      </header>
      <main id="main" className="relative mx-auto my-auto flex w-full max-w-md flex-col items-stretch py-14">
        {content.toast ? <Toast className="mb-4">{content.toast}</Toast> : null}
        <div className="relative rounded-md border border-line bg-surface px-5 pb-8 pt-16 md:px-9">
          <div aria-hidden="true" className="pointer-events-none absolute inset-1.5 rounded-[3px] border border-line" />
          <div className="absolute inset-x-0 -top-11 flex justify-center">
            <span className="rounded-full bg-surface p-1.5 ring-1 ring-line">
              <SealMark name={t.name} logoUrl={t.logoUrl} className="size-20" stamp />
            </span>
          </div>
          <div className="relative text-center">
            <p className={cx(disp, 'text-xl font-black')}>{t.name}</p>
            {t.welcome ? <p className="mt-1 text-pretty text-sm leading-7 text-muted">{t.welcome}</p> : null}
            <StarRule className="my-5" />
            {content.tag ? <Tag>{content.tag}</Tag> : null}
            <h1 className={cx(disp, 'text-balance text-2xl font-black leading-snug md:text-3xl')}>{content.title}</h1>
            {content.sub ? <p className="mt-3 text-pretty leading-8 text-muted">{content.sub}</p> : null}
          </div>
          <div className="e034-rise relative mt-7 text-start">{content.body}</div>
        </div>
      </main>
    </div>
  )
}

/* ============================================================ C · ink page == */

export function ShellC({ tenant, content }: ShellProps) {
  const t = content.neutral ? { ...tenant, ...PLATFORM, logoUrl: null } : tenant
  const status = content.kind === 'status'
  const headline = status ? content.title : t.welcome || `خوش آمدید به ${t.name}`
  return (
    <div className="flex min-h-dvh flex-col bg-bg px-5 py-5 md:px-14 md:py-8">
      <SkipLink />
      <header className="flex items-center justify-between gap-4">
        <p className={cx(disp, 'line-clamp-2 min-w-0 text-xl font-black')}>{t.name}</p>
        <ThemeToggle />
      </header>
      <main id="main" className="my-auto w-full max-w-6xl py-10 md:py-14">
        {content.toast ? <Toast className="max-w-md">{content.toast}</Toast> : null}
        {status ? <h1 className={cx(disp, 'line-clamp-3 max-w-4xl text-balance text-[clamp(2.25rem,5.4vw,4.5rem)] font-black leading-[1.45]')}>{headline}</h1> : <p className={cx(disp, 'line-clamp-3 max-w-4xl text-balance text-[clamp(2.25rem,5.4vw,4.5rem)] font-black leading-[1.45]')}>{headline}</p>}
        <div aria-hidden="true" className="mt-8 flex items-center md:mt-12">
          <span className="h-0.5 flex-1 bg-ink" />
          <SealMark name={t.name} logoUrl={t.logoUrl} tone="ink" className="-my-6 ms-3 size-14 -rotate-6 md:size-16" stamp />
        </div>
        <div className="mt-10 grid grid-cols-1 gap-x-16 gap-y-8 md:mt-14 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="min-w-0">
            {content.tag ? <Tag>{content.tag}</Tag> : null}
            {status ? null : <h1 className={cx(disp, 'text-3xl font-black leading-snug')}>{content.title}</h1>}
            {content.sub ? <p className="mt-3 max-w-sm leading-8 text-muted">{content.sub}</p> : null}
            {status ? <div className="e034-rise max-w-sm">{content.body}</div> : null}
          </div>
          {status ? null : <div className="e034-rise min-w-0 max-w-md">{content.body}</div>}
        </div>
      </main>
    </div>
  )
}

export function Shell({ o, ...props }: ShellProps & { o: OptionId }) {
  if (o === 'a') return <ShellA {...props} />
  if (o === 'b') return <ShellB {...props} />
  return <ShellC {...props} />
}
