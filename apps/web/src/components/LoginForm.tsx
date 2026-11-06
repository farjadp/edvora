'use client'

import { useActionState } from 'react'
import { requestOtp, verifyOtp, type FormState } from '../app/(frontend)/actions'
import { useRedirectTo } from './useRedirectTo'

const input = 'h-12 w-full rounded-xl border border-line bg-bg px-4 outline-none focus:border-brand'
const button = 'h-12 w-full rounded-xl bg-brand font-bold text-brand-ink transition-opacity hover:opacity-90 disabled:opacity-60'

export function LoginForm({ next }: { next: string }) {
  const [sent, request, requesting] = useActionState<FormState, FormData>(requestOtp, null)
  const [verified, verify, verifying] = useActionState<FormState, FormData>(verifyOtp, null)
  useRedirectTo(verified)
  const step = verified?.step ?? sent?.step ?? 'phone'
  const phone = verified?.phone ?? sent?.phone

  if (step === 'code' && phone) {
    return (
      <form action={verify} className="grid gap-4">
        <input type="hidden" name="phone" value={phone} />
        <input type="hidden" name="next" value={next} />
        <p className="text-sm leading-7 text-muted">
          کد ۵ رقمی به <span dir="ltr" className="font-latin">{phone}</span> پیامک شد.
        </p>
        {sent?.devCode ? (
          <p className="rounded-xl bg-sunken p-3 text-sm">
            حالت توسعه (پیامک آزمایشی): کد <span className="font-latin font-bold">{sent.devCode}</span>
          </p>
        ) : null}
        <label className="grid gap-2 text-sm font-bold">
          کد ورود
          <input name="code" required inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={8} className={`${input} text-center font-latin text-xl tracking-[0.5em]`} />
        </label>
        <label className="grid gap-2 text-sm font-bold">
          نام و نام خانوادگی <span className="font-normal text-muted">(برای کاربران جدید)</span>
          <input name="name" autoComplete="name" className={input} />
        </label>
        <button disabled={verifying} className={button}>{verifying || verified?.redirectTo ? 'در حال ورود…' : 'ورود'}</button>
        {verified && !verified.ok ? <p role="alert" className="text-sm text-danger">{verified.message}</p> : null}
      </form>
    )
  }

  return (
    <form action={request} className="grid gap-4">
      <label className="grid gap-2 text-sm font-bold">
        شماره موبایل
        <input name="phone" required inputMode="tel" autoComplete="tel" dir="ltr" placeholder="09121234567" className={`${input} text-end font-latin`} />
      </label>
      <button disabled={requesting} className={button}>{requesting ? 'در حال ارسال…' : 'دریافت کد ورود'}</button>
      {sent && !sent.ok ? <p role="alert" className="text-sm text-danger">{sent.message}</p> : null}
    </form>
  )
}
