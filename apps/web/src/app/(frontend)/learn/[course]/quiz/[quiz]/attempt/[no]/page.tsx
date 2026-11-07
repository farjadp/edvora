import { buttonClass, focusRing } from '@edvora/ui/classes'
import { cx, Icon, ProgressRing } from '@edvora/ui'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { FocusHeading } from '../../../../../../../../components/learn/FocusHeading'
import { fa, faScore, jalaliDateTime } from '../../../../../../../../components/learn/labels'
import { idOf } from '../../../../../../../../lib/ids'
import { getQuizPassXp } from '../../../../../../../../lib/gamificationQueries'
import { resultView } from '../../../../../../../../lib/quizAttempts'
import { getCurrentUser } from '../../../../../../../../lib/session'
import { studentQuiz } from '../../../../../../../../lib/student'
import { hasRichText } from '@edvora/core/richtext'
import { RichText } from '../../../../../../../../components/RichText'

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
  const { course, quiz, status, state } = ctx
  const attempt = status.attempts.find((a) => a.attemptNo === attemptNo)
  if (!attempt) notFound()
  if (attempt.status === 'in_progress') redirect(`/learn/${course.slug}/quiz/${quiz.id}`)

  const review = resultView(attempt, quiz, { passed: status.passed, attemptsLeft: status.attemptsLeft })
  const canRetry = !status.inProgress && status.attemptsLeft !== 0 && !(status.passed && !quiz.allowRetakeAfterPass)

  const passed = Boolean(attempt.passed)
  const pct = review.score != null && (review.maxScore ?? 0) > 0 ? Math.round((review.score / (review.maxScore ?? 1)) * 100) : null
  const earlierMiss = passed && status.attempts.some((a) => a.attemptNo < attempt.attemptNo && !a.passed && a.status !== 'in_progress')
  const lesson = state.lessons.find((l) => l.id === idOf(quiz.lesson)) ?? null
  const limited = status.attemptsLeft !== null
  const attemptsUsed = status.attempts.filter((a) => a.status !== 'in_progress').length
  const xp = passed ? await getQuizPassXp(course.slug, quiz.id, attempt.attemptNo).catch(() => null) : null
  const primary = cx(buttonClass({ className: 'inline-flex items-center justify-center gap-2 px-6' }))
  const secondary = cx('inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line-strong px-5 font-medium hover:bg-sunken', focusRing)

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 md:px-8">
      <p className="text-sm text-muted">
        <Link href={`/learn/${course.slug}`} className="hover:text-ink">
          {course.title}
        </Link>
        {' / '}
        <Link href={`/learn/${course.slug}/quiz/${quiz.id}`} className="hover:text-ink">
          {quiz.title}
        </Link>
      </p>
      {attempt.status === 'auto_submitted' ? <p className="mt-2 text-sm font-bold">زمان تمام شد؛ پاسخ‌های ذخیره‌شده ارسال و تصحیح شدند.</p> : null}

      <section
        data-testid="quiz-result"
        data-state={passed ? 'passed' : 'not-yet'}
        aria-labelledby="quiz-result-title"
        className="mt-4 rounded-md border border-line bg-surface p-6 md:p-10"
      >
        <p className="text-sm text-muted">
          آزمون: {quiz.title} · تلاش {fa(attempt.attemptNo)}
        </p>
        <div className="mt-5 flex items-center gap-5">
          {pct != null ? (
            <ProgressRing value={pct} label={`${fa(pct)} درصد`} className="size-20 md:size-24" tone={passed ? 'ok' : 'brand'} testId="quiz-ring">
              <span className="font-display text-xl font-black tabular-nums">{fa(pct)}٪</span>
            </ProgressRing>
          ) : null}
          <div className="min-w-0">
            <FocusHeading id="quiz-result-title" className="flex items-center gap-2 font-display text-3xl font-black leading-tight outline-none md:text-4xl">
              {passed ? 'قبول شدید' : 'هنوز به حد نصاب نرسیده‌اید'}
              <Icon name={passed ? 'check' : 'half'} className={cx('size-7', passed ? 'text-ok' : 'text-brand-text')} />
            </FocusHeading>
            {review.score != null ? (
              <p className="mt-2 text-lg">
                نمره: <span className="font-bold">{faScore(review.score)}</span> از {faScore(review.maxScore ?? 0)}
              </p>
            ) : null}
            <p className="text-sm text-muted">{passed ? `حد قبولی ${fa(quiz.passMark)}٪` : `برای قبولی ${fa(quiz.passMark)}٪ لازم است`}</p>
          </div>
        </div>

        <div className="mt-6 border-t border-line pt-6">
          {passed ? (
            <p className="leading-8">
              {earlierMiss ? 'نتیجهٔ بهتر ثبت شد. ' : ''}این آزمون برای شما قبول‌شده حساب می‌شود.
            </p>
          ) : (
            <>
              <p className="leading-8">این بخش‌ها کمک می‌کند؛ هر زمان آماده بودید دوباره امتحان کنید.</p>
              {lesson ? (
                <Link href={`/learn/${course.slug}/${lesson.id}`} className={cx('mt-2 inline-flex min-h-11 items-center gap-1 rounded-sm font-bold', focusRing)}>
                  مرور درس: {lesson.title}
                  <Icon name="chevron" className="size-4" />
                </Link>
              ) : null}
            </>
          )}

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {passed ? (
              <>
                <Link href={`/learn/${course.slug}`} className={primary}>
                  ادامهٔ دوره
                  <Icon name="chevron" />
                </Link>
                {review.questions.length ? (
                  <a href="#review" className={secondary}>
                    مرور پاسخ‌ها
                  </a>
                ) : null}
              </>
            ) : (
              <>
                <Link href={lesson ? `/learn/${course.slug}/${lesson.id}` : `/learn/${course.slug}`} className={primary}>
                  مرور درس‌های مربوط
                </Link>
                {canRetry ? (
                  <Link href={`/learn/${course.slug}/quiz/${quiz.id}`} className={secondary}>
                    آزمون دوباره
                  </Link>
                ) : null}
              </>
            )}
          </div>
          {!passed && !canRetry && status.attemptsLeft === 0 ? (
            <p className="mt-3 text-sm leading-7 text-muted">فرصت دیگری برای این آزمون ندارید. اگر لازم است، با پشتیبانی آکادمی تماس بگیرید.</p>
          ) : null}
          {!passed && limited ? (
            <p className="mt-3 text-sm text-muted">
              شمار تلاش: {fa(attemptsUsed)} از {fa(attemptsUsed + (status.attemptsLeft ?? 0))}
            </p>
          ) : null}
          {passed && canRetry ? (
            <p className="mt-3 text-sm">
              <Link href={`/learn/${course.slug}/quiz/${quiz.id}`} className="font-bold text-brand-text underline-offset-4 hover:underline">
                آزمون دوباره
              </Link>
            </p>
          ) : null}
        </div>

        <p className="mt-6 border-t border-line pt-4 text-sm text-muted">
          {attempt.submittedAt ? `ارسال: ${jalaliDateTime(attempt.submittedAt)} · ` : ''}
          فرصت باقی‌مانده: {status.attemptsLeft === null ? 'نامحدود' : fa(status.attemptsLeft)}
          {xp ? (
            <span data-testid="quiz-xp" className="ms-2 font-bold text-milestone">
              · {fa(xp)} امتیاز اضافه شد
            </span>
          ) : null}
        </p>
      </section>

      {review.questions.length ? (
        <ol id="review" className="mt-8 grid scroll-mt-24 gap-4">
          {review.questions.map((q, i) => (
            <li key={q.id} data-correct={q.correct ? 'true' : 'false'} className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-muted">سؤال {fa(i + 1)}</p>
                <span className={cx('shrink-0 text-xs font-bold', q.correct ? 'text-ok' : 'text-muted')}>
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
              {hasRichText(q.explanation) ? <RichText data={q.explanation} tenantId={idOf(course.tenant) ?? 0} className="mt-3 rounded-xl bg-sunken p-3 text-sm leading-7" /> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
