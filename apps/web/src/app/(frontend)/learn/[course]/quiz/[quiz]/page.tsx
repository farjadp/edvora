import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { fa, faScore, jalaliDateTime } from '../../../../../../components/learn/labels'
import { QuizRunner } from '../../../../../../components/learn/QuizRunner'
import { StartQuizButton } from '../../../../../../components/learn/StartQuizButton'
import { idOf } from '../../../../../../lib/ids'
import { playView } from '../../../../../../lib/quizAttempts'
import { getCurrentUser } from '../../../../../../lib/session'
import { studentQuiz } from '../../../../../../lib/student'

type Props = { params: Promise<{ course: string; quiz: string }> }

export const metadata: Metadata = { title: 'آزمون', robots: { index: false } }

const STATUS: Record<string, string> = { in_progress: 'در حال پاسخ', submitted: 'ارسال شده', auto_submitted: 'پایان زمان' }

/** Quiz intro / taking screen (Q3). Only for enrolled students; correct answers are never sent here (Q7). */
export default async function QuizPage({ params }: Props) {
  const { course: rawSlug, quiz: rawId } = await params
  const slug = decodeURIComponent(rawSlug)
  const quizId = Number(rawId)
  if (!Number.isInteger(quizId) || quizId <= 0) notFound()
  if (!(await getCurrentUser())) redirect(`/login?next=${encodeURIComponent(`/learn/${slug}/quiz/${quizId}`)}`)
  const ctx = await studentQuiz(slug, quizId)
  if (!ctx) notFound()

  const { course, quiz, status, state } = ctx
  const lesson = state.lessons.find((l) => l.id === idOf(quiz.lesson))
  const questionCount = quiz.questions?.length ?? 0
  const finished = status.attempts.filter((a) => a.status !== 'in_progress').sort((a, b) => a.attemptNo - b.attemptNo)
  const blocked = !status.inProgress && (status.passed && !quiz.allowRetakeAfterPass ? 'passed' : status.attemptsLeft === 0 ? 'no_attempts' : null)

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 md:px-8">
      <p className="text-sm text-muted">
        <Link href={`/learn/${course.slug}`} className="hover:text-ink">
          {course.title}
        </Link>
        {lesson ? (
          <>
            {' / '}
            <Link href={`/learn/${course.slug}/${lesson.id}`} className="hover:text-ink">
              {lesson.title}
            </Link>
          </>
        ) : null}
      </p>
      <h1 className="mt-2 text-2xl font-black md:text-3xl">{quiz.title}</h1>
      {quiz.description ? <p className="mt-3 whitespace-pre-line leading-8 text-muted">{quiz.description}</p> : null}

      {!status.released ? (
        <div data-testid="quiz-locked" className="mt-6 rounded-2xl border border-line bg-surface p-6">
          <p className="font-bold">این آزمون هنوز در دسترس نیست</p>
          <p className="mt-2 text-sm text-muted">با باز شدن جلسهٔ «{lesson?.title}» می‌توانید در آن شرکت کنید.</p>
        </div>
      ) : status.inProgress ? (
        <div className="mt-6">
          <p className="mb-4 text-sm text-muted">تلاش {fa(status.inProgress.attemptNo)} — پاسخ‌ها خودکار ذخیره می‌شوند.</p>
          <QuizRunner play={playView(status.inProgress)} />
        </div>
      ) : (
        <div className="mt-6 grid gap-6">
          <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-surface p-5 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted">سؤال‌ها</dt>
              <dd className="mt-1 font-bold">{fa(questionCount)}</dd>
            </div>
            <div>
              <dt className="text-muted">حد قبولی</dt>
              <dd className="mt-1 font-bold">{fa(quiz.passMark)}٪</dd>
            </div>
            <div>
              <dt className="text-muted">زمان</dt>
              <dd className="mt-1 font-bold">{quiz.timeLimitMin ? `${fa(quiz.timeLimitMin)} دقیقه` : 'بدون محدودیت'}</dd>
            </div>
            <div>
              <dt className="text-muted">فرصت باقی‌مانده</dt>
              <dd data-testid="attempts-left" className="mt-1 font-bold">
                {status.attemptsLeft === null ? 'نامحدود' : fa(status.attemptsLeft)}
              </dd>
            </div>
          </dl>

          {status.counted ? (
            <p data-testid="quiz-counted" className={status.passed ? 'rounded-2xl bg-sunken p-4 font-bold text-ok' : 'rounded-2xl bg-sunken p-4 font-bold'}>
              {status.passed ? 'این آزمون را قبول شده‌اید' : 'هنوز قبول نشده‌اید'}
              {quiz.review !== 'none'
                ? ` — نمرهٔ ملاک (${quiz.countedAttempt === 'last' ? 'آخرین تلاش' : 'بهترین تلاش'}): ${faScore(status.counted.score ?? 0)} از ${faScore(status.counted.maxScore ?? 0)}`
                : ''}
            </p>
          ) : null}

          {blocked === 'passed' ? null : blocked === 'no_attempts' ? (
            <p role="status" className="rounded-2xl border border-line p-4 text-sm">
              فرصت دیگری برای این آزمون ندارید. اگر لازم است، با پشتیبانی آکادمی تماس بگیرید.
            </p>
          ) : (
            <StartQuizButton
              quizId={quiz.id}
              courseSlug={course.slug}
              label={finished.length ? `شروع تلاش ${fa(finished.length + 1)}` : 'شروع آزمون'}
            />
          )}

          {finished.length ? (
            <section>
              <h2 className="mb-3 font-black">تلاش‌های شما</h2>
              <ul className="grid gap-2">
                {finished.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/learn/${course.slug}/quiz/${quiz.id}/attempt/${a.attemptNo}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm hover:border-line-strong"
                    >
                      <span>
                        تلاش {fa(a.attemptNo)} · {a.submittedAt ? jalaliDateTime(a.submittedAt) : STATUS[a.status]}
                      </span>
                      <span className={a.passed ? 'font-bold text-ok' : 'text-muted'}>
                        {a.passed ? 'قبول' : 'مردود'} {quiz.review !== 'none' ? `· ${faScore(a.score ?? 0)} از ${faScore(a.maxScore ?? 0)}` : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  )
}
