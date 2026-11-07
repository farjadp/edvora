'use client'

import { cx, focusRing } from '@edvora/ui'
import { toPersianDigits } from '@edvora/core/digits'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { OptionId } from '../_lib/options'
import { Icon } from './art'
import { disp, inputCls, linkCls, primaryCls, secondaryCls } from './ui'

/** Static mock: submit does nothing. */
export function MockForm({ children, busy = false, className, label }: { children: ReactNode; busy?: boolean; className?: string; label: string }) {
  return (
    <form
      aria-label={label}
      aria-busy={busy || undefined}
      noValidate
      onSubmit={(e: FormEvent) => e.preventDefault()}
      className={className}
    >
      {children}
    </form>
  )
}

const mmss = (s: number) => toPersianDigits(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`)

/** Counts down once a second while `live`; frozen at `seconds` otherwise (screenshots). */
function useCountdown(seconds: number, live: boolean): number {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1000)
    return () => window.clearInterval(id)
  }, [live])
  return left
}

/**
 * S11: the resend line. The ticking time is NOT a live region (role=timer is implicitly off);
 * it is announced once, when it reaches zero and the line becomes a button.
 */
export function ResendTimer({ o, seconds, live }: { o: OptionId; seconds: number; live: boolean }) {
  const left = useCountdown(seconds, live)
  return (
    <div className="min-h-11">
      {left > 0 ? (
        <p role="timer" aria-live="off" className="flex min-h-11 items-center text-sm text-muted">
          <span>
            ارسال دوباره‌ی کد تا <span dir="ltr" className="inline-block font-bold tabular-nums text-ink">{mmss(left)}</span> دیگر
          </span>
        </p>
      ) : (
        <>
          <button type="button" className={cx(o === 'c' ? linkCls : secondaryCls(o))}>
            <Icon name="refresh" className="size-4" />
            کد نرسید؟ ارسال دوباره
          </button>
          <p role="status" className="sr-only">می‌توانید دوباره کد بگیرید</p>
        </>
      )}
    </div>
  )
}

/** Lock banner with a mm:ss timer (V4 / T6 / S9). Alert once; the timer never announces ticks; at 0 the form opens with a polite status. */
export function LockGate({
  o,
  seconds,
  live,
  text,
  locked,
  open,
  openStatus,
}: {
  o: OptionId
  seconds: number
  live: boolean
  text: string
  locked: ReactNode
  open: ReactNode
  openStatus: string
}) {
  const left = useCountdown(seconds, live)
  const lockedNow = left > 0
  return (
    <>
      {lockedNow ? (
        <div role="alert" className={cx('mb-5 border-danger p-4', o === 'c' ? 'border-s-4 ps-4' : cx('border-2', o === 'a' ? 'rounded-lg' : 'rounded-md'))}>
          <p className="flex items-start gap-2.5 leading-7">
            <Icon name="lock" className="mt-1 text-danger" />
            <span>
              <strong className="text-danger">قفل.</strong> {text}
            </span>
          </p>
          <p role="timer" aria-live="off" className="mt-3 flex flex-wrap items-baseline gap-x-3 ps-[1.875rem]">
            <span className="text-sm font-medium">زمان باقی‌مانده:</span>
            <span dir="ltr" className={cx(disp, 'text-3xl font-black tabular-nums')}>
              {mmss(left)}
            </span>
          </p>
        </div>
      ) : (
        <p role="status" className="mb-5 flex items-center gap-2.5 text-sm font-medium">
          <Icon name="check" className="text-ok" />
          {openStatus}
        </p>
      )}
      {lockedNow ? locked : open}
    </>
  )
}

/** Password field with a show/hide toggle (T1). `aria-pressed` on the button; the input keeps autocomplete=current-password. */
export function PasswordField({ o, label, invalid, describedBy, disabled, defaultValue, error }: { o: OptionId; label: string; invalid?: boolean; describedBy?: string; disabled?: boolean; defaultValue?: string; error?: string }) {
  const [shown, setShown] = useState(false)
  const id = useId()
  const errId = `${id}-err`
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold">{label}</label>
      <div className="relative">
        <input
          id={id}
          name="password"
          type={shown ? 'text' : 'password'}
          dir="ltr"
          autoComplete="current-password"
          spellCheck={false}
          autoCapitalize="none"
          aria-invalid={invalid || undefined}
          aria-describedby={error ? errId : describedBy}
          disabled={disabled}
          defaultValue={defaultValue}
          className={cx(inputCls(o, invalid), 'pe-12 text-end')}
        />
        <button
          type="button"
          aria-pressed={shown}
          aria-label="نمایش رمز عبور"
          disabled={disabled}
          onClick={() => setShown((v) => !v)}
          className={cx('absolute inset-y-0 end-0 grid w-11 place-items-center text-muted hover:text-ink disabled:opacity-60', focusRing)}
        >
          <Icon name={shown ? 'eye-off' : 'eye'} />
        </button>
      </div>
      {error ? (
        <p id={errId} className="mt-1.5 flex items-start gap-1.5 text-sm text-danger">
          <Icon name="alert" className="mt-0.5 size-4" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  )
}

/**
 * One real input (autofill / paste friendly) over N visual boxes. one-time-code, numeric, ltr.
 * Accepts Persian digits and spaces: the preview normalises to Latin for display like the real forms do.
 */
export function CodeField({ o, label, length, disabled, invalid, describedBy, hint }: { o: OptionId; label: string; length: 5 | 6; disabled?: boolean; invalid?: boolean; describedBy?: string; hint?: string }) {
  const id = useId()
  const hintId = `${id}-hint`
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const normalise = (s: string) =>
    s
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/\D/g, '')
      .slice(0, length)
  const box = (i: number) => {
    const active = focused && !disabled && i === Math.min(value.length, length - 1)
    const border = invalid ? 'border-danger' : active ? 'border-focus' : 'border-line-strong'
    if (o === 'c') return cx('h-14 border-0 border-b-2 text-3xl', border, active && 'border-b-4')
    return cx('h-14 border text-2xl', o === 'a' ? 'rounded-lg bg-surface' : 'rounded-sm bg-bg', border, active && 'ring-1 ring-focus')
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold">{label}</label>
      <div dir="ltr" className={cx('relative', disabled && 'opacity-60')}>
        <div aria-hidden="true" className={cx('grid gap-2', length === 5 ? 'grid-cols-5' : 'grid-cols-6')}>
          {Array.from({ length }, (_, i) => (
            <span key={i} className={cx('grid place-items-center font-latin font-bold tabular-nums text-ink', box(i))}>
              {value[i] ?? ''}
            </span>
          ))}
        </div>
        <input
          ref={ref}
          id={id}
          name="code"
          value={value}
          onChange={(e) => setValue(normalise(e.target.value))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={length * 2}
          dir="ltr"
          spellCheck={false}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={cx(hint ? hintId : false, describedBy) || undefined}
          className="absolute inset-0 size-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 focus:outline-none"
        />
      </div>
      {hint ? <p id={hintId} className="mt-1.5 text-sm text-muted">{hint}</p> : null}
    </div>
  )
}

/** Primary button content: label + (option C) an arrow at the end. */
export function PrimaryButton({ o, children, disabled, busy, type = 'submit' }: { o: OptionId; children: ReactNode; disabled?: boolean; busy?: boolean; type?: 'submit' | 'button' }) {
  return (
    <button type={type} disabled={disabled} className={primaryCls(o)}>
      <span className="inline-flex items-center gap-2">
        {busy ? <span aria-hidden="true" className="size-4 rounded-full border-2 border-current border-e-transparent" /> : null}
        {children}
      </span>
      {o === 'c' && !busy ? <Icon name="arrow" /> : null}
    </button>
  )
}
