import { SUBMISSION_LIMITS, assignmentPassed } from '@edvora/core'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AssignmentForm } from '../../../../../../components/learn/AssignmentForm'
import { fa, faScore, jalaliDateTime } from '../../../../../../components/learn/labels'
import { docOf, idOf } from '../../../../../../lib/ids'
import { getCurrentUser } from '../../../../../../lib/session'
import { studentCourse } from '../../../../../../lib/student'
import type { Media } from '../../../../../../payload-types'
import { hasRichText } from '@edvora/core/richtext'
import { RichText } from '../../../../../../components/RichText'

type Props = { params: Promise<{ course: string; assignment: string }>; searchParams: Promise<{ saved?: string }> }

export const metadata: Metadata = { title: 'تکلیف', robots: { index: false } }

/** Assignment brief, own submission, grade and feedback (C2, C5). Only for enrolled students. */
export default async function AssignmentPage({ params, searchParams }: Props) {
  const { course: rawSlug, assignment: rawId } = await params
  const slug = decodeURIComponent(rawSlug)
  const assignmentId = Number(rawId)
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) notFound()
  if (!(await getCurrentUser())) redirect(`/login?next=${encodeURIComponent(`/learn/${slug}/assignment/${assignmentId}`)}`)
  const ctx = await studentCourse(slug)
  const status = ctx?.state.assignments.find((s) => s.assignment.id === assignmentId)
  if (!ctx || !status) notFound()

  const { course, state } = ctx
  const { assignment, submission, window, released } = status
  const lesson = state.lessons.find((l) => l.id === idOf(assignment.lesson))
  const graded = submission?.score != null
  const saved = (await searchParams).saved === '1'
  const files = (submission?.files ?? []).map((f, i) => ({ id: idOf(f)!, label: `فایل ${fa(i + 1)}`, href: `/files/submissions/${idOf(f)}` }))

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 md:px-8">
      <p className="text-sm text-muted">
        <Link href={`/learn/${course.slug}`} className="hover:text-ink">
          {course.title}
        </Link>
        {lesson ? ` / ${lesson.title}` : ''}
      </p>
      <h1 className="mt-2 text-2xl font-black md:text-3xl">{assignment.title}</h1>
      <p className="mt-2 text-sm text-muted">
        {assignment.required ? 'الزامی' : 'اختیاری'} · مهلت تحویل: <span className="font-bold text-ink">{jalaliDateTime(assignment.dueAt)}</span> (وقت تهران) · حداکثر نمره {fa(assignment.maxScore)}
        {assignment.passScore != null ? ` · نمرهٔ قبولی ${faScore(assignment.passScore)}` : ''}
        {assignment.allowLate ? ' · تحویل با تأخیر پذیرفته می‌شود' : ''}
      </p>
      {hasRichText(assignment.description) ? <RichText data={assignment.description} tenantId={idOf(course.tenant) ?? 0} className="mt-5 leading-8" /> : null}
      {assignment.attachments?.length ? (
        <ul className="mt-4 grid gap-2 text-sm">
          {assignment.attachments.map((a) => {
            const m = docOf<Media>(a)
            return m?.url ? (
              <li key={m.id}>
                <a href={m.url} className="text-brand-text hover:underline">
                  {m.alt || 'پیوست'}
                </a>
              </li>
            ) : null
          })}
        </ul>
      ) : null}

      <section aria-labelledby="submission-title" className="mt-8 rounded-3xl border border-line bg-surface p-6">
        <h2 id="submission-title" className="text-lg font-black">
          تحویل شما
        </h2>
        <div data-testid="submission-status" className="mt-3 text-sm leading-7">
          {graded ? (
            <>
              <p className={assignmentPassed({ score: submission.score, passScore: assignment.passScore }) ? 'text-lg font-black text-ok' : 'text-lg font-black'}>
                نمره: {faScore(submission.score!)} از {fa(assignment.maxScore)} —{' '}
                {assignmentPassed({ score: submission.score, passScore: assignment.passScore }) ? 'قبول' : 'قبول نشده'}
              </p>
              {hasRichText(submission.feedback) ? (
                <div className="mt-3 rounded-2xl bg-sunken p-4">
                  <p className="text-xs font-bold text-muted">بازخورد مدرس</p>
                  <div data-testid="submission-feedback" className="mt-1">
                    <RichText data={submission.feedback} tenantId={idOf(course.tenant) ?? 0} />
                  </div>
                </div>
              ) : null}
            </>
          ) : submission?.submittedAt ? (
            <p className="font-bold">در انتظار نمره</p>
          ) : (
            <p className="text-muted">هنوز تحویل نداده‌اید.</p>
          )}
          {submission?.submittedAt ? (
            <p className="text-muted">
              آخرین تحویل: {jalaliDateTime(submission.submittedAt)}
              {submission.late ? <span className="ms-2 rounded-md bg-sunken px-2 py-0.5 text-xs font-bold text-danger">با تأخیر</span> : null}
            </p>
          ) : null}
          {saved && !graded ? (
            <p role="status" className="mt-2 font-bold text-ok">
              تحویل شما ثبت شد. تا پایان مهلت می‌توانید آن را تغییر دهید.
            </p>
          ) : null}
        </div>

        {graded && files.length ? (
          <ul className="mt-4 grid gap-2 text-sm">
            {files.map((f) => (
              <li key={f.id}>
                <a href={f.href} className="text-brand-text hover:underline">
                  {f.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        {!released ? (
          <p className="mt-4 text-sm text-muted">این تکلیف با باز شدن جلسهٔ «{lesson?.title}» در دسترس قرار می‌گیرد.</p>
        ) : window.ok ? (
          <div className="mt-6">
            {window.late ? <p className="mb-3 text-sm font-bold text-danger">مهلت گذشته است؛ تحویل شما «با تأخیر» ثبت می‌شود.</p> : null}
            <AssignmentForm
              assignmentId={assignment.id}
              courseSlug={course.slug}
              initialText={submission?.text ?? ''}
              files={files}
              maxFiles={SUBMISSION_LIMITS.maxFiles}
              maxMb={SUBMISSION_LIMITS.maxBytes / 1024 / 1024}
              resubmit={Boolean(submission?.submittedAt)}
            />
          </div>
        ) : window.reason === 'deadline' ? (
          <p className="mt-4 text-sm font-bold">مهلت تحویل ({jalaliDateTime(assignment.dueAt)}) تمام شده است.</p>
        ) : null}
      </section>
    </div>
  )
}
