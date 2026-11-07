'use client'

import { toLatinDigits, toPersianDigits } from '@edvora/core/digits'
import { cx, focusRing } from '@edvora/ui'
import { SealIcon } from '@edvora/ui/seal'
import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react'
import { authInput, authLink, authPrimary, authSecondary } from './kit'

/* Interactive pieces of the Seal login kit (E-034). Client components; no network calls here. */

export type AuthFieldProps = {
  id: string
  label: ReactNode
  name: string
  type?: 'text' | 'email' | 'tel'
  value: string
  onChange: (value: string) => void
  autoComplete: string
  inputMode?: 'tel' | 'text' | 'email' | 'numeric'
  placeholder?: string
  /** LTR value (phone, email) inside the RTL page: aligned to the end, no spellcheck or capitalisation. */
  latin?: boolean
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  error?: string | null
  /** Marks the field invalid when the message lives in the form's alert region instead of under the field. */
  invalid?: boolean
  hint?: ReactNode
  /** Extra aria-describedby ids (e.g. the form's alert region). */
  describedBy?: string
  inputRef?: Ref<HTMLInputElement>
}

export function AuthField({ id, label, name, type = 'text', value, onChange, autoComplete, inputMode, placeholder, latin, disabled, readOnly, required, error, invalid, hint, describedBy, inputRef }: AuthFieldProps) {
  const errId = `${id}-err`
  const hintId = `${id}-hint`
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold">
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir={latin ? 'ltr' : undefined}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        aria-required={required || undefined}
        spellCheck={latin ? false : undefined}
        autoCapitalize={latin ? 'none' : undefined}
        aria-invalid={error || invalid ? true : undefined}
        aria-describedby={cx(error ? errId : false, hint ? hintId : false, describedBy) || undefined}
        className={cx(authInput(Boolean(error) || Boolean(invalid)), latin && 'text-end font-latin')}
      />
      {hint ? (
        <p id={hintId} className="mt-1.5 text-sm leading-7 text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} className="mt-1.5 flex items-start gap-1.5 text-sm text-danger">
          <SealIcon name="alert" className="mt-0.5 size-4" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  )
}

/** Password with a show/hide toggle (T1). The toggle's name avoids «رمز عبور» so the field label stays unique. */
export function PasswordField({
  id,
  value,
  onChange,
  error,
  describedBy,
  disabled,
  readOnly,
  inputRef,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  error?: string | null
  describedBy?: string
  disabled?: boolean
  readOnly?: boolean
  inputRef?: Ref<HTMLInputElement>
}) {
  const [shown, setShown] = useState(false)
  const errId = `${id}-err`
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold">
        رمز عبور
      </label>
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          name="password"
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          dir="ltr"
          autoComplete="current-password"
          spellCheck={false}
          autoCapitalize="none"
          aria-invalid={error ? true : undefined}
          aria-describedby={cx(error ? errId : false, describedBy) || undefined}
          disabled={disabled}
          readOnly={readOnly}
          className={cx(authInput(Boolean(error)), 'pe-12 text-end font-latin')}
        />
        <button
          type="button"
          aria-pressed={shown}
          aria-label="نمایش رمز"
          disabled={disabled}
          onClick={() => setShown((v) => !v)}
          className={cx('absolute inset-y-0 end-0 grid w-11 place-items-center rounded-sm text-muted hover:text-ink disabled:opacity-60', focusRing)}
        >
          <SealIcon name={shown ? 'eye-off' : 'eye'} />
        </button>
      </div>
      {error ? (
        <p id={errId} className="mt-1.5 flex items-start gap-1.5 text-sm text-danger">
          <SealIcon name="alert" className="mt-0.5 size-4" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  )
}

/** Strip spaces and non-digits, accept Persian/Arabic digits, cap at `length`. */
export function normaliseDigits(raw: string, length: number): string {
  return toLatinDigits(raw).replace(/\D/g, '').slice(0, length)
}

/**
 * One real input (autofill, paste and password managers keep working) laid over N visual boxes. one-time-code,
 * numeric keypad, LTR. Accepts Persian/Arabic digits and spaces; the value is normalised to Latin digits.
 */
export function CodeBoxes({
  label,
  length,
  value,
  onChange,
  name,
  disabled,
  error,
  invalid: invalidProp,
  hint,
  describedBy,
  inputRef,
}: {
  label: string
  length: 5 | 6
  value: string
  onChange: (value: string) => void
  name?: string
  disabled?: boolean
  error?: string | null
  /** Invalid without a message under the field (the message is in the form's alert region). */
  invalid?: boolean
  hint?: ReactNode
  describedBy?: string
  inputRef?: Ref<HTMLInputElement>
}) {
  const id = useId()
  const errId = `${id}-err`
  const hintId = `${id}-hint`
  const [focused, setFocused] = useState(false)
  const invalid = Boolean(error) || Boolean(invalidProp)
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold">
        {label}
      </label>
      <div dir="ltr" className={cx('relative', disabled && 'opacity-60')}>
        <div aria-hidden="true" className={cx('grid gap-2', length === 5 ? 'grid-cols-5' : 'grid-cols-6')}>
          {Array.from({ length }, (_, i) => {
            const active = focused && !disabled && i === Math.min(value.length, length - 1)
            return (
              <span
                key={i}
                className={cx(
                  'grid h-14 place-items-center rounded-sm border bg-bg font-latin text-2xl font-bold tabular-nums text-ink',
                  invalid ? 'border-danger' : active ? 'border-focus ring-1 ring-focus' : 'border-line-strong',
                )}
              >
                {value[i] ?? ''}
              </span>
            )
          })}
        </div>
        <input
          id={id}
          ref={inputRef}
          name={name}
          value={value}
          onChange={(e) => onChange(normaliseDigits(e.target.value, length))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={length + 8}
          dir="ltr"
          spellCheck={false}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={cx(error ? errId : false, hint ? hintId : false, describedBy) || undefined}
          className="absolute inset-0 size-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 focus:outline-none disabled:cursor-not-allowed"
        />
      </div>
      {error ? (
        <p id={errId} className="mt-1.5 flex items-start gap-1.5 text-sm text-danger">
          <SealIcon name="alert" className="mt-0.5 size-4" />
          <span>{error}</span>
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="mt-1.5 text-sm leading-7 text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** Primary submit with a static busy ring (no spin: reduced motion and low-end phones). */
export function PrimaryButton({ children, busy, disabled, type = 'submit', onClick }: { children: ReactNode; busy?: boolean; disabled?: boolean; type?: 'submit' | 'button'; onClick?: () => void }) {
  return (
    <button type={type} disabled={disabled || busy} onClick={onClick} className={authPrimary}>
      {busy ? <span aria-hidden="true" className="size-4 rounded-full border-2 border-current border-e-transparent" /> : null}
      {children}
    </button>
  )
}

export function SecondaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={authSecondary}>
      {children}
    </button>
  )
}

export function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return toPersianDigits(`${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`)
}

/** Milliseconds left until `until` (epoch ms), ticking once a second; null before the first client tick (no SSR mismatch). */
export function useRemaining(until: number | null, onExpire?: () => void): number | null {
  const [left, setLeft] = useState<number | null>(null)
  const expire = useRef(onExpire)
  useEffect(() => {
    expire.current = onExpire
  }, [onExpire])
  useEffect(() => {
    if (until === null) {
      setLeft(null)
      return
    }
    let fired = false
    const tick = () => {
      const ms = until - Date.now()
      setLeft(Math.max(0, ms))
      if (ms <= 0 && !fired) {
        fired = true
        expire.current?.()
      }
    }
    tick()
    const t = window.setInterval(tick, 1000)
    return () => window.clearInterval(t)
  }, [until])
  return left
}

/**
 * S11: «ارسال دوباره‌ی کد تا ۰۰:۴۵ دیگر». The ticking time is a role=timer (not live); the line is announced once, when
 * it reaches zero and becomes a button.
 */
export function ResendTimer({ until, resend, busy }: { until: number; resend: ReactNode; busy?: boolean }) {
  const left = useRemaining(until)
  const waiting = left === null || left > 0
  return (
    <div className="min-h-11">
      {waiting ? (
        <p className="flex min-h-11 items-center text-sm text-muted">
          <span>
            ارسال دوباره‌ی کد تا{' '}
            <span role="timer" dir="ltr" className="inline-block font-bold tabular-nums text-ink">
              {left === null ? '' : mmss(left)}
            </span>{' '}
            دیگر
          </span>
        </p>
      ) : (
        <>
          {resend}
          {busy ? null : (
            <p role="status" className="sr-only">
              می‌توانید دوباره کد بگیرید
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** The resend control once the timer is over (S11, S13). */
export function ResendButton({ busy }: { busy?: boolean }) {
  return (
    <button type="submit" disabled={busy} className={cx(authLink, 'gap-2 disabled:opacity-60')}>
      <SealIcon name="refresh" className="size-4" />
      {busy ? 'در حال ارسال…' : 'کد نرسید؟ ارسال دوباره'}
    </button>
  )
}

/**
 * Lock banner with a mm:ss countdown (V4, and T6/S9 once the server returns a time). Alert once; the timer never
 * announces ticks; at 0 `onExpire` re-opens the form and the caller shows a polite status.
 */
export function LockCountdown({ text, lockedUntil, onExpire }: { text: string; lockedUntil: number; onExpire?: () => void }) {
  const left = useRemaining(lockedUntil, onExpire)
  return (
    <div role="alert" className="mb-5 rounded-md border-2 border-danger p-4">
      <p className="flex items-start gap-2.5 leading-7">
        <SealIcon name="lock" className="mt-1 text-danger" />
        <span>
          <strong className="text-danger">قفل.</strong> {text}
        </span>
      </p>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-3 ps-[1.875rem]">
        <span className="text-sm font-medium">زمان باقی‌مانده:</span>
        <span role="timer" dir="ltr" className="font-display text-3xl font-black tabular-nums">
          {left === null ? '' : mmss(left)}
        </span>
      </p>
    </div>
  )
}

/** Polite one-line status after a lock ends («می‌توانید دوباره امتحان کنید.»). */
export function UnlockedStatus() {
  return (
    <p role="status" className="mb-5 flex items-center gap-2.5 text-sm font-medium">
      <SealIcon name="check" className="text-ok" />
      می‌توانید دوباره امتحان کنید.
    </p>
  )
}
