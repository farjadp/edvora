import { toPersianDigits as fa } from '@edvora/core/digits'
import { cx } from '@edvora/ui'
import { certPath, certRemaining, course, lastBadge, level, releasedThisWeek, student, week } from '../_lib/data'
import type { OptionId } from '../_lib/options'
import { Emblem, GirihPattern, Guilloche, Icon, Ring, WeekDots } from './art'
import { CertChecklist, CertPath, Eyebrow, FixedBar, Page, Pct, Segments, cardClass, ctaClass, disp } from './kit'

const GREETING = 'این هفته ۲ جلسه در انتظار شماست.'

function Continue({ option }: { option: OptionId }) {
  return (
    <a href="#continue" className={ctaClass(option)}>
      <Icon name="play" option={option} className="size-5" />
      <span>ادامهٔ یادگیری</span>
    </a>
  )
}

function NextLesson({ className }: { className?: string }) {
  return (
    <div className={className}>
      <p className="text-sm text-muted">جلسهٔ بعد</p>
      <p className="mt-1 text-lg font-bold leading-8">
        جلسهٔ {fa(course.nextLessonNo)} — {course.nextLessonTitle}
      </p>
      <p className="mt-1 text-sm text-muted">
        {course.module} · {fa(course.nextLessonMinutes)} دقیقه
      </p>
    </div>
  )
}

/* ======================================================================= SEAL */

function SealDashboard() {
  const o = 'seal' as const
  return (
    <Page>
      <header className="relative overflow-hidden border-b border-line pb-8">
        <Guilloche className="-end-16 -top-24 hidden size-80 opacity-[.18] md:block" />
        <Eyebrow>پنل من</Eyebrow>
        <h1 className={cx(disp, 'mt-2 text-4xl font-black leading-tight md:text-6xl')}>سلام، {student.first}</h1>
        <p className="mt-3 max-w-prose text-lg text-muted">{GREETING}</p>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-12">
        <section aria-labelledby="continue" className="min-w-0 lg:col-span-8">
          <article className={cx(cardClass(o), 'p-6 md:p-10')}>
            <div className="flex items-center gap-4">
              <Ring option={o} value={course.progress} label={`${fa(course.progress)} درصد از دوره`} className="size-14">
                <span className="sr-only">{fa(course.progress)} درصد</span>
              </Ring>
              <div className="min-w-0">
                <h2 id="continue" className={cx(disp, 'text-2xl font-black md:text-3xl')}>{course.title}</h2>
                <p className="text-sm text-muted">
                  <Pct>{fa(course.progress)}٪</Pct> · {fa(course.done)} از {fa(course.total)} جلسه
                </p>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-1 items-end gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex items-start gap-5">
                <span aria-hidden="true" className={cx(disp, 'text-7xl font-black leading-[0.9] text-brand md:text-8xl')}>{fa(course.nextLessonNo)}</span>
                <NextLesson className="min-w-0 border-s border-line ps-5" />
              </div>
              <Continue option={o} />
            </div>
          </article>
        </section>

        <aside className="flex min-w-0 flex-col gap-8 lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1">
          <section aria-labelledby="week" className="border-t border-ink pt-4">
            <h2 id="week" className="text-sm font-bold text-muted">این هفته</h2>
            <div className="mt-3 flex items-center gap-4">
              <Ring option={o} value={50} label="۱ از ۲ روز هدف هفتگی" className="size-12" />
              <div>
                <p className="font-bold">{fa(week.doneDays)} از {fa(week.goalDays)} روز یادگیری</p>
                <p className="text-sm text-muted">{fa(week.streakWeeks)} هفتهٔ پیاپی</p>
              </div>
            </div>
            <div className="mt-5"><WeekDots option={o} days={week.days} /></div>
          </section>

          <section aria-labelledby="level" className="border-t border-ink pt-4">
            <h2 id="level" className="text-sm font-bold text-muted">سطح شما در آکادمی</h2>
            <div className="mt-3 flex items-center gap-4">
              <Emblem option={o} icon="target" className="size-14" label={`سطح ${level.name}`} />
              <div className="min-w-0">
                <p className={cx(disp, 'text-xl font-black text-[var(--milestone)]')}>سطح {level.name}</p>
                <p className="text-sm text-muted">{fa(level.toNext)} امتیاز تا {level.next}</p>
              </div>
            </div>
            <FixedBar value={85} tone="gold" label={`${fa(level.pct)} درصد تا سطح ${level.next}`} className="mt-4" />
            <p className="mt-4 flex items-center gap-2 text-sm">
              <Icon name="check" option={o} className="size-4 text-[var(--milestone)]" />
              <span>نشان «{lastBadge.name}» — {lastBadge.date}</span>
            </p>
          </section>
        </aside>

        <section aria-labelledby="path" className="min-w-0 border-t border-line pt-8 lg:col-span-8">
          <h2 id="path" className={cx(disp, 'mb-6 text-2xl font-black')}>مسیر تا گواهی</h2>
          <CertPath option={o} steps={certPath} remaining={certRemaining} />
        </section>
      </div>
    </Page>
  )
}

/* ====================================================================== GIRIH */

function GirihDashboard() {
  const o = 'girih' as const
  return (
    <Page>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>پنل من</Eyebrow>
          <h1 className={cx(disp, 'mt-1 text-4xl font-black md:text-5xl')}>سلام، {student.first}</h1>
          <p className="mt-2 text-lg text-muted">{GREETING}</p>
        </div>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section aria-labelledby="continue" className="relative min-w-0 overflow-hidden rounded-2xl border border-line bg-[var(--e-tint)] p-6 pt-16 md:p-8 md:pt-16 lg:col-span-8">
          <GirihPattern band />
          <div className="relative grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0">
              <p className="text-sm font-bold text-muted">{course.cohort}</p>
              <h2 id="continue" className={cx(disp, 'mt-1 text-3xl font-black')}>{course.title}</h2>
              <NextLesson className="mt-6" />
              <div className="mt-6"><Continue option={o} /></div>
            </div>
            <div className="flex items-center gap-4 md:flex-col md:gap-3">
              <Ring option={o} value={course.progress} label={`${fa(course.progress)} درصد از دوره`} className="size-24 md:size-36" />
              <p className="text-center">
                <Pct><span className="text-3xl">{fa(course.progress)}٪</span></Pct>
                <span className="block text-sm text-muted">{fa(course.done)} از {fa(course.total)} جلسه</span>
              </p>
            </div>
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-5 lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1">
          <section aria-labelledby="week" className={cx(cardClass(o), 'p-5')}>
            <h2 id="week" className={cx(disp, 'text-lg font-black')}>این هفته</h2>
            <p className="mt-1 text-sm text-muted">{fa(week.doneDays)} از {fa(week.goalDays)} روز یادگیری · {fa(week.streakWeeks)} هفتهٔ پیاپی</p>
            <div className="mt-4"><WeekDots option={o} days={week.days} /></div>
          </section>
          <section aria-labelledby="level" className={cx(cardClass(o), 'p-5')}>
            <h2 id="level" className="sr-only">سطح و نشان</h2>
            <div className="flex items-center gap-4">
              <Emblem option={o} icon="target" className="size-14" label={`سطح ${level.name}`} />
              <div className="min-w-0">
                <p className={cx(disp, 'text-lg font-black text-[var(--milestone)]')}>سطح {level.name}</p>
                <p className="text-sm text-muted">{fa(level.toNext)} امتیاز تا {level.next}</p>
              </div>
            </div>
            <FixedBar value={85} tone="gold" label={`${fa(level.pct)} درصد تا سطح ${level.next}`} className="mt-4" />
            <p className="mt-4 flex items-center gap-2 text-sm">
              <Icon name="check" option={o} className="size-4 text-[var(--milestone)]" />
              <span>نشان «{lastBadge.name}» — {lastBadge.date}</span>
            </p>
          </section>
        </aside>

        <section aria-labelledby="path" className={cx(cardClass(o), 'min-w-0 p-6 lg:col-span-8')}>
          <h2 id="path" className={cx(disp, 'mb-6 text-xl font-black')}>مسیر تا گواهی</h2>
          <CertPath option={o} steps={certPath} remaining={certRemaining} />
        </section>
      </div>
    </Page>
  )
}

/* ======================================================================= BLOCK */

function BlockDashboard() {
  const o = 'block' as const
  return (
    <Page>
      <header>
        <h1 className={cx(disp, 'text-4xl font-black md:text-6xl')}>سلام، {student.first}</h1>
        <p className="mt-2 text-lg text-muted">{GREETING}</p>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section aria-labelledby="continue" className="e-wipe relative min-w-0 overflow-hidden rounded-2xl bg-brand p-6 text-brand-ink md:p-8 lg:col-span-8">
          <div className="flex items-end gap-4">
            <p className={cx(disp, 'text-8xl font-black leading-[0.8] tabular-nums md:text-[10rem]')}>{fa(course.progress)}<span className="text-5xl md:text-7xl">٪</span></p>
            <div className="min-w-0 pb-1">
              <h2 id="continue" className={cx(disp, 'text-2xl font-black md:text-3xl')}>{course.title}</h2>
              <p className="text-sm font-medium">{fa(course.done)} از {fa(course.total)} جلسه</p>
            </div>
          </div>
          <div className="mt-6"><Segments done={course.done} total={course.total} on="brand" label={`${fa(course.done)} از ${fa(course.total)} جلسه کامل شده`} /></div>
          <div className="mt-6 grid grid-cols-1 items-end gap-5 md:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <p className="text-sm font-medium">جلسهٔ بعد</p>
              <p className="mt-1 text-xl font-black leading-8">جلسهٔ {fa(course.nextLessonNo)} — {course.nextLessonTitle}</p>
              <p className="mt-1 text-sm font-medium">{course.module} · {fa(course.nextLessonMinutes)} دقیقه</p>
            </div>
            <a href="#continue" className={ctaClass(o, 'on-brand')}>
              <Icon name="play" option={o} className="size-5" />
              <span>ادامهٔ یادگیری</span>
            </a>
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-4 lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1">
          <section aria-labelledby="week" className="min-w-0 rounded-2xl bg-accent p-5 text-accent-ink">
            <h2 id="week" className={cx(disp, 'text-2xl font-black')}>{fa(week.doneDays)} از {fa(week.goalDays)} روز</h2>
            <p className="text-sm font-bold">این هفته · {fa(week.streakWeeks)} هفتهٔ پیاپی</p>
            <div className="mt-4"><WeekDots option={o} days={week.days} /></div>
          </section>
          <section aria-labelledby="level" className="min-w-0 rounded-2xl bg-[var(--milestone)] p-5 text-[var(--milestone-ink)]">
            <h2 id="level" className="text-sm font-bold">سطح شما در آکادمی</h2>
            <p className={cx(disp, 'text-3xl font-black')}>سطح {level.name}</p>
            <div className="mt-3 h-3 w-full bg-[var(--milestone-ink)]/25">
              <div className="e-wipe h-full w-[85%] bg-[var(--milestone-ink)]" role="img" aria-label={`${fa(level.pct)} درصد تا سطح ${level.next}`} />
            </div>
            <p className="mt-2 text-sm font-bold">{fa(level.toNext)} امتیاز تا {level.next}</p>
            <p className="mt-3 flex items-center gap-2 border-t-2 border-[var(--milestone-ink)] pt-3 text-sm font-bold">
              <Icon name="check" option={o} className="size-4" />
              <span>نشان «{lastBadge.name}» — {lastBadge.date}</span>
            </p>
          </section>
        </aside>

        <section aria-labelledby="path" className="min-w-0 rounded-2xl border-2 border-ink bg-surface p-6 lg:col-span-8">
          <h2 id="path" className={cx(disp, 'mb-6 text-2xl font-black')}>مسیر تا گواهی</h2>
          <CertPath option={o} steps={certPath} remaining={certRemaining} />
        </section>
      </div>
    </Page>
  )
}

export function Dashboard({ option }: { option: OptionId }) {
  if (option === 'seal') return <SealDashboard />
  if (option === 'girih') return <GirihDashboard />
  return <BlockDashboard />
}

/* ============================================ Gamification OFF (all options) */

/**
 * A different composition, not the ON layout with pieces hidden: a wide "continue" band with a plain bar,
 * a "this week" list of released lessons, and the certificate path as a checklist. No ring, no level, no gold.
 */
export function DashboardOff({ option }: { option: OptionId }) {
  const hero = option === 'block'
  return (
    <Page>
      <header>
        <h1 className={cx(disp, 'text-4xl font-black md:text-5xl', option === 'seal' && 'md:text-6xl')}>سلام، {student.first}</h1>
        <p className="mt-2 text-lg text-muted">{GREETING}</p>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section
          aria-labelledby="continue"
          className={cx(
            'relative min-w-0 overflow-hidden p-6 md:p-8 lg:col-span-7',
            option === 'girih' && 'pt-16 md:pt-16',
            hero ? 'rounded-2xl bg-brand text-brand-ink' : option === 'girih' ? 'rounded-2xl border border-line bg-[var(--e-tint)]' : cardClass(option),
          )}
        >
          {option === 'girih' ? <GirihPattern band /> : null}
          <div className="relative">
            <p className={cx('text-sm font-bold', hero ? '' : 'text-muted')}>{course.cohort}</p>
            <h2 id="continue" className={cx(disp, 'mt-1 text-3xl font-black')}>{course.title}</h2>
            <div className="mt-5">
              {hero ? (
                <Segments done={course.done} total={course.total} on="brand" label={`${fa(course.done)} از ${fa(course.total)} جلسه کامل شده`} />
              ) : (
                <FixedBar value={40} label={`${fa(course.progress)} درصد از دوره`} />
              )}
              <p className={cx('mt-2 text-sm', hero ? 'font-medium' : 'text-muted')}>
                <Pct>{fa(course.progress)}٪</Pct> · {fa(course.done)} از {fa(course.total)} جلسه
              </p>
            </div>
            <div className="mt-6 grid grid-cols-1 items-end gap-5 md:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <p className={cx('text-sm', hero ? 'font-medium' : 'text-muted')}>جلسهٔ بعد</p>
                <p className="mt-1 text-lg font-bold leading-8">جلسهٔ {fa(course.nextLessonNo)} — {course.nextLessonTitle}</p>
              </div>
              {hero ? (
                <a href="#continue" className={ctaClass(option, 'on-brand')}>
                  <Icon name="play" option={option} className="size-5" />
                  <span>ادامهٔ یادگیری</span>
                </a>
              ) : (
                <Continue option={option} />
              )}
            </div>
          </div>
        </section>

        <section aria-labelledby="week" className={cx('min-w-0 p-6 lg:col-span-5', cardClass(option))}>
          <h2 id="week" className={cx(disp, 'text-xl font-black')}>برای این هفته</h2>
          <p className="mt-1 text-sm text-muted">{fa(week.pendingLessons)} جلسه در انتظار شماست.</p>
          <ul className="mt-4 divide-y divide-line">
            {releasedThisWeek.map((l) => (
              <li key={l.no}>
                <a href="#lesson" className="flex min-h-12 items-center gap-3 py-2 hover:text-brand">
                  <span className={cx(disp, 'w-8 shrink-0 text-xl font-black text-brand')}>{fa(l.no)}</span>
                  <span className="min-w-0 flex-1 font-medium">{l.title}</span>
                  <Icon name="chevron" option={option} className="text-muted" />
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="path" className={cx('min-w-0 p-6 lg:col-span-12', cardClass(option))}>
          <h2 id="path" className={cx(disp, 'mb-4 text-xl font-black')}>مسیر تا گواهی</h2>
          <CertChecklist option={option} steps={certPath} remaining={certRemaining} />
        </section>
      </div>
    </Page>
  )
}
