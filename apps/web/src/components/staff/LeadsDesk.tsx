import { formatJalali } from '@edvora/core'
import { toPersianDigits as fa } from '@edvora/core/digits'
import { LEAD_OUTCOME_LABELS_FA } from '@edvora/core/staff-goals'
import { GoalRing, Icon, ProgressRing, cx } from '@edvora/ui'
import Link from 'next/link'
import type { AdvisorDesk, AdvisorRow, DeskFilter } from '../../lib/advisorDesk'
import { OutcomeChips } from './OutcomeChips'
import { btnPrimary, btnSecondary, Card } from './ui'

const FILTERS: { key: DeskFilter; label: string }[] = [
  { key: 'today', label: 'امروز' },
  { key: 'overdue', label: 'عقب‌افتاده' },
  { key: 'all', label: 'همه' },
]

function chip(active: boolean) {
  return cx(
    'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
    active ? 'border-brand bg-brand text-brand-ink' : 'border-line-strong hover:bg-sunken',
  )
}

function Row({ r }: { r: AdvisorRow }) {
  return (
    <li id={`lead-${r.id}`} data-testid="lead-row" data-lead={r.id} data-due={r.due} data-done={r.doneOutcome ?? undefined} className="scroll-mt-24 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-bold">
          {r.name}
          {r.courseTitle ? <span className="font-normal text-muted"> · {r.courseTitle}</span> : null}
        </p>
        {r.doneOutcome ? (
          <p className="inline-flex items-center gap-1 text-sm font-bold text-ok">
            <Icon name="check" className="size-4" />
            ثبت شد: {LEAD_OUTCOME_LABELS_FA[r.doneOutcome]}
          </p>
        ) : r.nextFollowUpAt ? (
          <p data-testid="lead-due" className="text-sm text-muted">
            {r.due === 'overdue' ? 'عقب‌افتاده · ' : ''}
            {formatJalali(r.nextFollowUpAt, 'd MMMM')} · {formatJalali(r.nextFollowUpAt, 'HH:mm')}
          </p>
        ) : null}
      </div>
      <p className="mt-1">
        <a href={`tel:${r.phone}`} dir="ltr" className="inline-flex min-h-11 items-center gap-2 font-latin hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <Icon name="phone" className="size-4" />
          {r.phone}
        </a>
      </p>
      {r.doneOutcome ? null : r.due === 'overdue' || r.due === 'today' ? <OutcomeChips leadId={r.id} name={r.name} /> : null}
    </li>
  )
}

/** Advisor desk (UX §2.4): today's goal, the next due follow-up, outcome chips, and one shared team line. */
export function LeadsDesk({ title, name, desk, filter, adminLink }: { title: string; name: string; desk: AdvisorDesk; filter: DeskFilter; adminLink?: { label: string; href: string } }) {
  const { daily, goals, team, counts, rows, next } = desk
  const ringOn = Boolean(goals)
  const allDone = daily.complete
  return (
    <div data-testid="leads-desk" data-goals={ringOn ? 'on' : 'off'} className="grid gap-6">
      <header>
        <h1 className="text-sm font-bold text-muted">{title}</h1>
        <p data-testid="advisor-greeting" className="mt-1 font-display text-3xl font-black leading-tight md:text-4xl">
          سلام {name}.{daily.due > 0 ? ` امروز ${fa(daily.due)} پیگیری دارید.` : ''}
        </p>
        {daily.remaining > 0 ? <p className="mt-2 text-muted">{fa(daily.remaining)} پیگیری برای امروز باقی مانده است.</p> : null}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:grid-rows-[auto_minmax(0,1fr)] lg:items-start">
        <section aria-labelledby="goal" className="min-w-0 lg:col-span-4 lg:col-start-9 lg:row-start-1 lg:sticky lg:top-6">
          <Card>
            <h2 id="goal" className="mb-4 text-sm font-bold text-muted">
              هدف امروز
            </h2>
            {daily.due === 0 ? (
              <div data-testid="goal-empty">
                <p className="font-display text-xl font-black">امروز پیگیری عقب‌افتاده‌ای ندارید.</p>
                <p className="mt-1 leading-7 text-muted">فرصت خوبی برای تماس با سرنخ‌های جدید است.</p>
                <Link href="/staff/leads?f=all" className={cx(btnSecondary(), 'mt-4')}>
                  سرنخ‌های جدید
                </Link>
              </div>
            ) : ringOn ? (
              <>
                <GoalRing done={daily.done} total={daily.due} label={`${fa(daily.done)} از ${fa(daily.due)} پیگیری امروز`} valueText={`${fa(daily.done)} از ${fa(daily.due)}`} caption="پیگیری انجام شد" />
                {goals && goals.streak.current > 0 ? (
                  <p data-testid="follow-up-streak" className="mt-4 text-sm leading-7">
                    {fa(goals.streak.current)} روز کاری پیاپی همه را پیگیری کردید.
                  </p>
                ) : null}
              </>
            ) : (
              <div>
                <p data-testid="goal-count" className="font-display text-2xl font-black">
                  {fa(daily.done)} از {fa(daily.due)} <span className="text-base font-normal text-muted">پیگیری انجام شد</span>
                </p>
                <progress
                  value={daily.done}
                  max={daily.due}
                  aria-label={`${fa(daily.done)} از ${fa(daily.due)} پیگیری امروز`}
                  className="mt-3 block h-2 w-full appearance-none overflow-hidden rounded-full bg-e-track [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-e-track [&::-webkit-progress-value]:bg-brand"
                />
              </div>
            )}
            {allDone ? (
              <div data-testid="goal-complete" className="mt-4 border-t border-line pt-4">
                <p className="font-bold">همهٔ پیگیری‌های امروز انجام شد.</p>
                <p className="text-sm text-muted">دست شما درد نکند.</p>
              </div>
            ) : null}
          </Card>
        </section>

        <section aria-labelledby="queue" className="min-w-0 lg:col-span-8 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <h2 id="queue" className="sr-only">
            پیگیری‌ها
          </h2>
          {next ? (
            <a href={`#lead-${next.id}`} data-testid="next-follow-up" className={cx(btnPrimary(), 'w-full sm:w-auto')}>
              پیگیری بعدی: {next.name}
            </a>
          ) : null}
          <nav aria-label="فیلتر پیگیری‌ها" className="mt-4 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Link key={f.key} href={f.key === 'today' ? '/staff/leads' : `/staff/leads?f=${f.key}`} aria-current={filter === f.key ? 'page' : undefined} className={chip(filter === f.key)}>
                {f.label}
                {f.key === 'overdue' && counts.overdue > 0 ? ` (${fa(counts.overdue)})` : ''}
              </Link>
            ))}
          </nav>
          {rows.length ? (
            <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {rows.map((r) => (
                <Row key={r.id} r={r} />
              ))}
            </ul>
          ) : (
            <div data-testid="queue-empty" className="mt-4 rounded-2xl border border-dashed border-line-strong p-6">
              <p className="font-bold">{filter === 'overdue' ? 'پیگیری عقب‌افتاده‌ای ندارید.' : 'در این فهرست موردی نیست.'}</p>
              <p className="mt-1 text-sm leading-7 text-muted">وقتی سرنخ تازه‌ای به شما سپرده شود، اینجا می‌بینید.</p>
            </div>
          )}
          {adminLink ? (
            <p className="mt-4">
              <a href={adminLink.href} className="inline-flex min-h-11 items-center font-bold text-brand-text underline-offset-4 hover:underline">
                {adminLink.label} <span aria-hidden>↗</span>
              </a>
            </p>
          ) : null}
        </section>

        {team ? (
          <section aria-labelledby="team" data-testid="team-goal" data-reached={team.reached} className="min-w-0 lg:col-span-4 lg:col-start-9 lg:row-start-2">
            <Card className="flex items-center gap-4">
              <ProgressRing value={team.pct} label={`تیم: ${fa(team.done)} از ${fa(team.target)} این هفته`} className="size-11" tone={team.reached ? 'ok' : 'brand'} />
              <div className="min-w-0">
                <h2 id="team" className="text-sm font-bold text-muted">
                  تیم این هفته
                </h2>
                <p data-testid="team-count" className="font-bold">
                  {fa(team.done)} از {fa(team.target)} پیگیری
                </p>
                {team.reached ? <p className="text-sm text-muted">هدف تیم این هفته کامل شد.</p> : null}
              </div>
            </Card>
          </section>
        ) : null}
      </div>
    </div>
  )
}
