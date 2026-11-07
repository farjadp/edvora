import { cx } from '@edvora/ui'
import type { ReactNode } from 'react'
import type { OptionId } from '../_lib/options'
import { Icon } from './art'
import { boxCls, inputCls } from './ui'

/**
 * Error region: always in the DOM from load (empty), filled on error so it is announced (spec §4).
 * One error at a time, no auto-dismiss. The word «خطا» + icon make it not colour-only.
 */
export function AlertRegion({ o, id, children }: { o: OptionId; id: string; children?: ReactNode }) {
  return (
    <div role="alert" id={id} className={children ? 'mb-5' : undefined}>
      {children ? (
        <div className={cx('flex items-start gap-2.5 py-3 pe-4 leading-7', o === 'c' ? 'border-s-4 border-danger ps-4' : cx('border-danger/60 bg-danger/10 ps-3.5', o === 'a' ? 'rounded-lg border' : 'rounded-md border'))}>
          <Icon name="alert" className="mt-1 text-danger" />
          <p className="min-w-0">
            <strong className="text-danger">خطا.</strong> {children}
          </p>
        </div>
      ) : null}
    </div>
  )
}

/** Information line (expired session, logged out). role=status, polite. */
export function Notice({ o, children }: { o: OptionId; children: ReactNode }) {
  return (
    <div role="status" className={cx('mb-5 flex items-start gap-2.5 py-3 pe-4 leading-7', o === 'c' ? 'border-s-4 border-brand ps-4' : cx('border bg-brand/10 ps-3.5 border-brand/40', o === 'a' ? 'rounded-lg' : 'rounded-md'))}>
      <Icon name="info" className="mt-1" />
      <p className="min-w-0">{children}</p>
    </div>
  )
}

export type FieldProps = {
  o: OptionId
  id: string
  label: string
  name: string
  type?: 'text' | 'email' | 'tel' | 'password'
  dir?: 'ltr' | 'rtl'
  autoComplete?: string
  inputMode?: 'tel' | 'text' | 'email' | 'numeric'
  placeholder?: string
  defaultValue?: string
  disabled?: boolean
  readOnly?: boolean
  invalid?: boolean
  /** Error message linked via aria-describedby. */
  error?: string
  hint?: ReactNode
  /** Extra aria-describedby ids (e.g. the alert region). */
  describedBy?: string
  /** Align text to the end (LTR values inside an RTL page). */
  latin?: boolean
}

export function Field({ o, id, label, name, type = 'text', dir, autoComplete, inputMode, placeholder, defaultValue, disabled, readOnly, invalid, error, hint, describedBy, latin }: FieldProps) {
  const errId = `${id}-err`
  const hintId = `${id}-hint`
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        dir={dir}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        defaultValue={defaultValue}
        disabled={disabled}
        readOnly={readOnly}
        spellCheck={latin ? false : undefined}
        autoCapitalize={latin ? 'none' : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={cx(error ? errId : false, hint ? hintId : false, describedBy) || undefined}
        className={cx(inputCls(o, invalid), latin && 'text-end')}
      />
      {hint ? (
        <p id={hintId} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} className="mt-1.5 flex items-start gap-1.5 text-sm text-danger">
          <Icon name="alert" className="mt-0.5 size-4" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  )
}

/** A pinned support box (S15, T13): contact line from tenant config. */
export function SupportLine({ o, label, phone }: { o: OptionId; label: string; phone: string }) {
  return (
    <p className={cx('mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 p-3.5', boxCls(o), o === 'c' && 'p-0 py-1 ps-4')}>
      <Icon name="phone" />
      <span className="text-sm">{label}</span>
      <a href={`tel:${phone.replace(/[^\d۰-۹]/g, '')}`} dir="ltr" className="font-bold tabular-nums underline underline-offset-4">
        {phone}
      </a>
    </p>
  )
}
