'use client'

import { LEAD_LOST_REASONS, LEAD_LOST_REASON_LABELS_FA, nextLeadStatuses, tehranLocalToUtc, type LeadLostReason, type TehranLocal } from '@edvora/core/crm'
import type { LeadStatus } from '@edvora/core/crm'
import { LEAD_OUTCOMES, LEAD_OUTCOME_LABELS_FA, type LeadOutcome } from '@edvora/core/staff-goals'
import { cx } from '@edvora/ui'
import { focusRing } from '@edvora/ui/classes'
import { consoleBtn } from '@edvora/ui/console'
import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { logLeadCall } from '../../../app/(frontend)/staff/(desk)/leads/actions'
import { LEAD_STATUS } from '../../../lib/consoleLabels'
import { JalaliDateTimeField, defaultPickerValue } from './JalaliDateTimeField'

type Status = LeadStatus
type NextMode = 'default' | 'at' | 'none'

const FIELD = cx('w-full rounded-xl border border-line-strong bg-bg px-3 text-sm', focusRing)

/**
 * «ثبت تماس» (E-015): outcome, note, status (only the moves the pipeline allows), and the next follow-up picked on a
 * Jalali calendar (sent as UTC). The server re-checks everything (`checkCallLog`); this form only guides.
 */
export function CallLogForm({ leadId, status, nowIso }: { leadId: number; status: Status; nowIso: string }) {
  const router = useRouter()
  const ids = { note: useId(), status: useId(), lost: useId() }
  const now = new Date(nowIso)
  const [pending, start] = useTransition()
  const [outcome, setOutcome] = useState<LeadOutcome | null>(null)
  const [note, setNote] = useState('')
  const [to, setTo] = useState<Status>(status)
  const [lostReason, setLostReason] = useState<LeadLostReason | ''>('')
  const [mode, setMode] = useState<NextMode>('at')
  const [picker, setPicker] = useState<{ v: TehranLocal; utc: Date | null }>(() => {
    const v = defaultPickerValue(now)
    return { v, utc: tehranLocalToUtc(v) }
  })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const options = nextLeadStatuses(status)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!outcome) return setMsg({ ok: false, text: 'نتیجهٔ تماس را انتخاب کنید.' })
    if (to === 'lost' && status !== 'lost' && !lostReason) return setMsg({ ok: false, text: 'دلیل از دست رفتن را انتخاب کنید.' })
    let nextFollowUpAt: string | null | undefined
    if (to === 'enrolled' || mode === 'none') nextFollowUpAt = null
    else if (mode === 'at') {
      const utc = picker.utc
      if (!utc) return setMsg({ ok: false, text: 'تاریخ پیگیری بعدی معتبر نیست.' })
      nextFollowUpAt = utc.toISOString()
    }
    start(async () => {
      try {
        const r = await logLeadCall({ leadId, outcome, note: note || undefined, status: to, ...(nextFollowUpAt === undefined ? {} : { nextFollowUpAt }), lostReason: to === 'lost' ? lostReason || null : null })
        setMsg({ ok: r.ok, text: r.message })
        if (r.ok) {
          setOutcome(null)
          setNote('')
          router.refresh()
        }
      } catch {
        setMsg({ ok: false, text: 'ثبت نشد. اتصال شما ضعیف است؛ دوباره تلاش کنید.' })
      }
    })
  }

  return (
    <form onSubmit={submit} data-testid="call-log-form" data-lead={leadId} className="grid gap-5">
      <fieldset disabled={pending} className="min-w-0">
        <legend className="mb-2 text-sm font-bold">نتیجهٔ تماس</legend>
        <div className="flex flex-wrap gap-2">
          {LEAD_OUTCOMES.map((o) => (
            <label key={o} className={cx('inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-bold has-[:checked]:border-brand has-[:checked]:bg-wash has-[:checked]:text-brand-text has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus', 'border-line-strong')}>
              <input type="radio" name="outcome" value={o} data-outcome={o} checked={outcome === o} onChange={() => setOutcome(o)} className="sr-only" />
              {LEAD_OUTCOME_LABELS_FA[o]}
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor={ids.note} className="grid gap-1 text-sm font-bold">
        یادداشت تماس <span className="text-xs font-normal text-muted">(اختیاری؛ فقط همکاران می‌بینند)</span>
        <textarea id={ids.note} name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} disabled={pending} className={cx(FIELD, 'py-2 font-normal')} />
      </label>

      <div className="flex flex-wrap gap-4">
        <label htmlFor={ids.status} className="grid min-w-48 flex-1 gap-1 text-sm font-bold">
          وضعیت سرنخ
          <select id={ids.status} name="status" value={to} onChange={(e) => setTo(e.target.value as Status)} disabled={pending} className={cx(FIELD, 'h-11 font-normal')}>
            {options.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS[s]?.label ?? s}
                {s === status ? ' (فعلی)' : ''}
              </option>
            ))}
          </select>
        </label>
        {to === 'lost' && status !== 'lost' ? (
          <label htmlFor={ids.lost} className="grid min-w-48 flex-1 gap-1 text-sm font-bold">
            دلیل از دست رفتن
            <select id={ids.lost} name="lostReason" required value={lostReason} onChange={(e) => setLostReason(e.target.value as LeadLostReason)} disabled={pending} className={cx(FIELD, 'h-11 font-normal')}>
              <option value="">انتخاب کنید</option>
              {LEAD_LOST_REASONS.map((r) => (
                <option key={r} value={r}>
                  {LEAD_LOST_REASON_LABELS_FA[r]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {to === 'enrolled' ? (
        <p className="text-sm text-muted">ثبت‌نام‌شده‌ها پیگیری بعدی ندارند.</p>
      ) : (
        <fieldset disabled={pending} className="grid min-w-0 gap-3">
          <legend className="mb-2 text-sm font-bold">پیگیری بعدی</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {(
              [
                ['at', 'در زمان مشخص'],
                ['default', 'طبق پیش‌فرض این مرحله'],
                ['none', 'بدون پیگیری بعدی'],
              ] as const
            ).map(([m, label]) => (
              <label key={m} className="inline-flex min-h-11 items-center gap-2">
                <input type="radio" name="nextMode" value={m} checked={mode === m} onChange={() => setMode(m)} className={cx('size-4 accent-brand', focusRing)} />
                {label}
              </label>
            ))}
          </div>
          {mode === 'at' ? <JalaliDateTimeField legend="تاریخ و ساعت پیگیری (به وقت تهران)" value={picker.v} now={now} onChange={(v, utc) => setPicker({ v, utc })} /> : null}
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} data-testid="call-log-submit" className={consoleBtn.primary}>
          {pending ? 'در حال ثبت…' : 'ثبت تماس'}
        </button>
        <p role={msg && !msg.ok ? 'alert' : 'status'} data-testid="call-log-message" className={cx('text-sm leading-7', msg && !msg.ok && 'font-bold text-danger')}>
          {msg?.text ?? ''}
        </p>
      </div>
    </form>
  )
}
