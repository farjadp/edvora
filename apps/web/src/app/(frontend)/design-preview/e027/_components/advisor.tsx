import { toPersianDigits as fa } from '@edvora/core/digits'
import { cx, focusRing } from '@edvora/ui'
import { advisor } from '../_lib/data'
import type { OptionId } from '../_lib/options'
import { GirihPattern, Icon, Ring } from './art'
import { Page, Segments, cardClass, ctaClass, disp } from './kit'

const pct = Math.round((advisor.done / advisor.dueToday) * 100)
const teamPct = Math.round((advisor.team.done / advisor.team.total) * 100)

function GoalPanel({ option }: { option: OptionId }) {
  const block = option === 'block'
  return (
    <section
      aria-labelledby="goal"
      className={cx(
        'min-w-0 p-5',
        option === 'girih' && 'pt-14',
        block ? 'e-wipe rounded-2xl bg-brand text-brand-ink' : option === 'girih' ? 'relative overflow-hidden rounded-2xl border border-line bg-[var(--e-tint)]' : cardClass(option),
      )}
    >
      {option === 'girih' ? <GirihPattern band /> : null}
      <div className="relative">
        <h2 id="goal" className={cx('text-sm font-bold', !block && 'text-muted')}>هدف امروز</h2>
        <div role="status" aria-live="polite" aria-atomic="true" className="mt-3">
          {block ? (
            <>
              <p className={cx(disp, 'text-6xl font-black leading-none tabular-nums')}>
                {fa(advisor.done)}
                <span className="text-3xl"> از {fa(advisor.dueToday)}</span>
              </p>
              <p className="mt-2 font-bold">پیگیری انجام شد</p>
              <div className="mt-4"><Segments done={advisor.done} total={advisor.dueToday} on="brand" label={`${fa(advisor.done)} از ${fa(advisor.dueToday)} پیگیری`} /></div>
            </>
          ) : (
            <div className="flex items-center gap-4">
              <Ring option={option} value={pct} label={`${fa(advisor.done)} از ${fa(advisor.dueToday)} پیگیری انجام شد`} className="size-20" />
              <div>
                <p className={cx(disp, 'text-2xl font-black')}>
                  {fa(advisor.done)} از {fa(advisor.dueToday)}
                </p>
                <p className="text-sm text-muted">پیگیری انجام شد</p>
              </div>
            </div>
          )}
        </div>
        <p className="mt-4 text-sm leading-7">{fa(advisor.streakDays)} روز کاری پیاپی همه را پیگیری کردید.</p>
      </div>
    </section>
  )
}

function TeamPanel({ option }: { option: OptionId }) {
  return (
    <section aria-labelledby="team" className={cx('min-w-0 p-5', cardClass(option))}>
      <h2 id="team" className="text-sm font-bold text-muted">تیم این هفته</h2>
      <div className="mt-3 flex items-center gap-4">
        {option === 'block' ? null : <Ring option={option} value={teamPct} label={`${fa(advisor.team.done)} از ${fa(advisor.team.total)}`} className="size-12" />}
        <div className="min-w-0 flex-1">
          <p className={cx(disp, 'text-xl font-black')}>
            {fa(advisor.team.done)} از {fa(advisor.team.total)}
          </p>
          {option === 'block' ? <div className="mt-2"><Segments done={advisor.team.done} total={advisor.team.total} label={`${fa(advisor.team.done)} از ${fa(advisor.team.total)}`} /></div> : null}
        </div>
      </div>
    </section>
  )
}

function Chip({ option, children, active }: { option: OptionId; children: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx(
        'min-h-11 px-4 text-sm font-bold',
        focusRing,
        option === 'seal' ? 'rounded-full' : option === 'girih' ? 'rounded-xl' : 'rounded-lg',
        active ? (option === 'block' ? 'bg-ink text-bg' : 'bg-brand text-brand-ink') : 'border border-line-strong hover:bg-sunken',
      )}
    >
      {children}
    </button>
  )
}

export function Advisor({ option }: { option: OptionId }) {
  const first = advisor.leads[0]!
  return (
    <Page>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <p className="text-sm font-bold text-muted">میز مشاور</p>
          <h1 className={cx(disp, 'mt-1 text-3xl font-black md:text-4xl')}>
            سلام {advisor.name}. امروز {fa(advisor.dueToday)} پیگیری دارید.
          </h1>
          <a href="#next" className={cx(ctaClass(option), 'mt-6 w-full justify-between sm:w-auto')}>
            <span>پیگیری بعدی: {advisor.next}</span>
            <Icon name="chevron" option={option} />
          </a>

          <div role="group" aria-label="فیلتر" className="mt-8 flex flex-wrap gap-2">
            <Chip option={option} active>امروز</Chip>
            <Chip option={option}>{`عقب‌افتاده (${fa(1)})`}</Chip>
            <Chip option={option}>همه</Chip>
          </div>

          <ul className={cx('mt-4 divide-y divide-line overflow-hidden', cardClass(option))}>
            {advisor.leads.map((l, i) => (
              <li key={l.name} className="p-4 md:p-5">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <p className="font-bold">
                    {l.name} <span className="font-normal text-muted">· {l.interest}</span>
                  </p>
                  <p className={cx('text-sm font-bold', l.overdue ? 'text-danger' : 'text-muted')}>
                    {l.overdue ? 'عقب‌افتاده · ' : ''}
                    {l.when}
                  </p>
                </div>
                <a href={`tel:${l.phone.replaceAll(' ', '')}`} className={cx('mt-1 inline-flex min-h-11 items-center gap-2 rounded-md font-latin text-sm font-medium hover:text-brand', focusRing)}>
                  <Icon name="phone" option={option} className="size-4" />
                  <span dir="ltr">{l.phone}</span>
                </a>
                {i === 0 ? (
                  <div className="mt-2">
                    <p className="text-sm text-muted" id="outcome-hint">برای ثبت پیگیری، نتیجه را انتخاب کنید.</p>
                    <div role="group" aria-labelledby="outcome-hint" className="mt-2 flex flex-wrap gap-2">
                      {advisor.outcomes.map((o) => (
                        <Chip key={o} option={option}>{o}</Chip>
                      ))}
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
            <li role="status" aria-live="polite" className="e-rise flex items-center gap-3 bg-[var(--e-tint)] p-4 md:p-5">
              <Icon name="check" option={option} className="size-5 text-ok" />
              <span className="font-medium">{advisor.win}</span>
            </li>
          </ul>
          <span className="sr-only">{first.name}</span>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
          <GoalPanel option={option} />
          <TeamPanel option={option} />
          <section aria-labelledby="empty" className={cx('p-5', cardClass(option))}>
            <h2 id="empty" className={cx(disp, 'text-lg font-black')}>حالت پایان روز</h2>
            <p className="mt-2 flex items-center gap-2 font-bold">
              <Icon name="check" option={option} className="size-5 text-ok" />
              همهٔ پیگیری‌های امروز انجام شد.
            </p>
            <p className="mt-1 text-sm text-muted">دست شما درد نکند.</p>
          </section>
        </aside>
      </div>
    </Page>
  )
}
