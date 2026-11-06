'use client'

import { toPersianDigits } from '@edvora/core/digits'
import { useActionState, useState } from 'react'
import { startCheckout, type FormState } from '../app/(frontend)/actions'
import { useRedirectTo } from './useRedirectTo'

export type EnrollCardProps = {
  cohortId: number | null
  back: string
  priceLabel: string
  startLabel?: string
  schedule?: string | null
  seatsLeftLabel?: string | null
  maxInstalments: number
  instalmentPreview: Record<number, string>
  statusLabel: string
}

export function EnrollCard(props: EnrollCardProps) {
  const [state, action, pending] = useActionState<FormState, FormData>(startCheckout, null)
  useRedirectTo(state)
  const [count, setCount] = useState(1)
  const options = Array.from({ length: props.maxInstalments }, (_, i) => i + 1)

  return (
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
      <p className="text-sm text-muted">{props.statusLabel}</p>
      <p className="mt-1 text-3xl font-black">{props.priceLabel}</p>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        {props.startLabel ? (
          <div className="rounded-xl bg-sunken p-3">
            <dt className="text-muted">شروع</dt>
            <dd className="mt-1 font-bold">{props.startLabel}</dd>
          </div>
        ) : null}
        {props.schedule ? (
          <div className="rounded-xl bg-sunken p-3">
            <dt className="text-muted">زمان</dt>
            <dd className="mt-1 font-bold">{props.schedule}</dd>
          </div>
        ) : null}
        {props.seatsLeftLabel ? (
          <div className="col-span-2 rounded-xl bg-sunken p-3">
            <dt className="text-muted">ظرفیت باقی‌مانده</dt>
            <dd className="mt-1 font-bold">{props.seatsLeftLabel}</dd>
          </div>
        ) : null}
      </dl>

      {props.cohortId ? (
        <form action={action} className="mt-5 grid gap-3">
          <input type="hidden" name="cohortId" value={props.cohortId} />
          <input type="hidden" name="back" value={props.back} />
          {props.maxInstalments > 1 ? (
            <fieldset>
              <legend className="mb-2 text-sm font-bold">روش پرداخت</legend>
              <div className="flex flex-wrap gap-2">
                {options.map((n) => (
                  <label
                    key={n}
                    className="cursor-pointer rounded-xl border border-line px-3 py-2 text-sm has-checked:border-brand has-checked:bg-brand has-checked:text-brand-ink"
                  >
                    <input type="radio" name="instalments" value={n} checked={count === n} onChange={() => setCount(n)} className="sr-only" />
                    {n === 1 ? 'یکجا' : `${toPersianDigits(n)} قسط`}
                  </label>
                ))}
              </div>
              {count > 1 ? <p className="mt-2 text-xs leading-6 text-muted">{props.instalmentPreview[count]}</p> : null}
            </fieldset>
          ) : (
            <input type="hidden" name="instalments" value={1} />
          )}
          <input
            name="coupon"
            placeholder="کد تخفیف (اختیاری)"
            dir="ltr"
            className="h-11 rounded-xl border border-line bg-bg px-4 text-end font-latin text-sm outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={pending}
            className="h-12 rounded-xl bg-brand font-bold text-brand-ink transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending || state?.redirectTo ? 'در حال اتصال به درگاه…' : 'ثبت‌نام و پرداخت'}
          </button>
          {state && !state.ok ? <p role="alert" className="text-sm text-danger">{state.message}</p> : null}
        </form>
      ) : (
        <p className="mt-5 rounded-xl bg-sunken p-4 text-sm leading-7 text-muted">ورودی جدید هنوز اعلام نشده. فرم مشاوره را پر کنید تا خبرتان کنیم.</p>
      )}
    </div>
  )
}
