'use client'

import { buttonClass, inputClass } from '@edvora/ui/classes'
import { useActionState } from 'react'
import { submitImportClaim, type FormState } from '../app/(frontend)/actions'

/** W23: "if you bought on our old site, tell us" — shown on the dashboard after a WordPress import. */
export function ImportClaimForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(submitImportClaim, null)
  if (state?.ok) {
    return (
      <p role="status" className="rounded-xl border border-ok bg-surface p-4 text-sm leading-7">
        {state.message}
      </p>
    )
  }
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-bold">
        نام شما در سایت قبلی
        <input name="oldName" required minLength={2} maxLength={80} className={inputClass()} />
      </label>
      <label className="grid gap-1 text-sm font-bold">
        ایمیل سایت قبلی (اختیاری)
        <input name="oldEmail" type="email" dir="ltr" maxLength={120} className={inputClass({ className: 'text-end' })} />
      </label>
      <label className="grid gap-1 text-sm font-bold sm:col-span-2">
        توضیح (مثلاً نام دوره یا شمارهٔ قبلی)
        <textarea name="message" maxLength={500} rows={2} className={inputClass()} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass({ className: 'px-6 sm:w-fit' })}>
        {pending ? 'در حال ثبت…' : 'ثبت درخواست'}
      </button>
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-danger sm:col-span-2">
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
