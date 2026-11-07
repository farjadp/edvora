'use client'

import { toLatinDigits } from '@edvora/core/digits'
import { cx } from '@edvora/ui'
import { useId, type Ref } from 'react'
import { ErrorText, fieldInput } from './ui'

/** Strip spaces and non-digits, accept Persian/Arabic digits, cap at 6. */
export function normaliseCode(raw: string): string {
  return toLatinDigits(raw).replace(/\D/g, '').slice(0, 6)
}

type Props = {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  error?: string | null
  inputRef?: Ref<HTMLInputElement>
}

/** Six-digit one-time code input: numeric keypad, LTR, OTP autofill, labelled, error linked by aria. */
export function CodeField({ label, value, onChange, disabled, error, inputRef }: Props) {
  const id = useId()
  const errId = `${id}-err`
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(normaliseCode(e.target.value))}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="one-time-code"
        dir="ltr"
        maxLength={12}
        spellCheck={false}
        placeholder="000000"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        className={cx(fieldInput, 'text-center font-latin text-2xl font-bold tracking-[0.4em] placeholder:font-normal placeholder:tracking-[0.4em] placeholder:text-muted disabled:opacity-60')}
      />
      {error ? <ErrorText id={errId}>{error}</ErrorText> : null}
    </div>
  )
}
