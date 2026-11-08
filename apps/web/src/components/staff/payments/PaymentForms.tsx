'use client'

import { consoleBtn } from '@edvora/ui/console'
import { useActionState, useEffect, useId, useState } from 'react'
import { paymentReviewAction, recordManualPaymentAction, type PaymentDeskState } from '../../../app/(frontend)/staff/(desk)/payments/actions'

function useGo(state: PaymentDeskState) {
  useEffect(() => {
    if (state?.ok && state.redirectTo) window.location.assign(state.redirectTo)
  }, [state])
}

function Message({ state }: { state: PaymentDeskState }) {
  if (!state?.message) return null
  return (
    <p role={state.ok ? 'status' : 'alert'} className={`text-sm leading-6 ${state.ok ? 'text-ok' : 'text-danger'}`}>
      {state.message}
    </p>
  )
}

const field = 'h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm outline-none focus:border-focus focus:ring-1 focus:ring-focus'

/** Record / confirm / reject buttons for one payment. Only the actions the server allows this person are passed in. */
export function ReviewActions({ paymentId, actions, back }: { paymentId: number; actions: readonly ('record' | 'confirm' | 'reject')[]; back: string }) {
  const [state, action, pending] = useActionState<PaymentDeskState, FormData>(paymentReviewAction, null)
  const [rejecting, setRejecting] = useState(false)
  const id = useId()
  useGo(state)
  if (actions.length === 0) return null
  return (
    <form action={action} className="grid gap-2" data-testid={`review-${paymentId}`}>
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="back" value={back} />
      <div className="flex flex-wrap gap-2">
        {actions.includes('record') ? (
          <button name="action" value="record" disabled={pending} className={consoleBtn.small}>
            بررسی شد، ثبت برای تأیید
          </button>
        ) : null}
        {actions.includes('confirm') ? (
          <button name="action" value="confirm" disabled={pending} className={consoleBtn.small}>
            تأیید نهایی
          </button>
        ) : null}
        {actions.includes('reject') && !rejecting ? (
          <button type="button" onClick={() => setRejecting(true)} className={consoleBtn.small}>
            رد
          </button>
        ) : null}
      </div>
      {rejecting ? (
        <div className="grid gap-2">
          <label htmlFor={`${id}-r`} className="text-sm font-bold">
            دلیل رد (دانشجو آن را می‌بیند)
          </label>
          <textarea id={`${id}-r`} name="reason" required minLength={5} maxLength={500} rows={2} className="rounded-lg border border-line-strong bg-surface p-2 text-sm" />
          <div className="flex gap-2">
            <button name="action" value="reject" disabled={pending} className={consoleBtn.small}>
              ثبت رد
            </button>
            <button type="button" onClick={() => setRejecting(false)} className={consoleBtn.small}>
              انصراف
            </button>
          </div>
        </div>
      ) : null}
      <Message state={state} />
    </form>
  )
}

/** Cash / POS / transfer recorded by staff. A second person confirms it from the queue. */
export function ManualPaymentForm({ orderId, channels }: { orderId?: number; channels: readonly { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState<PaymentDeskState, FormData>(recordManualPaymentAction, null)
  const id = useId()
  useGo(state)
  return (
    <form action={action} className="grid gap-3" data-testid="manual-payment-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={`${id}-o`} className="grid gap-1 text-sm font-bold">
          شمارهٔ سفارش
          <input id={`${id}-o`} name="orderId" defaultValue={orderId} required inputMode="numeric" dir="ltr" className={`${field} text-end font-latin`} />
        </label>
        <label htmlFor={`${id}-c`} className="grid gap-1 text-sm font-bold">
          شیوه
          <select id={`${id}-c`} name="channel" className={field}>
            {channels.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-p`} className="grid gap-1 text-sm font-bold">
          کدام قسط
          <select id={`${id}-p`} name="pick" className={field}>
            <option value="next">قسط بعدی</option>
            <option value="all">همهٔ اقساط باقی‌مانده</option>
          </select>
        </label>
        <label htmlFor={`${id}-t`} className="grid gap-1 text-sm font-bold">
          زمان پرداخت
          <input id={`${id}-t`} name="paidAt" type="datetime-local" required dir="ltr" className={`${field} font-latin`} />
        </label>
        <label htmlFor={`${id}-ref`} className="grid gap-1 text-sm font-bold sm:col-span-2">
          شمارهٔ رسید / مرجع (اختیاری)
          <input id={`${id}-ref`} name="reference" maxLength={60} dir="ltr" className={`${field} font-latin`} />
        </label>
        <label htmlFor={`${id}-n`} className="grid gap-1 text-sm font-bold sm:col-span-2">
          یادداشت (اختیاری)
          <textarea id={`${id}-n`} name="note" maxLength={500} rows={2} className="rounded-lg border border-line-strong bg-surface p-2 text-sm" />
        </label>
      </div>
      <p className="text-xs leading-6 text-muted">مبلغ از روی قسط‌های سفارش محاسبه می‌شود. پس از ثبت، همکار دیگری با دسترسی تأیید باید آن را تأیید کند.</p>
      <div>
        <button disabled={pending} className={consoleBtn.primary}>
          {pending ? 'در حال ثبت…' : 'ثبت پرداخت دستی'}
        </button>
      </div>
      <Message state={state} />
    </form>
  )
}
