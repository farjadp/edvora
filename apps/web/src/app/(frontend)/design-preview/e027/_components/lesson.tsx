import { toPersianDigits as fa } from '@edvora/core/digits'
import { cx } from '@edvora/ui'
import { course, lessonList } from '../_lib/data'
import type { OptionId } from '../_lib/options'
import { GirihPattern, Icon, Ring } from './art'
import { Page, Segments, cardClass, ctaClass, disp, secondaryClass } from './kit'

const AFTER = 43
const NEXT = 'شخصیت برند و لحن گفتار'

function Video() {
  return (
    <div className="grid aspect-video place-items-center rounded-lg border border-line bg-sunken">
      <div className="text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-brand text-brand-ink">
          <Icon name="play" option="seal" className="size-7" />
        </span>
        <p className="mt-3 text-sm text-muted">ویدیوی جلسه (نمونه)</p>
      </div>
    </div>
  )
}

function NextCta({ option, tone = 'default' }: { option: OptionId; tone?: 'default' | 'on-brand' }) {
  return (
    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
      <a href="#next" className={ctaClass(option, tone)}>
        <span>جلسهٔ بعد: {NEXT}</span>
        <Icon name="chevron" option={option} />
      </a>
      <a href="#dashboard" className={cx('inline-flex min-h-11 items-center px-2 font-medium underline-offset-4 hover:underline')}>
        بازگشت به پنل
      </a>
    </div>
  )
}

/** The completion moment. Inline, role=status, never a modal; the container is present before the text is injected. */
function Complete({ option }: { option: OptionId }) {
  const announce = 'این جلسه تکمیل شد. ده امتیاز اضافه شد.'
  if (option === 'block') {
    return (
      <div role="status" aria-live="polite" aria-atomic="true" className="e-wipe overflow-hidden rounded-2xl bg-brand p-6 text-brand-ink md:p-8">
        <span className="sr-only">{announce}</span>
        <div aria-hidden="true" className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <p className={cx(disp, 'text-7xl font-black leading-[0.85] md:text-9xl')}>{'\u200F+'}{fa(10)}</p>
          <div className="pb-1">
            <p className={cx(disp, 'flex items-center gap-2 text-2xl font-black')}>
              <Icon name="check" option={option} className="size-7" />
              این جلسه تکمیل شد
            </p>
            <p className="font-bold">امتیاز · {fa(1)} از {fa(2)} روز این هفته</p>
          </div>
        </div>
        <div aria-hidden="true" className="mt-6">
          <Segments done={13} total={30} on="brand" label="۱۳ از ۳۰ جلسه" />
          <p className="mt-2 text-sm font-bold">{fa(course.progress)}٪ ← {fa(AFTER)}٪</p>
        </div>
        <div className="mt-6"><NextCta option={option} tone="on-brand" /></div>
      </div>
    )
  }
  const girih = option === 'girih'
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cx(
        'e-rise relative overflow-hidden p-6 md:p-8',
        girih && 'pt-16 md:pt-16',
        girih ? 'rounded-2xl border border-line bg-[var(--e-tint)]' : 'border-t-2 border-ink bg-surface',
      )}
    >
      {girih ? <GirihPattern band /> : null}
      <span className="sr-only">{announce}</span>
      <div aria-hidden="true" className="relative flex items-center gap-5">
        <Ring option={option} value={AFTER} label={`${fa(AFTER)} درصد از دوره`} className={girih ? 'size-20' : 'size-16'}>
          <Icon name="check" option={option} className={cx('size-6', girih ? 'text-brand' : 'text-ok')} />
        </Ring>
        <div className="min-w-0">
          <p className={cx(disp, 'text-2xl font-black md:text-3xl')}>این جلسه تکمیل شد</p>
          <p className="mt-1 text-sm text-muted">
            {fa(course.progress)}٪ ← <span className="font-bold text-ink">{fa(AFTER)}٪</span> · {fa(1)} از {fa(2)} روز این هفته
          </p>
        </div>
        <span className="ms-auto hidden shrink-0 items-center gap-1 rounded-full border border-[var(--milestone)] px-3 py-1 text-sm font-bold text-[var(--milestone)] sm:inline-flex">
          {'\u200F+'}{fa(10)} امتیاز
        </span>
      </div>
      <p aria-hidden="true" className="relative mt-3 inline-flex rounded-full border border-[var(--milestone)] px-3 py-1 text-sm font-bold text-[var(--milestone)] sm:hidden">
        {'\u200F+'}{fa(10)} امتیاز
      </p>
      <div className="relative mt-6"><NextCta option={option} /></div>
    </div>
  )
}

/** Gamification OFF: tick + sentence + next lesson. Same page, no XP chip, no goal wording. */
function CompleteOff({ option }: { option: OptionId }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className={cx('p-5 md:p-6', cardClass(option))}>
      <p className={cx(disp, 'flex items-center gap-3 text-xl font-black')}>
        <span className="grid size-9 place-items-center rounded-full bg-ok text-bg">
          <Icon name="check" option={option} className="size-5" />
        </span>
        این جلسه تکمیل شد
      </p>
      <div className="mt-4"><NextCta option={option} /></div>
    </div>
  )
}

export function Lesson({ option }: { option: OptionId }) {
  return (
    <Page>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <p className="mb-2 text-sm text-muted">
            {course.title} · {course.module}
          </p>
          <Video />
          <h1 className={cx(disp, 'mt-5 text-3xl font-black md:text-4xl')}>
            جلسهٔ {fa(course.nextLessonNo)} — {course.nextLessonTitle}
          </h1>
          <div className="mt-6"><Complete option={option} /></div>

          <h2 className="mb-3 mt-12 text-sm font-bold text-muted">همین صفحه با گیمیفیکیشن خاموش</h2>
          <CompleteOff option={option} />
          <h2 className="mb-3 mt-8 text-sm font-bold text-muted">بارگذاری دوباره (حالت آرام)</h2>
          <p className="flex items-center gap-2 text-sm text-muted">
            <Icon name="check" option={option} className="size-4 text-ok" />
            تکمیل شده — ۱۴ آبان ۱۴۰۵
          </p>
        </div>

        <aside className="min-w-0 lg:col-span-4">
          <h2 className={cx(disp, 'mb-3 text-xl font-black')}>جلسه‌های این ماژول</h2>
          <ol className={cx('divide-y divide-line overflow-hidden', cardClass(option))}>
            {lessonList.map((l) => (
              <li key={l.no} className="flex min-h-12 items-center gap-3 px-4 py-2">
                <span className={cx(disp, 'w-7 shrink-0 text-lg font-black', l.done ? 'text-brand' : 'text-muted')}>{fa(l.no)}</span>
                <span className={cx('min-w-0 flex-1', 'current' in l && l.current ? 'font-bold' : '')}>{l.title}</span>
                {l.done ? (
                  <>
                    <Icon name="check" option={option} className="size-4 text-ok" />
                    <span className="sr-only">تکمیل شده</span>
                  </>
                ) : null}
              </li>
            ))}
          </ol>
          <a href="#dashboard" className={cx(secondaryClass(option), 'mt-4 w-full')}>بازگشت به پنل</a>
        </aside>
      </div>
    </Page>
  )
}
