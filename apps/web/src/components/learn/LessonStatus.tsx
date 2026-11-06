'use client'

import { toPersianDigits as fa } from '@edvora/core/digits'
import { buttonClass, focusRing } from '@edvora/ui/classes'
import { Celebration, cx, Emblem, Icon, ProgressRing } from '@edvora/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { LESSON_WATCH_EVENT, type LessonWatchDetail } from './lessonEvents'

export type LessonStatusProps = {
  lessonId: number
  /** Already complete when the page loaded: the quiet state, never a celebration (G6.2). */
  initiallyCompleted: boolean
  progress: number
  completedCount: number
  totalLessons: number
  next: { href: string; title: string } | null
  dashboardHref: string
  /** Academy switches for this student; null = gamification off (tick + sentence only). */
  gam: {
    xp: boolean
    streak: boolean
    badges: boolean
    celebrations: boolean
    week: { days: number; goal: number } | null
    badgesEarned: { key: string; name: string }[]
  } | null
}

const cta = buttonClass({ className: 'inline-flex items-center justify-center gap-2 px-6' })

/**
 * Lesson-complete block (UX §2.2). The container is always present (a live region), content appears only after the
 * server confirms the completion (beacon event), inline under the title, no modal, no auto-next. On reload the
 * lesson shows only the next-lesson row.
 */
export function LessonStatus({ lessonId, initiallyCompleted, progress, completedCount, totalLessons, next, dashboardHref, gam }: LessonStatusProps) {
  const router = useRouter()
  const [just, setJust] = useState<LessonWatchDetail | null>(null)
  const before = useRef(progress)
  const knownBadges = useRef(new Set(gam?.badgesEarned.map((b) => b.key)))

  useEffect(() => {
    if (initiallyCompleted) return
    const onWatch = (e: Event) => {
      const d = (e as CustomEvent<LessonWatchDetail>).detail
      if (d.lessonId !== lessonId || !d.completed) return
      setJust(d)
      router.refresh()
    }
    window.addEventListener(LESSON_WATCH_EVENT, onWatch)
    return () => window.removeEventListener(LESSON_WATCH_EVENT, onWatch)
  }, [initiallyCompleted, lessonId, router])

  const estimate = totalLessons > 0 ? Math.round(((completedCount + 1) / totalLessons) * 100) : progress
  const after = progress > before.current ? progress : Math.max(estimate, before.current)
  const xp = just && gam?.xp ? just.xp : 0
  const newBadges = gam?.badges ? (gam.badgesEarned.filter((b) => !knownBadges.current.has(b.key))) : []
  const weekLine = gam?.streak && gam.week ? (gam.week.days >= gam.week.goal ? 'هدف این هفته کامل شد.' : `${fa(gam.week.days)} از ${fa(gam.week.goal)} روز این هفته`) : null
  const announce = ['این جلسه تکمیل شد.', xp > 0 ? `${fa(xp)} امتیاز اضافه شد.` : null, ...newBadges.map((b) => `نشان ${b.name} را گرفتید.`)].filter(Boolean).join(' ')

  const nextRow =
    initiallyCompleted || just ? (
      <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        {next ? (
          <Link href={next.href} data-testid="next-lesson" className={cta}>
            <span>جلسهٔ بعد: {next.title}</span>
            <Icon name="chevron" />
          </Link>
        ) : (
          <Link href={dashboardHref} data-testid="next-lesson" className={cta}>
            بازگشت به پنل
          </Link>
        )}
        {next ? (
          <Link href={dashboardHref} className={cx('inline-flex min-h-11 items-center rounded-sm px-2 font-medium underline-offset-4 hover:underline', focusRing)}>
            بازگشت به پنل
          </Link>
        ) : null}
      </div>
    ) : null

  return (
    <div data-testid="lesson-status" data-state={just ? 'just-completed' : initiallyCompleted ? 'completed' : 'open'} className="mt-4">
      <Celebration
        id={`lesson:${lessonId}`}
        show={Boolean(just)}
        enabled={gam?.celebrations ?? false}
        announce={announce}
        quiet={
          <p className="flex items-center gap-2 font-bold">
            <Icon name="check" className="text-ok" />
            این جلسه تکمیل شد
          </p>
        }
      >
        <div className="border-t-2 border-ink bg-surface py-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <ProgressRing value={after} label={`${fa(after)} درصد از دوره`} className="size-16" testId="lesson-ring">
              <Icon name="check" className="size-6 text-brand" />
            </ProgressRing>
            <div className="min-w-0">
              <p className="font-display text-2xl font-black md:text-3xl">این جلسه تکمیل شد</p>
              <p className="mt-1 text-sm text-muted">
                {fa(before.current)}٪ ← <span className="font-bold text-ink">{fa(after)}٪</span>
                {weekLine ? ` · ${weekLine}` : ''}
              </p>
            </div>
            {gam?.xp && just ? (
              xp > 0 ? (
                <span data-testid="xp-chip" className="ms-auto inline-flex items-center rounded-full border border-milestone px-3 py-1 text-sm font-bold text-milestone">
                  <span dir="ltr" className="me-1">
                    +{fa(xp)}
                  </span>
                  امتیاز
                </span>
              ) : just.capped ? (
                <span data-testid="xp-capped" className="ms-auto text-sm text-muted">
                  سقف امتیاز امروز تکمیل شد
                </span>
              ) : null
            ) : null}
          </div>
          {newBadges.length ? (
            <ul data-testid="new-badges" className="mt-4 grid gap-2">
              {newBadges.map((b) => (
                <li key={b.key} className="flex items-center gap-3 text-sm font-bold text-milestone">
                  <Emblem icon="check" className="size-8" animate />
                  نشان «{b.name}» را گرفتید
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Celebration>
      {nextRow}
    </div>
  )
}
