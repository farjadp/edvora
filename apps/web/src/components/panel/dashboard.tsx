import { toPersianDigits as fa } from '@edvora/core/digits'
import { buttonClass, focusRing } from '@edvora/ui/classes'
import { CertificateChecklist, CertificatePath, cx, Emblem, Guilloche, Icon, ProgressRing, WeekRhythm, type IconName } from '@edvora/ui'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { GamificationView } from '../../lib/gamification'
import { pathSteps } from './pathSteps'

/** What the page knows about one live enrollment (existing queries) plus the gamification view when it is on. */
export type LearnItem = {
  id: number
  course: { id: number; title: string; slug: string }
  cohortTitle: string | null
  progress: number
  done: number
  total: number
  next: { id: number; title: string; module: string | null; minutes: number | null; number: number } | null
  view: GamificationView | null
}

const cta = cx(buttonClass({ className: 'inline-flex items-center justify-center gap-2 px-6' }))
const linkBtn = cx('inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line-strong px-5 font-medium hover:bg-sunken', focusRing)

export function Section({ id, title, children, className }: { id: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={className}>
      <h2 id={id} className="mb-5 font-display text-2xl font-black">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** E1: no enrolments. Warm line, two actions. */
export function NoCourses() {
  return (
    <div data-testid="empty-courses" className="rounded-md border border-dashed border-line-strong bg-surface p-8 text-center md:p-12">
      <Icon name="book" className="mx-auto size-10 text-muted" />
      <h2 className="mt-4 font-display text-2xl font-black">مسیر یادگیری شما از اینجا شروع می‌شود.</h2>
      <p className="mx-auto mt-2 max-w-prose leading-8 text-muted">هنوز در دوره‌ای ثبت‌نام نکرده‌اید. برنامه‌های آکادمی را ببینید یا با مشاور صحبت کنید.</p>
      <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row">
        <Link href="/#programs" className={cta}>
          مشاهدهٔ دوره‌ها
        </Link>
        <Link href="/#consult" className={linkBtn}>
          درخواست تماس مشاور
        </Link>
      </div>
    </div>
  )
}

function NextLesson({ item }: { item: LearnItem }) {
  if (!item.next) return null
  const n = item.next
  return (
    <div className="flex min-w-0 items-start gap-5">
      <span aria-hidden="true" className="font-display text-7xl font-black leading-[0.9] text-brand md:text-8xl">
        {fa(n.number)}
      </span>
      <div className="min-w-0 border-s border-line ps-5">
        <p className="text-sm text-muted">{item.progress >= 100 ? 'مرور جلسه' : 'جلسهٔ بعد'}</p>
        <p className="mt-1 text-lg font-bold leading-8">{n.title}</p>
        <p className="mt-1 text-sm text-muted">
          {[n.module, n.minutes ? `${fa(n.minutes)} دقیقه` : null].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  )
}

/** The dominant block: the next lesson and one button. ON = ring, OFF = bar. */
export function ContinueCard({ item, ring }: { item: LearnItem; ring: boolean }) {
  const complete = item.progress >= 100
  const remaining = item.view?.path.remainingText ?? null
  return (
    <article data-testid="continue-card" data-course={item.course.slug} className="rounded-md border border-line bg-surface p-6 md:p-10">
      <div className="flex items-center gap-4">
        {ring ? (
          <ProgressRing value={item.progress} label={`${fa(item.progress)} درصد از دوره`} className="size-14" testId="course-ring" />
        ) : null}
        <div className="min-w-0">
          {item.cohortTitle ? <p className="text-sm text-muted">{item.cohortTitle}</p> : null}
          <h3 className="font-display text-2xl font-black leading-tight md:text-3xl">{item.course.title}</h3>
          <p className="mt-1 text-sm text-muted">
            <span className="font-display font-black tabular-nums text-ink">{fa(item.progress)}٪</span> · {fa(item.done)} از {fa(item.total)} جلسه
          </p>
        </div>
      </div>
      {!ring ? (
        <progress
          value={item.progress}
          max={100}
          aria-label="پیشرفت دوره"
          className="mt-5 block h-2 w-full appearance-none overflow-hidden rounded-full bg-e-track [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-e-track [&::-webkit-progress-value]:bg-brand"
        />
      ) : null}

      {complete ? (
        <div className="mt-8 grid grid-cols-1 items-end gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <p className="font-display text-xl font-black">همهٔ درس‌ها را پشت سر گذاشتید.</p>
            {remaining ? <p className="mt-2 leading-8 text-muted">{remaining}</p> : null}
          </div>
          <Link href={`/learn/${item.course.slug}`} className={cta}>
            {remaining ? 'مشاهدهٔ موارد باقی‌مانده' : 'مرور جلسه‌ها'}
            <Icon name="chevron" />
          </Link>
        </div>
      ) : item.next ? (
        <div className="mt-8 grid grid-cols-1 items-end gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
          <NextLesson item={item} />
          <Link href={`/learn/${item.course.slug}/${item.next.id}`} className={cta}>
            <Icon name="play" />
            ادامهٔ یادگیری
          </Link>
        </div>
      ) : null}

      <p className="mt-6">
        <Link href={`/learn/${item.course.slug}`} className="rounded-sm text-sm font-bold text-brand-text underline-offset-4 hover:underline">
          جلسات، آزمون‌ها و تکالیف
        </Link>
      </p>
    </article>
  )
}

/** Certificate path under a continue card: stepper (ON) or checklist (OFF). A stepper, not a card in a card. */
export function PathBlock({ item, gold }: { item: LearnItem; gold: boolean }) {
  const path = item.view?.path
  if (!path) return null
  const steps = pathSteps(path)
  return (
    <section aria-labelledby={`path-${item.id}`} data-testid="certificate-path-section" className="min-w-0 pt-8">
      <h3 id={`path-${item.id}`} className="mb-6 font-display text-2xl font-black">
        مسیر تا گواهی
      </h3>
      {gold ? <CertificatePath steps={steps} remaining={path.remainingText} /> : <CertificateChecklist steps={steps} remaining={path.remainingText} />}
    </section>
  )
}

/** M1: first visit, nothing done yet. Replaces the rhythm card (UX §3). */
export function WelcomeCard({ name }: { name: string | null }) {
  return (
    <section data-testid="welcome-card" aria-labelledby="welcome" className="border-t border-ink pt-4">
      <h2 id="welcome" className="text-sm font-bold text-muted">
        شروع مسیر
      </h2>
      <p className="mt-3 font-display text-xl font-black">{name ? `خوش آمدید، ${name}` : 'خوش آمدید'}</p>
      <p className="mt-2 leading-8 text-muted">با اولین جلسه شروع کنید؛ پیشرفت شما از همان‌جا ثبت می‌شود.</p>
    </section>
  )
}

/** This week: goal ring + rhythm marks, or the calm "nothing released" state (E2). */
export function WeekSection({ item, showCourse }: { item: LearnItem; showCourse: boolean }) {
  const r = item.view?.rhythm
  if (!r) return null
  const week = item.view?.rings.week
  const neutral = r.thisWeek.state === 'neutral'
  return (
    <section aria-labelledby={`week-${item.id}`} data-testid="week-section" data-week-state={r.thisWeek.state} className="border-t border-ink pt-4">
      <h2 id={`week-${item.id}`} className="text-sm font-bold text-muted">
        این هفته{showCourse ? ` · ${item.course.title}` : ''}
      </h2>
      {neutral ? (
        <div data-testid="week-neutral" className="mt-3">
          <p className="font-bold">{r.thisWeek.neutralReason === 'break' ? 'این هفته آکادمی در وقفه است.' : 'این هفته جلسهٔ جدیدی منتشر نشده است.'}</p>
          <p className="mt-1 text-sm leading-7 text-muted">ریتم شما حفظ می‌شود. تا جلسهٔ بعدی می‌توانید جلسه‌های قبلی را مرور کنید.</p>
          <Link href={`/learn/${item.course.slug}`} className="mt-3 inline-flex min-h-11 items-center rounded-sm text-sm font-bold text-brand-text underline-offset-4 hover:underline">
            مرور جلسه‌های قبلی
          </Link>
        </div>
      ) : week ? (
        <div className="mt-3 flex items-center gap-4">
          <ProgressRing value={week.pct} label={`${fa(week.days)} از ${fa(week.goal)} روز هدف هفتگی`} className="size-12" testId="week-ring" tone={week.pct >= 100 ? 'ok' : 'brand'} />
          <div>
            <p data-testid="week-days" className="font-bold">
              {fa(week.days)} از {fa(week.goal)} روز یادگیری
            </p>
            {r.current > 0 ? <p data-testid="streak-weeks" className="text-sm text-muted">{fa(r.current)} هفتهٔ پیاپی</p> : null}
          </div>
        </div>
      ) : null}

      <WeekRhythm className="mt-5" weeks={r.weeks.map((w) => ({ key: w.key, label: w.label, state: w.state }))} />

      <div className="mt-4 grid gap-1 text-sm leading-7 text-muted">
        {r.thisWeek.state === 'met' ? <p>هدف این هفته کامل شد.</p> : null}
        {r.freezeJustUsed ? <p data-testid="freeze-note">هفتهٔ گذشته فرصت جبران استفاده شد؛ ریتم شما حفظ شد.</p> : null}
        {r.justReset ? (
          <p data-testid="reset-note">
            از این هفته دوباره شروع می‌کنیم.{r.longest > 0 ? ` بهترین ریتم شما: ${fa(r.longest)} هفته.` : ''}
          </p>
        ) : null}
      </div>
    </section>
  )
}

export type BadgeRow = { key: string; name: string; description: string; earnedAt: string; icon: IconName }

const BADGE_ICON: Record<string, IconName> = {
  'first-step': 'play',
  'strong-start': 'spark',
  'weekly-rhythm': 'calendar',
  steady: 'calendar',
  analyst: 'target',
  'on-time': 'clock',
  halfway: 'half',
  'finish-line': 'check',
  'ready-for-defense': 'target',
  graduate: 'spark',
}

/** Academy-wide badges: the same key earned in two courses counts once (earliest date). */
export function mergeBadges(items: readonly LearnItem[]): BadgeRow[] {
  const byKey = new Map<string, BadgeRow>()
  for (const it of items)
    for (const b of it.view?.badges ?? []) {
      const prev = byKey.get(b.key)
      if (!prev || b.earnedAt < prev.earnedAt) byKey.set(b.key, { key: b.key, name: b.name, description: b.description, earnedAt: b.earnedAt, icon: BADGE_ICON[b.key] ?? 'check' })
    }
  return [...byKey.values()].sort((a, b) => (a.earnedAt < b.earnedAt ? 1 : -1))
}

export function LevelSection({
  xp,
  level,
  badges,
  showXp,
  showLevel,
  showBadges,
  nextHref,
  formatDate,
}: {
  xp: number
  level: { level: number; name: string; next: { name: string; xpToGo: number | null; needsGraduation: boolean } | null; pct: number }
  badges: readonly BadgeRow[]
  showXp: boolean
  showLevel: boolean
  showBadges: boolean
  nextHref: string | null
  formatDate: (iso: string) => string
}) {
  const latest = badges[0]
  return (
    <section aria-labelledby="level" data-testid="level-section" className="border-t border-ink pt-4">
      <h2 id="level" className="text-sm font-bold text-muted">
        سطح شما در آکادمی
      </h2>
      {showLevel ? (
        <>
          <div className="mt-3 flex items-center gap-4">
            <Emblem icon="target" className="size-14" label={`سطح ${level.name}`} />
            <div className="min-w-0">
              <p data-testid="level" data-level={level.level} className="font-display text-xl font-black text-milestone">
                سطح {level.name}
              </p>
              {showXp ? (
                <p data-testid="xp-total" data-xp={xp} className="text-sm text-muted">
                  {fa(xp)} امتیاز
                  {level.next ? (level.next.needsGraduation ? ' · سطح پیشگام با صدور گواهی' : level.next.xpToGo != null ? ` · ${fa(level.next.xpToGo)} امتیاز تا ${level.next.name}` : '') : ''}
                </p>
              ) : null}
            </div>
          </div>
          {level.next ? (
            <progress
              value={level.pct}
              max={100}
              aria-label={`${fa(level.pct)} درصد تا سطح ${level.next.name}`}
              className="mt-4 block h-2 w-full appearance-none overflow-hidden rounded-full bg-e-track [&::-moz-progress-bar]:bg-milestone [&::-webkit-progress-bar]:bg-e-track [&::-webkit-progress-value]:bg-milestone"
            />
          ) : null}
        </>
      ) : showXp ? (
        <p data-testid="xp-total" data-xp={xp} className="mt-3 font-display text-xl font-black">
          {fa(xp)} امتیاز
        </p>
      ) : null}

      {showBadges ? (
        badges.length ? (
          <div data-testid="badge-list" className="mt-4">
            <p className="flex items-center gap-2 text-sm">
              <Icon name="check" className="size-4 text-milestone" />
              <span>
                نشان «{latest!.name}» — {formatDate(latest!.earnedAt)}
              </span>
            </p>
            <details className="group mt-3">
              <summary className={cx('inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-sm text-sm font-bold text-brand-text', focusRing)}>
                همهٔ نشان‌ها ({fa(badges.length)})
                <Icon name="chevron" className="size-4 group-open:-rotate-90" />
              </summary>
              <ul className="mt-3 grid grid-cols-1 gap-3">
                {badges.map((b) => (
                  <li key={b.key} data-badge={b.key} className="flex items-center gap-3">
                    <Emblem icon={b.icon} className="size-10" />
                    <div className="min-w-0">
                      <p className="font-bold">{b.name}</p>
                      <p className="text-sm leading-6 text-muted">
                        {b.description} · {formatDate(b.earnedAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ) : (
          <div data-testid="badges-empty" className="mt-4">
            <p className="text-sm leading-7 text-muted">نشان‌ها با پیشرفت شما جمع می‌شوند. اولین نشان: تکمیل یک جلسه.</p>
            {nextHref ? (
              <Link href={nextHref} className="mt-2 inline-flex min-h-11 items-center rounded-sm text-sm font-bold text-brand-text underline-offset-4 hover:underline">
                ادامهٔ جلسه
              </Link>
            ) : null}
          </div>
        )
      ) : null}
    </section>
  )
}

export function Header({ name, line, children }: { name: string | null; line: string; children?: ReactNode }) {
  return (
    <header className="relative overflow-hidden border-b border-line pb-8">
      <Guilloche className="-end-16 -top-24 hidden size-80 opacity-[.18] md:block" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-muted">پنل من</p>
          <h1 data-testid="dashboard-greeting" className="mt-2 font-display text-4xl font-black leading-tight md:text-6xl">
            {name ? `سلام، ${name}` : 'سلام'}
          </h1>
          <p className="mt-3 max-w-prose text-lg text-muted">{line}</p>
        </div>
        {children}
      </div>
    </header>
  )
}
