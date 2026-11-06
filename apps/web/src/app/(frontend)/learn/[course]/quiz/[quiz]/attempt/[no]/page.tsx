import { cx } from '@edvora/ui'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { fa, faScore, jalaliDateTime } from '../../../../../../../../components/learn/labels'
import { resultView } from '../../../../../../../../lib/quizAttempts'
import { getCurrentUser } from '../../../../../../../../lib/session'
import { studentQuiz } from '../../../../../../../../lib/student'

type Props = { params: Promise<{ course: string; quiz: string; no: string }> }

export const metadata: Metadata = { title: 'نتیجهٔ آزمون', robots: { index: false } }

/** Result of one finished attempt, at the review level the quiz allows (Q7). Own attempts only. */
export default async function AttemptResultPage({ params }: Props) {
  const { course: rawSlug, quiz: rawQuiz, no: rawNo } = await params
  const slug = decodeURIComponent(rawSlug)
  const quizId = Number(rawQuiz)
  const attemptNo = Number(rawNo)
  if (!Number.isInteger(quizId) || !Number.isInteger(attemptNo)) notFound()
  if (!(await getCurrentUser())) redirect(`/login?next=${encodeURIComponent(`/learn/${slug}/quiz/${quizId}/attempt/${attemptNo}`)}`)
  const ctx = await studentQuiz(slug, quizId)
  if (!ctx) notFound()
  const { course, quiz, status } = ctx
  const attempt = status.attempts.find((a) => a.attemptNo === attemptNo)
  if (!attempt) notFound()
  if (attempt.status === 'in_progress') redirect(`/learn/${course.slug}/quiz/${quiz.id}`)

  const review = resultView(attempt, quiz, { passed: status.passed, attemptsLeft: status.attemptsLeft })
  const canRetry = !status.inProgress && status.attemptsLeft !== 0 && !(status.passed && !quiz.allowRetakeAfterPass)

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 md:px-8">
      <p className="text-sm text-muted">
        <Link href={`/learn/${course.slug}`} className="hover:text-ink">
          {course.title}
        </Link>
        {' / '}
        <Link href={`/learn/${course.slug}/quiz/${quiz.id}`} className="hover:text-ink">
          {quiz.title}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-black md:text-3xl">نتیجهٔ تلاش {fa(attempt.attemptNo)}</h1>
      {attempt.status === 'auto_submitted' ? <p className="mt-2 text-sm font-bold text-danger">زمان تمام شد؛ پاسخ‌های ذخیره‌شده ارسال و تصحیح شدند.</p> : null}

      <div data-testid="quiz-result" className={cx('mt-6 rounded-3xl border p-6', attempt.passed ? 'border-ok' : 'border-line')}>
        <p className={cx('text-2xl font-black', attempt.passed ? 'text-ok' : 'text-danger')}>{attempt.passed ? 'قبول شدید' : 'قبول نشدید'}</p>
        {review.score != null ? (
          <p className="mt-2 text-lg">
            نمره: <span className="font-bold">{faScore(review.score)}</span> از {faScore(review.maxScore ?? 0)} · حد قبولی {fa(quiz.passMark)}٪
          </p>
        ) : null}
        <p className="mt-2 text-sm text-muted">
          {attempt.submittedAt ? `ارسال: ${jalaliDateTime(attempt.submittedAt)} · ` : ''}
          فرصت باقی‌مانده: {status.attemptsLeft === null ? 'نامحدود' : fa(status.attemptsLeft)}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={`/learn/${course.slug}`} className="rounded-xl border border-line px-4 py-2 text-sm font-bold hover:bg-sunken">
            بازگشت به دوره
          </Link>
          {canRetry ? (
            <Link href={`/learn/${course.slug}/quiz/${quiz.id}`} className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-brand-ink">
              تلاش دوباره
            </Link>
          ) : null}
        </div>
      </div>

      {review.questions.length ? (
        <ol className="mt-8 grid gap-4">
          {review.questions.map((q, i) => (
            <li key={q.id} data-correct={q.correct ? 'true' : 'false'} className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-muted">سؤال {fa(i + 1)}</p>
                <span className={cx('shrink-0 text-xs font-bold', q.correct ? 'text-ok' : 'text-danger')}>
                  {q.correct ? 'درست' : 'نادرست'} · {faScore(q.earned ?? 0)} از {faScore(q.points)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-line font-bold leading-8">{q.text}</p>
              {q.type === 'short' ? (
                <p className="mt-2 text-sm">
                  پاسخ شما: <span dir="auto">{q.myText || '—'}</span>
                </p>
              ) : (
                <ul className="mt-3 grid gap-2 text-sm">
                  {q.options.map((o) => {
                    const mine = q.myOptionIds.includes(o.id)
                    const right = q.correctOptionIds?.includes(o.id)
                    return (
                      <li key={o.id} className={cx('rounded-xl border px-4 py-2', mine ? 'border-line-strong bg-sunken' : 'border-line', right && 'border-ok')}>
                        {o.text}
                        {mine ? <span className="ms-2 text-xs text-muted">(پاسخ شما)</span> : null}
                        {right ? <span className="ms-2 text-xs font-bold text-ok">پاسخ درست</span> : null}
                      </li>
                    )
                  })}
                </ul>
              )}
              {q.type === 'short' && q.acceptedAnswers?.length ? <p className="mt-2 text-sm text-ok">پاسخ درست: {q.acceptedAnswers.join(' / ')}</p> : null}
              {q.explanation ? <p className="mt-3 rounded-xl bg-sunken p-3 text-sm leading-7">{q.explanation}</p> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
