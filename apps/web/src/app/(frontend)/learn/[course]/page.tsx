import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { CompletionPanel } from '../../../../components/learn/CompletionPanel'
import { fa, faScore, jalaliDateTime } from '../../../../components/learn/labels'
import { LessonList } from '../../../../components/learn/LessonList'
import { blockersFor } from '../../../../lib/learning'
import { getCourseBySlug } from '../../../../lib/queries'
import { getCurrentUser } from '../../../../lib/session'
import { studentCourse } from '../../../../lib/student'
import { getCurrentTenant } from '../../../../lib/tenant'

type Props = { params: Promise<{ course: string }> }

export const metadata: Metadata = { robots: { index: false } }

/** Course home for an enrolled student: lessons with drip locks, quizzes, assignments, certificate status. */
export default async function CourseLearnPage({ params }: Props) {
  const slug = decodeURIComponent((await params).course)
  const here = `/learn/${slug}`
  const ctx = await studentCourse(slug)
  if (!ctx) {
    if (!(await getCurrentUser())) redirect(`/login?next=${encodeURIComponent(here)}`)
    const course = await getCourseBySlug((await getCurrentTenant()).id, slug)
    if (!course) notFound()
    redirect(`/courses/${course.slug}`)
  }
  const { course, state } = ctx
  const blockersOf = (lessonId: string) => blockersFor(state, Number(lessonId))
  const lessonTitle = (id: unknown) => state.lessons.find((l) => l.id === id)?.title

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 md:px-8">
      <p className="text-sm text-muted">
        <Link href="/dashboard" className="hover:text-ink">
          پنل من
        </Link>
        {state.cohort ? ` / ${state.cohort.title}` : ''}
      </p>
      <h1 className="mt-2 text-2xl font-black md:text-3xl">{course.title}</h1>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-8">
          <section aria-labelledby="lessons-title">
            <h2 id="lessons-title" className="mb-3 text-xl font-black">
              جلسات دوره
            </h2>
            <LessonList courseSlug={course.slug} lessons={state.lessons} locks={state.locks} completed={state.completed} blockersOf={blockersOf} />
          </section>

          {state.quizzes.length ? (
            <section aria-labelledby="quizzes-title">
              <h2 id="quizzes-title" className="mb-3 text-xl font-black">
                آزمون‌ها
              </h2>
              <ul className="grid gap-3">
                {state.quizzes.map((s) => (
                  <li key={s.quiz.id}>
                    <Link href={`/learn/${course.slug}/quiz/${s.quiz.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-5 hover:border-line-strong">
                      <span className="min-w-0">
                        <span className="block font-bold">{s.quiz.title}</span>
                        <span className="mt-1 block text-xs text-muted">
                          {s.quiz.required ? 'الزامی' : 'اختیاری'}
                          {lessonTitle(s.quiz.lesson) ? ` · جلسهٔ «${lessonTitle(s.quiz.lesson)}»` : ' · آزمون پایانی دوره'}
                          {!s.released ? ' · با باز شدن جلسه در دسترس است' : ''}
                        </span>
                      </span>
                      <span className={s.passed ? 'text-sm font-bold text-ok' : 'text-sm text-muted'}>
                        {s.passed ? 'قبول' : s.counted && s.quiz.review !== 'none' ? `نمره ${faScore(s.counted.score ?? 0)} از ${faScore(s.counted.maxScore ?? 0)}` : s.counted ? 'قبول نشده' : 'شرکت نکرده‌اید'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {state.assignments.length ? (
            <section aria-labelledby="assignments-title">
              <h2 id="assignments-title" className="mb-3 text-xl font-black">
                تکالیف
              </h2>
              <ul className="grid gap-3">
                {state.assignments.map((s) => (
                  <li key={s.assignment.id}>
                    <Link href={`/learn/${course.slug}/assignment/${s.assignment.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-5 hover:border-line-strong">
                      <span className="min-w-0">
                        <span className="block font-bold">{s.assignment.title}</span>
                        <span className="mt-1 block text-xs text-muted">
                          {s.assignment.required ? 'الزامی' : 'اختیاری'} · مهلت {jalaliDateTime(s.assignment.dueAt)}
                        </span>
                      </span>
                      <span className="text-sm text-muted">
                        {s.submission?.score != null
                          ? `نمره ${faScore(s.submission.score)} از ${fa(s.assignment.maxScore)}`
                          : s.submission?.submittedAt
                            ? 'در انتظار نمره'
                            : 'تحویل نشده'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <CompletionPanel courseSlug={course.slug} state={state} />
        </aside>
      </div>
    </div>
  )
}
