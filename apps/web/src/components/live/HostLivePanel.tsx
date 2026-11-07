import { hostCanStart } from '@edvora/core/live'
import { formatJalali } from '@edvora/core/jalali'
import { toPersianDigits } from '@edvora/core/digits'
import type { LiveSession } from '../../payload-types'
import { btnDanger, btnPrimary, Card, linkClass, Notice } from '../staff/ui'
import { LIVE_MESSAGE, STATUS_LABEL } from './copy'

type Row = { session: LiveSession; courseTitle: string; cohortTitle: string | null; attendees: number }
type Props = { rows: Row[]; message?: string | null; now?: Date }

const when = (d: string) => `${formatJalali(new Date(d), 'EEEE d MMMM')}، ساعت ${formatJalali(new Date(d), 'HH:mm')}`

/** D3 on the Teaching desk: the host's upcoming and running classes with start / end buttons (form POSTs). */
export function HostLivePanel({ rows, message, now = new Date() }: Props) {
  const note = message ? LIVE_MESSAGE[message] : undefined
  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-black">کلاس‌های زنده</h1>
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {rows.length === 0 ? (
        <Card className="max-w-2xl">
          <p className="leading-8 text-muted">کلاس زنده‌ای برای شما زمان‌بندی نشده است.</p>
          <p className="mt-2 leading-8 text-muted">
            زمان‌بندی کلاس از{' '}
            <a href="/admin/collections/live-sessions" className={linkClass}>
              فهرست کلاس‌های زنده
            </a>{' '}
            انجام می‌شود.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {rows.map(({ session: s, courseTitle, cohortTitle, attendees }) => {
            const canStart = hostCanStart(s, now)
            return (
              <li key={s.id}>
                <Card className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-black">{s.title}</p>
                    <p className="mt-1 text-sm leading-7 text-muted">
                      {courseTitle}
                      {cohortTitle ? ` · ${cohortTitle}` : ''} · {when(s.startsAt)} · {toPersianDigits(s.durationMin)} دقیقه
                    </p>
                    <p className="text-sm leading-7 text-muted">
                      {STATUS_LABEL[s.status ?? 'scheduled']} · حضور ثبت‌شده: {toPersianDigits(attendees)} نفر
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canStart ? (
                      <form method="post" action={`/live/${s.id}/host`}>
                        <button type="submit" className={btnPrimary()}>
                          {s.status === 'live' ? 'بازگشت به کلاس' : 'شروع کلاس'}
                        </button>
                      </form>
                    ) : null}
                    {s.status === 'live' ? (
                      <form method="post" action={`/live/${s.id}/end`}>
                        <button type="submit" className={btnDanger()}>
                          پایان کلاس برای همه
                        </button>
                      </form>
                    ) : null}
                    {!canStart && s.status !== 'live' ? (
                      <span className="text-sm text-muted">{s.status === 'scheduled' ? 'شروع از نیم ساعت پیش از کلاس' : STATUS_LABEL[s.status ?? 'scheduled']}</span>
                    ) : null}
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
