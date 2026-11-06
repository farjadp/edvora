'use client'

import { useActionState } from 'react'
import { submitLead, type FormState } from '../app/(frontend)/actions'

export function LeadForm({ courseId, page, compact = false }: { courseId?: number; page: string; compact?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitLead, null)

  if (state?.ok) {
    return (
      <div role="status" className="rounded-2xl border border-line bg-surface p-6 text-center">
        <p className="text-lg font-bold text-ok">✓ ثبت شد</p>
        <p className="mt-2 text-sm leading-7 text-muted">{state.message}</p>
      </div>
    )
  }

  return (
    <form action={action} className={compact ? 'grid gap-3' : 'grid gap-3 sm:grid-cols-[1fr_1fr_auto]'}>
      <input type="hidden" name="page" value={page} />
      {courseId ? <input type="hidden" name="courseId" value={courseId} /> : null}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <label className="sr-only" htmlFor={`lead-name-${page}`}>نام</label>
      <input
        id={`lead-name-${page}`}
        name="name"
        required
        placeholder="نام و نام خانوادگی"
        className="h-12 rounded-xl border border-line bg-surface px-4 outline-none focus:border-brand"
      />
      <label className="sr-only" htmlFor={`lead-phone-${page}`}>موبایل</label>
      <input
        id={`lead-phone-${page}`}
        name="phone"
        required
        inputMode="tel"
        dir="ltr"
        placeholder="۰۹۱۲ ۱۲۳ ۴۵۶۷"
        className="h-12 rounded-xl border border-line bg-surface px-4 text-end outline-none focus:border-brand"
      />
      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-xl bg-brand px-6 font-bold text-brand-ink transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? 'در حال ثبت…' : 'درخواست تماس مشاور'}
      </button>
      {state && !state.ok ? <p role="alert" className="text-sm text-danger sm:col-span-3">{state.message}</p> : null}
    </form>
  )
}
