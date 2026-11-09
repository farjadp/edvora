'use client'

import { consoleBtn } from '@edvora/ui/console'
import { useActionState, useEffect, useId, useState } from 'react'
import {
  contactNoteAction,
  refundRequestAction,
  refundReviewAction,
  type FinanceDeskState,
} from '../../../app/(frontend)/staff/(desk)/payments/finance-actions'

function useGo(state: FinanceDeskState) {
  useEffect(() => {
    if (state?.ok && state.redirectTo) window.location.assign(state.redirectTo)
  }, [state])
}

function Message({ state }: { state: FinanceDeskState }) {
  if (!state?.message) return null
  return (
    <p role={state.ok ? 'status' : 'alert'} className={`text-sm leading-6 ${state.ok ? 'text-ok' : 'text-danger'}`}>
      {state.message}
    </p>
  )
}

const field = 'h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm outline-none focus:border-focus focus:ring-1 focus:ring-focus'
const area = 'rounded-lg border border-line-strong bg-surface p-2 text-sm outline-none focus:border-focus focus:ring-1 focus:ring-focus'

/** «ثبت تماس» on an overdue row: outcome + optional note. */
export function ContactNoteForm({ orderId, index, outcomes, back }: { orderId: number; index: number; outcomes: readonly { value: string; label: string }[]; back: string }) {
  const [state, action, pending] = useActionState<FinanceDeskState, FormData>(contactNoteAction, null)
  const id = useId()
  useGo(state)
  return (
    <details className="group" data-testid={`contact-${orderId}-${index}`}>
      <summary className={`${consoleBtn.small} cursor-pointer list-none`}>ثبت تماس</summary>
      <form action={action} className="mt-2 grid min-w-56 gap-2">
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="instalmentIndex" value={index} />
        <input type="hidden" name="back" value={back} />
        <label htmlFor={`${id}-o`} className="grid gap-1 text-xs font-bold">
          نتیجه
          <select id={`${id}-o`} name="outcome" required className={field}>
            {outcomes.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-n`} className="grid gap-1 text-xs font-bold">
          یادداشت (اختیاری)
          <textarea id={`${id}-n`} name="note" maxLength={500} rows={2} className={area} />
        </label>
        <div>
          <button disabled={pending} className={consoleBtn.small}>
            {pending ? 'در حال ثبت…' : 'ثبت یادداشت'}
          </button>
        </div>
        <Message state={state} />
      </form>
    </details>
  )
}

/** Refund request on the order page. The amount is typed in toman; the server converts and checks the limit. */
export function RefundRequestForm({ orderId, maxToman, maxLabel }: { orderId: number; maxToman: number; maxLabel: string }) {
  const [state, action, pending] = useActionState<FinanceDeskState, FormData>(refundRequestAction, null)
  // Controlled: React resets uncontrolled fields after every submit, which would wipe them on a refusal.
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const id = useId()
  useGo(state)
  return (
    <form action={action} className="grid gap-3" data-testid="refund-request-form">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={`${id}-a`} className="grid gap-1 text-sm font-bold">
          مبلغ بازپرداخت (تومان)
          <input
            id={`${id}-a`}
            name="amount"
            required
            inputMode="numeric"
            dir="ltr"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${field} text-end font-latin`}
          />
        </label>
        <div className="grid content-end gap-1 text-sm">
          <span className="text-muted">سقف قابل بازپرداخت: {maxLabel}</span>
          <button type="button" onClick={() => setAmount(String(maxToman))} className={`${consoleBtn.small} justify-self-start`}>
            کل مبلغ
          </button>
        </div>
        <label htmlFor={`${id}-r`} className="grid gap-1 text-sm font-bold sm:col-span-2">
          دلیل بازپرداخت
          <textarea id={`${id}-r`} name="reason" required minLength={5} maxLength={500} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={area} />
        </label>
      </div>
      <p className="text-xs leading-6 text-muted">
        بازپرداخت کامل سفارش را می‌بندد و ثبت‌نام دانشجو را لغو می‌کند. بازپرداخت بخشی فقط مبلغ را ثبت می‌کند. تأیید با همکار دیگری است.
      </p>
      <div>
        <button disabled={pending} className={consoleBtn.primary}>
          {pending ? 'در حال ثبت…' : 'ثبت درخواست بازپرداخت'}
        </button>
      </div>
      <Message state={state} />
    </form>
  )
}

/** Approve / reject / cancel / mark refunded. Only the actions the server allows this person are passed in. */
export function RefundActions({ refundId, actions, back }: { refundId: number; actions: readonly ('approve' | 'reject' | 'cancel' | 'complete')[]; back: string }) {
  const [state, action, pending] = useActionState<FinanceDeskState, FormData>(refundReviewAction, null)
  const [mode, setMode] = useState<'reject' | 'complete' | null>(null)
  const id = useId()
  useGo(state)
  if (actions.length === 0) return null
  return (
    <form action={action} className="grid gap-2" data-testid={`refund-actions-${refundId}`}>
      <input type="hidden" name="refundId" value={refundId} />
      <input type="hidden" name="back" value={back} />
      {mode === null ? (
        <div className="flex flex-wrap gap-2">
          {actions.includes('approve') ? (
            <button name="action" value="approve" disabled={pending} className={consoleBtn.small}>
              تأیید بازپرداخت
            </button>
          ) : null}
          {actions.includes('complete') ? (
            <button type="button" onClick={() => setMode('complete')} className={consoleBtn.small}>
              ثبت واریز
            </button>
          ) : null}
          {actions.includes('reject') ? (
            <button type="button" onClick={() => setMode('reject')} className={consoleBtn.small}>
              رد
            </button>
          ) : null}
          {actions.includes('cancel') ? (
            <button name="action" value="cancel" disabled={pending} className={consoleBtn.small}>
              لغو درخواست
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-2">
          {mode === 'reject' ? (
            <label htmlFor={`${id}-r`} className="grid gap-1 text-sm font-bold">
              دلیل رد
              <textarea id={`${id}-r`} name="reason" required minLength={5} maxLength={500} rows={2} className={area} />
            </label>
          ) : (
            <label htmlFor={`${id}-ref`} className="grid gap-1 text-sm font-bold">
              شمارهٔ پیگیری واریز
              <input id={`${id}-ref`} name="reference" required minLength={3} maxLength={60} dir="ltr" className={`${field} font-latin`} />
            </label>
          )}
          <div className="flex gap-2">
            <button name="action" value={mode} disabled={pending} className={consoleBtn.small}>
              {mode === 'reject' ? 'ثبت رد' : 'ثبت واریز بازپرداخت'}
            </button>
            <button type="button" onClick={() => setMode(null)} className={consoleBtn.small}>
              انصراف
            </button>
          </div>
        </div>
      )}
      <Message state={state} />
    </form>
  )
}
