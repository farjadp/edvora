import { joinState } from '@edvora/core/live'
import { buttonClass } from '@edvora/ui/classes'
import type { LiveSession } from '../../payload-types'
import { jalaliDateTime, fa } from '../learn/labels'
import { LIVE_MESSAGE, STATUS_LABEL } from './copy'

type Props = { sessions: LiveSession[]; message?: string | null; now?: Date }

/**
 * "Live classes" block on the course page (D1/D2). The join button is a plain form POST to /live/<id>/join,
 * which checks everything again and redirects; it is enabled only inside the window and once the host started.
 */
export function StudentLivePanel({ sessions, message, now = new Date() }: Props) {
  const note = message ? LIVE_MESSAGE[message] : undefined
  return (
    <section id="live" aria-labelledby="live-title" className="scroll-mt-24">
      <h2 id="live-title" className="mb-3 text-xl font-black">
        کلاس‌های زنده
      </h2>
      {note ? (
        <p role="status" className={`mb-3 rounded-xl border bg-sunken p-3 text-sm leading-7 ${note.tone === 'warn' ? 'border-accent' : note.tone === 'ok' ? 'border-ok' : 'border-line'}`}>
          {note.text}
        </p>
      ) : null}
      {sessions.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-5 text-sm text-muted">کلاس زنده‌ای برای این دوره زمان‌بندی نشده است.</p>
      ) : (
        <ul className="grid gap-3">
          {sessions.map((s) => {
            const w = joinState(s, now)
            const canJoin = w.state === 'open' && s.status === 'live'
            const recordings = (s.recordings ?? []).length
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-5">
                <span className="min-w-0">
                  <span className="block font-bold">{s.title}</span>
                  <span className="mt-1 block text-xs leading-6 text-muted">
                    {jalaliDateTime(s.startsAt)} · {fa(s.durationMin)} دقیقه · {STATUS_LABEL[s.status ?? 'scheduled']}
                    {recordings ? ` · ${fa(recordings)} ضبط آماده` : ''}
                  </span>
                </span>
                {w.state === 'open' ? (
                  <form method="post" action={`/live/${s.id}/join`}>
                    <button type="submit" disabled={!canJoin} className={buttonClass({ className: 'px-5' })}>
                      {canJoin ? 'ورود به کلاس' : 'منتظر شروع مدرس'}
                    </button>
                  </form>
                ) : w.state === 'early' ? (
                  <span className="text-sm text-muted">ورود از {jalaliDateTime(w.opensAt)}</span>
                ) : (
                  <span className="text-sm text-muted">{w.state === 'cancelled' ? 'لغو شده' : 'پایان یافته'}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
