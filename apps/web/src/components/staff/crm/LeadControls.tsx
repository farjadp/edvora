'use client'

import { LEAD_LOST_REASONS, LEAD_LOST_REASON_LABELS_FA, type LeadLostReason } from '@edvora/core/crm'
import { cx } from '@edvora/ui'
import { focusRing } from '@edvora/ui/classes'
import { consoleBtn } from '@edvora/ui/console'
import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { assignLead, claimLead, markLeadLost, type LeadDeskState } from '../../../app/(frontend)/staff/(desk)/leads/actions'

const FIELD = cx('h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm', focusRing)

function useAction(onOk?: (router: ReturnType<typeof useRouter>) => void) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<LeadDeskState | null>(null)
  const run = (fn: () => Promise<LeadDeskState>) =>
    start(async () => {
      try {
        const r = await fn()
        setMsg(r)
        if (r.ok) (onOk ?? ((x) => x.refresh()))(router)
      } catch {
        setMsg({ ok: false, message: 'انجام نشد. اتصال شما ضعیف است؛ دوباره تلاش کنید.' })
      }
    })
  return { pending, msg, run }
}

function Message({ msg, testId }: { msg: LeadDeskState | null; testId: string }) {
  return (
    <p role={msg && !msg.ok ? 'alert' : 'status'} data-testid={testId} className={cx('text-sm leading-7', msg && !msg.ok && 'font-bold text-danger')}>
      {msg?.message ?? ''}
    </p>
  )
}

/** «برمی‌دارم»: takes a pool lead for oneself, then opens it at the call log (client navigation, ADR 005). */
export function ClaimButton({ leadId, name, compact }: { leadId: number; name: string; compact?: boolean }) {
  const { pending, msg, run } = useAction((router) => {
    router.push(`/staff/leads/${leadId}#log`)
    router.refresh()
  })
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" data-testid="claim-lead" data-lead={leadId} disabled={pending} onClick={() => run(() => claimLead({ leadId }))} className={compact ? consoleBtn.small : consoleBtn.primary} aria-label={`برداشتن سرنخ ${name} برای خودم`}>
        {pending ? 'در حال ثبت…' : 'برمی‌دارم'}
      </button>
      <Message msg={msg} testId="claim-message" />
    </div>
  )
}

export function AssignForm({ leadId, current, advisors }: { leadId: number; current: number | null; advisors: { id: number; name: string }[] }) {
  const { pending, msg, run } = useAction()
  const [to, setTo] = useState(current ? String(current) : '')
  const id = useId()
  return (
    <form
      data-testid="assign-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (to) run(() => assignLead({ leadId, advisorId: Number(to) }))
      }}
      className="grid gap-2"
    >
      <label htmlFor={id} className="text-sm font-bold">
        سپردن به مشاور
      </label>
      <div className="flex flex-wrap gap-2">
        <select id={id} value={to} onChange={(e) => setTo(e.target.value)} disabled={pending} className={cx(FIELD, 'min-w-40 flex-1')}>
          <option value="">انتخاب کنید</option>
          {advisors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending || !to} className={consoleBtn.secondary}>
          سپردن
        </button>
      </div>
      <Message msg={msg} testId="assign-message" />
    </form>
  )
}

export function MarkLostForm({ leadId }: { leadId: number }) {
  const { pending, msg, run } = useAction()
  const [reason, setReason] = useState<LeadLostReason | ''>('')
  const [note, setNote] = useState('')
  const ids = { reason: useId(), note: useId() }
  return (
    <form
      data-testid="mark-lost-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (reason) run(() => markLeadLost({ leadId, reason, note: note || undefined }))
      }}
      className="grid gap-3"
    >
      <label htmlFor={ids.reason} className="grid gap-1 text-sm font-bold">
        دلیل
        <select id={ids.reason} required value={reason} onChange={(e) => setReason(e.target.value as LeadLostReason)} disabled={pending} className={cx(FIELD, 'font-normal')}>
          <option value="">انتخاب کنید</option>
          {LEAD_LOST_REASONS.map((r) => (
            <option key={r} value={r}>
              {LEAD_LOST_REASON_LABELS_FA[r]}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={ids.note} className="grid gap-1 text-sm font-bold">
        توضیح <span className="text-xs font-normal text-muted">(اختیاری)</span>
        <input id={ids.note} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} disabled={pending} className={cx(FIELD, 'font-normal')} />
      </label>
      <div>
        <button type="submit" disabled={pending || !reason} className={consoleBtn.secondary}>
          ثبت «از دست رفت»
        </button>
      </div>
      <Message msg={msg} testId="mark-lost-message" />
    </form>
  )
}
