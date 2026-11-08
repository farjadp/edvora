'use client'

import { buttonClass, inputClass } from '@edvora/ui/classes'
import { useActionState } from 'react'
import { startUsdtCheckout, submitCardCheckout, submitUsdtHashAction, type FormState } from '../../app/(frontend)/actions'
import { useRedirectTo } from '../useRedirectTo'

/** Student payment forms (ADR 017). Server actions do every check; these only collect input. */

function Alert({ state }: { state: FormState }) {
  if (!state?.message || state.redirectTo) return null
  return (
    <p role={state.ok ? 'status' : 'alert'} className={`text-sm leading-7 ${state.ok ? 'text-muted' : 'text-danger'}`}>
      {state.message}
    </p>
  )
}

const label = 'grid gap-1.5 text-sm font-bold'
const hint = 'text-xs font-normal leading-6 text-muted'

export function CardTransferForm(props: { orderId: number; method: number; pick: string; cards: { number: string; holder: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitCardCheckout, null)
  useRedirectTo(state)
  return (
    <form action={action} className="grid gap-4" data-testid="card-form">
      <input type="hidden" name="orderId" value={props.orderId} />
      <input type="hidden" name="method" value={props.method} />
      <input type="hidden" name="pick" value={props.pick} />
      {props.cards.length > 1 ? (
        <label className={label}>
          کارت مقصد
          <select name="toCard" className={inputClass({ tone: 'bg', className: 'font-latin' })} dir="ltr">
            {props.cards.map((c) => (
              <option key={c.number} value={c.number}>
                {c.number} — {c.holder}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="toCard" value={props.cards[0]?.number ?? ''} />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          ۴ رقم آخر کارت شما
          <input name="last4" required inputMode="numeric" maxLength={4} autoComplete="off" dir="ltr" className={inputClass({ tone: 'bg', className: 'text-end font-latin' })} />
          <span className={hint}>کارتی که از آن پول را فرستادید.</span>
        </label>
        <label className={label}>
          شمارهٔ پیگیری یا مرجع
          <input name="tracking" required inputMode="numeric" maxLength={20} autoComplete="off" dir="ltr" className={inputClass({ tone: 'bg', className: 'text-end font-latin' })} />
          <span className={hint}>روی رسید یا پیامک بانک آمده است.</span>
        </label>
      </div>
      <label className={label}>
        زمان واریز
        <input name="paidAt" type="datetime-local" required dir="ltr" className={inputClass({ tone: 'bg', className: 'text-end font-latin' })} />
        <span className={hint}>به وقت ایران.</span>
      </label>
      <label className={label}>
        تصویر رسید (اختیاری)
        <input name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="text-sm file:me-3 file:rounded-lg file:border file:border-line-strong file:bg-bg file:px-3 file:py-2" />
        <span className={hint}>فقط کارشناسان مالی آکادمی آن را می‌بینند. حداکثر ۵ مگابایت.</span>
      </label>
      <button type="submit" disabled={pending || Boolean(state?.redirectTo)} className={buttonClass()}>
        {pending ? 'در حال ثبت…' : 'ثبت اطلاعات واریز'}
      </button>
      <Alert state={state} />
    </form>
  )
}

export function UsdtStartForm(props: { orderId: number; method: number; pick: string; networks: { network: string; label: string; chain: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(startUsdtCheckout, null)
  useRedirectTo(state)
  return (
    <form action={action} className="grid gap-4" data-testid="usdt-start">
      <input type="hidden" name="orderId" value={props.orderId} />
      <input type="hidden" name="method" value={props.method} />
      <input type="hidden" name="pick" value={props.pick} />
      <fieldset>
        <legend className="mb-2 text-sm font-bold">شبکه</legend>
        <div className="flex flex-wrap gap-2">
          {props.networks.map((n, i) => (
            <label
              key={n.network}
              className="cursor-pointer rounded-xl border border-line-strong px-3 py-2 text-sm has-checked:border-brand has-checked:bg-brand has-checked:text-brand-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus"
            >
              <input type="radio" name="network" value={n.network} defaultChecked={i === 0} className="sr-only" />
              <span className="font-latin">{n.label}</span> · {n.chain}
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" disabled={pending || Boolean(state?.redirectTo)} className={buttonClass()}>
        {pending ? 'در حال آماده‌سازی…' : 'دیدن آدرس و مبلغ تتر'}
      </button>
      <Alert state={state} />
    </form>
  )
}

export function UsdtHashForm(props: { paymentId: number; hasHash: boolean; placeholder: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitUsdtHashAction, null)
  useRedirectTo(state)
  return (
    <form action={action} className="grid gap-3" data-testid="usdt-hash">
      <input type="hidden" name="paymentId" value={props.paymentId} />
      {props.hasHash ? null : (
        <label className={label}>
          شناسهٔ تراکنش (TxID / Hash)
          <input name="txHash" required autoComplete="off" spellCheck={false} dir="ltr" placeholder={props.placeholder} className={inputClass({ tone: 'bg', className: 'font-latin text-sm' })} />
          <span className={hint}>پس از ارسال، آن را از کیف پول یا صرافی خود کپی کنید.</span>
        </label>
      )}
      <button type="submit" disabled={pending} className={buttonClass()}>
        {pending ? 'در حال بررسی روی شبکه…' : props.hasHash ? 'بررسی دوباره' : 'ثبت و بررسی تراکنش'}
      </button>
      <Alert state={state} />
    </form>
  )
}
