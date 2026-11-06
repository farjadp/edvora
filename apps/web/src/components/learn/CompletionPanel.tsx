import { cx } from '@edvora/ui'
import Link from 'next/link'
import type { CourseState } from '../../lib/learning'
import { ELIGIBILITY_REASON, fa, REQUIREMENT_STATE } from './labels'

/** Progress + what is still missing for the certificate (C6, Q8, R8). */
export function CompletionPanel({ courseSlug, state }: { courseSlug: string; state: CourseState }) {
  const { eligibility, requirements, progress } = state
  return (
    <section aria-labelledby="completion-title" className="rounded-3xl border border-line bg-surface p-6">
      <h2 id="completion-title" className="text-lg font-black">
        پیشرفت و گواهی
      </h2>
      <progress
        value={progress}
        max={100}
        aria-label="پیشرفت دوره"
        className="mt-4 block h-2 w-full appearance-none overflow-hidden rounded-full bg-sunken [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-sunken [&::-webkit-progress-value]:bg-brand"
      />
      <p className="mt-2 text-xs text-muted">
        {fa(progress)}٪ · {fa(state.completed.size)} از {fa(state.lessons.length)} جلسه
      </p>

      <div data-testid="certificate-status" className={cx('mt-5 rounded-2xl p-4 text-sm leading-7', eligibility.eligible ? 'bg-sunken text-ok' : 'bg-sunken')}>
        {eligibility.eligible ? (
          <p className="font-bold">شرایط دریافت گواهی را دارید. گواهی پس از تأیید آکادمی صادر می‌شود.</p>
        ) : (
          <>
            <p className="font-bold">گواهی هنوز آماده نیست</p>
            <ul className="mt-1 list-inside list-disc text-muted">
              {eligibility.missing.map((m) => (
                <li key={m}>{ELIGIBILITY_REASON[m]}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      {requirements.length ? (
        <>
          <h3 className="mt-5 text-sm font-bold">موارد الزامی</h3>
          <ul className="mt-2 grid gap-2">
            {requirements.map((r) => (
              <li key={`${r.kind}-${r.id}`} data-requirement={r.kind} data-state={r.state} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-sm">
                <Link href={`/learn/${courseSlug}/${r.kind === 'quiz' ? 'quiz' : 'assignment'}/${r.id}`} className="min-w-0 font-bold hover:text-brand">
                  <span className="me-2 text-xs font-normal text-muted">{r.kind === 'quiz' ? 'آزمون' : 'تکلیف'}</span>
                  {r.title}
                </Link>
                <span className={cx('shrink-0 text-xs', r.state === 'done' ? 'text-ok' : r.state === 'failed' ? 'font-bold' : 'text-muted')}>{REQUIREMENT_STATE[r.state]}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
