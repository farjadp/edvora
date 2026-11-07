import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { after } from 'next/server'
import { markLessonComplete } from '../../../actions'
import { lockText } from '../../../../../components/learn/labels'
import { LessonList } from '../../../../../components/learn/LessonList'
import { LessonStatus } from '../../../../../components/learn/LessonStatus'
import { LessonVideo } from '../../../../../components/learn/LessonVideo'
import { getStudentCourseGamification } from '../../../../../lib/gamificationQueries'
import { docOf, idOf } from '../../../../../lib/ids'
import { blockersFor } from '../../../../../lib/learning'
import { getPayloadClient } from '../../../../../lib/payload'
import { getCourseBySlug, getLessons } from '../../../../../lib/queries'
import { getCurrentUser } from '../../../../../lib/session'
import { staffCanPreview, studentCourse } from '../../../../../lib/student'
import { getCurrentTenant } from '../../../../../lib/tenant'
import type { Media } from '../../../../../payload-types'
import { hasRichText } from '@edvora/core/richtext'
import { RichText } from '../../../../../components/RichText'

type Props = { params: Promise<{ course: string; lesson: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { course: slug, lesson: lessonParam } = await params
  const tenant = await getCurrentTenant()
  const course = await getCourseBySlug(tenant.id, decodeURIComponent(slug))
  const lesson = course ? (await getLessons(course.id)).find((l) => String(l.id) === lessonParam) : undefined
  return lesson && course ? { title: `${lesson.title} — ${course.title}`, robots: { index: false } } : {}
}

/**
 * Lesson player. Content (video, notes, resources) is rendered only when the lesson is open for this person:
 * free preview, or enrolled and unlocked by drip (R2/R3), or staff preview in scope (R6). The checks are here,
 * on the server; the lock icons in the list are cosmetic.
 */
export default async function LessonPage({ params }: Props) {
  const { course: slug, lesson: lessonParam } = await params
  const tenant = await getCurrentTenant()
  const course = await getCourseBySlug(tenant.id, decodeURIComponent(slug))
  if (!course) notFound()

  const lessons = await getLessons(course.id)
  const lesson = lessons.find((l) => String(l.id) === lessonParam && idOf(l.tenant) === tenant.id)
  if (!lesson) notFound()

  const here = `/learn/${course.slug}/${lesson.id}`
  const user = await getCurrentUser()
  const student = user ? await studentCourse(course.slug) : null
  const state = student?.state ?? null
  const enrolled = Boolean(state)
  const lock = state?.locks.get(String(lesson.id)) ?? null
  const unlockedForStudent = enrolled && lock?.state === 'open'
  const preview = !unlockedForStudent && !lesson.isFreePreview && (await staffCanPreview(tenant.id, course.id))
  const canWatch = Boolean(lesson.isFreePreview) || unlockedForStudent || preview
  if (!canWatch && !user && !preview) redirect(`/login?next=${encodeURIComponent(here)}`)

  const lockedByDrip = enrolled && lock?.state === 'locked'
  const titleOf = (id: string) => lessons.find((l) => String(l.id) === id)?.title ?? ''
  const blockersOf = (id: string) => (state ? blockersFor(state, Number(id)) : [])
  const blockers = state ? blockersFor(state, lesson.id) : []
  const completed = state?.completed ?? new Set<number>()
  const lessonQuizzes = state?.quizzes.filter((s) => idOf(s.quiz.lesson) === lesson.id) ?? []
  const lessonAssignments = state?.assignments.filter((s) => idOf(s.assignment.lesson) === lesson.id) ?? []

  // R5: once a student has opened a lesson it is never locked again, whatever happens to the dates.
  if (state && unlockedForStudent && !(state.enrollment.openedLessons ?? []).some((l) => idOf(l) === lesson.id)) {
    const enrollment = state.enrollment
    after(async () => {
      try {
        const payload = await getPayloadClient()
        const fresh = await payload.findByID({ collection: 'enrollments', id: enrollment.id, depth: 0, overrideAccess: true })
        const opened = new Set((fresh.openedLessons ?? []).map((l) => idOf(l)!))
        if (opened.has(lesson.id)) return
        opened.add(lesson.id)
        await payload.update({ collection: 'enrollments', id: enrollment.id, overrideAccess: true, data: { openedLessons: [...opened] } })
      } catch (err) {
        console.error('[lesson opened]', err)
      }
    })
  }

  // E-028: server-confirmed progress for the completion block. Null view = gamification off (tick + sentence only).
  const gamView = enrolled && unlockedForStudent ? await getStudentCourseGamification(course.slug).catch(() => null) : null
  const gamOn = gamView?.flags.students ? gamView : null
  const lessonIndex = lessons.findIndex((l) => l.id === lesson.id)
  const nextLesson = lessons.slice(lessonIndex + 1).find((l) => state?.locks.get(String(l.id))?.state === 'open') ?? null

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 pt-8 md:px-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <p className="text-sm text-muted">
          <Link href={enrolled ? `/learn/${course.slug}` : `/courses/${course.slug}`} className="hover:text-ink">
            {course.title}
          </Link>
          {lesson.module ? ` / ${lesson.module}` : ''}
        </p>
        {preview ? (
          <p role="status" className="mt-3 rounded-xl border border-line-strong bg-sunken px-4 py-2 text-sm font-bold">
            پیش‌نمایش کارکنان — این جلسه برای دانشجویان ممکن است قفل باشد. چیزی به‌عنوان پیشرفت ثبت نمی‌شود.
          </p>
        ) : null}
        <div className="mt-3 grid aspect-video place-items-center overflow-hidden rounded-3xl bg-ink text-bg">
          {canWatch && lesson.videoUrl ? (
            // Production: signed ArvanCloud VOD URL with a watermark of the student's name/phone.
            <LessonVideo src={lesson.videoUrl} lessonId={lesson.id} track={enrolled && unlockedForStudent && !preview} />
          ) : canWatch ? (
            <p className="text-sm opacity-70">ویدیوی این جلسه هنوز بارگذاری نشده است.</p>
          ) : lockedByDrip && lock?.state === 'locked' ? (
            <div data-testid="lesson-locked" className="p-6 text-center">
              <p className="text-lg font-bold">این جلسه هنوز باز نشده است</p>
              <p className="mt-2 text-sm opacity-80">{lockText(lock, titleOf, blockersOf)}</p>
              <Link href={`/learn/${course.slug}`} className="mt-4 inline-block rounded-xl bg-brand px-5 py-2.5 font-bold text-brand-ink">
                فهرست جلسات
              </Link>
            </div>
          ) : (
            <div className="p-6 text-center">
              <p className="text-lg font-bold">این جلسه برای دانشجویان دوره است</p>
              <Link href={`/courses/${course.slug}`} className="mt-4 inline-block rounded-xl bg-brand px-5 py-2.5 font-bold text-brand-ink">
                ثبت‌نام در دوره
              </Link>
            </div>
          )}
        </div>
        {canWatch && user && enrolled ? (
          <p aria-hidden className="mt-2 text-end font-latin text-xs text-muted">
            {user.name} · {user.phone}
          </p>
        ) : null}

        <h1 className="mt-6 text-2xl font-black md:text-3xl">{lesson.title}</h1>

        {enrolled && unlockedForStudent ? (
          <LessonStatus
            lessonId={lesson.id}
            initiallyCompleted={completed.has(lesson.id)}
            progress={state?.progress ?? 0}
            completedCount={completed.size}
            totalLessons={lessons.length}
            next={nextLesson ? { href: `/learn/${course.slug}/${nextLesson.id}`, title: nextLesson.title } : null}
            dashboardHref="/dashboard"
            gam={
              gamOn
                ? {
                    xp: gamOn.flags.xp,
                    streak: gamOn.flags.streak,
                    badges: gamOn.flags.badges,
                    celebrations: gamOn.flags.celebrations,
                    week: gamOn.rings.week ? { days: gamOn.rings.week.days, goal: gamOn.rings.week.goal } : null,
                    badgesEarned: (gamOn.badges ?? []).map((b) => ({ key: b.key, name: b.name })),
                  }
                : null
            }
          />
        ) : null}

        {enrolled && unlockedForStudent ? (
          <form action={markLessonComplete} className="mt-4 flex flex-wrap items-center gap-3">
            <input type="hidden" name="lessonId" value={lesson.id} />
            <input type="hidden" name="back" value={here} />
            <button
              disabled={completed.has(lesson.id) || blockers.length > 0}
              className="rounded-xl border border-line px-4 py-2 text-sm font-bold hover:bg-sunken disabled:border-ok disabled:text-ok"
            >
              {completed.has(lesson.id) ? '✓ دیده شد' : 'علامت‌گذاری به‌عنوان دیده‌شده'}
            </button>
            {!completed.has(lesson.id) && blockers.length ? (
              <p className="text-sm text-muted">
                برای تکمیل این جلسه: {blockers.map((b) => `${b.kind === 'quiz' ? 'قبولی در' : 'قبولی در تکلیف'} «${b.title}»`).join('، ')}
              </p>
            ) : null}
          </form>
        ) : null}

        {canWatch && hasRichText(lesson.notes) ? <RichText data={lesson.notes} tenantId={tenant.id} className="mt-6 leading-8" /> : null}

        {canWatch && lesson.resources?.length ? (
          <section className="mt-8">
            <h2 className="mb-3 font-black">منابع جلسه</h2>
            <ul className="grid gap-2">
              {lesson.resources.map((r) => {
                const file = docOf<Media>(r.file)
                return (
                  <li key={r.id ?? r.title}>
                    {file?.url ? (
                      <a href={file.url} className="text-brand-text hover:underline">
                        {r.title}
                      </a>
                    ) : (
                      <span className="text-muted">{r.title}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        {unlockedForStudent && (lessonQuizzes.length || lessonAssignments.length) ? (
          <section className="mt-8 grid gap-3">
            <h2 className="font-black">آزمون و تکلیف این جلسه</h2>
            {lessonQuizzes.map((s) => (
              <Link key={`q${s.quiz.id}`} href={`/learn/${course.slug}/quiz/${s.quiz.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-line-strong">
                <span className="font-bold">{s.quiz.title}</span>
                <span className={s.passed ? 'text-sm font-bold text-ok' : 'text-sm text-muted'}>{s.passed ? 'قبول' : s.quiz.required ? 'الزامی' : 'اختیاری'}</span>
              </Link>
            ))}
            {lessonAssignments.map((s) => (
              <Link key={`a${s.assignment.id}`} href={`/learn/${course.slug}/assignment/${s.assignment.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-line-strong">
                <span className="font-bold">{s.assignment.title}</span>
                <span className="text-sm text-muted">{s.assignment.required ? 'الزامی' : 'اختیاری'}</span>
              </Link>
            ))}
          </section>
        ) : null}
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        {enrolled ? (
          <Link href={`/learn/${course.slug}`} className="mb-3 inline-block text-sm font-bold text-brand-text hover:underline">
            فهرست دوره، آزمون‌ها و تکالیف
          </Link>
        ) : null}
        <div className="max-h-[70vh] overflow-y-auto">
          <LessonList
            courseSlug={course.slug}
            lessons={lessons}
            locks={state?.locks ?? null}
            completed={completed}
            currentId={lesson.id}
            blockersOf={blockersOf}
            guest={!enrolled && !preview}
            compact
          />
        </div>
      </aside>
    </div>
  )
}
