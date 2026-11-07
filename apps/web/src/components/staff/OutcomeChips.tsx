'use client'

import { LEAD_OUTCOMES, LEAD_OUTCOME_LABELS_FA, type LeadOutcome } from '@edvora/core/staff-goals'
import { focusRing } from '@edvora/ui/classes'
import { cx } from '@edvora/ui'
import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { recordFollowUpOutcome } from '../../app/(frontend)/actions'

const DAY = 24 * 60 * 60 * 1000
/** value → how to send the next follow-up date. `default` omits it (the server uses the stage default). */
const NEXT: { value: string; label: string; days: number | null | 'default' }[] = [
  { value: 'default', label: 'طبق پیش‌فرض', days: 'default' },
  { value: '1', label: 'فردا', days: 1 },
  { value: '3', label: 'سه روز دیگر', days: 3 },
  { value: '7', label: 'یک هفتهٔ دیگر', days: 7 },
  { value: 'none', label: 'بدون پیگیری بعدی', days: null },
]

/**
 * «نتیجه چه شد؟» chips for one due follow-up. The advisor's daily goal moves ONLY after the server records an
 * outcome (`recordFollowUpOutcome`); nothing is counted on the client. On success the page re-renders from the server.
 */
export function OutcomeChips({ leadId, name }: { leadId: number; name: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [next, setNext] = useState('default')
  const selectId = useId()

  const record = (outcome: LeadOutcome) =>
    start(async () => {
      const choice = NEXT.find((n) => n.value === next)!
      const nextFollowUpAt = choice.days === 'default' ? undefined : choice.days === null ? null : new Date(Date.now() + choice.days * DAY).toISOString()
      try {
        const r = await recordFollowUpOutcome({ leadId, outcome, ...(nextFollowUpAt === undefined ? {} : { nextFollowUpAt }) })
        setMsg({ ok: r.ok, text: r.message })
        if (r.ok) router.refresh()
      } catch {
        setMsg({ ok: false, text: 'ثبت نشد. اتصال شما ضعیف است؛ دوباره تلاش کنید.' })
      }
    })

  return (
    <fieldset data-testid="outcome-chips" data-lead={leadId} disabled={pending} className="mt-3 min-w-0">
      <legend className="text-sm text-muted">نتیجهٔ پیگیری {name} چه شد؟ برای ثبت، نتیجه را انتخاب کنید.</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {LEAD_OUTCOMES.map((o) => (
          <button
            key={o}
            type="button"
            data-outcome={o}
            onClick={() => record(o)}
            className={cx('min-h-11 rounded-full border border-line-strong px-4 text-sm font-bold hover:bg-sunken disabled:opacity-60', focusRing)}
          >
            {LEAD_OUTCOME_LABELS_FA[o]}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor={selectId} className="text-muted">
          پیگیری بعدی
        </label>
        <select
          id={selectId}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className={cx('h-11 rounded-xl border border-line-strong bg-bg px-3', focusRing)}
        >
          {NEXT.map((n) => (
            <option key={n.value} value={n.value}>
              {n.label}
            </option>
          ))}
        </select>
      </div>
      <p role={msg && !msg.ok ? 'alert' : 'status'} className={cx('mt-2 text-sm leading-7', msg && !msg.ok && 'font-bold')}>
        {pending ? 'در حال ثبت…' : (msg?.text ?? '')}
      </p>
    </fieldset>
  )
}
