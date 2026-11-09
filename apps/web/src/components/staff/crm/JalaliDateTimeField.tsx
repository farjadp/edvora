'use client'

import { JALALI_MONTHS_FA, jalaliMonthLength, tehranLocalToUtc, utcToTehranLocal, type TehranLocal } from '@edvora/core/crm'
import { toPersianDigits as fa } from '@edvora/core/digits'
import { cx } from '@edvora/ui'
import { focusRing } from '@edvora/ui/classes'
import { useId } from 'react'

const SELECT = cx('h-11 rounded-xl border border-line-strong bg-bg px-2 text-sm', focusRing)
const pad = (n: number) => fa(String(n).padStart(2, '0'))
const MINUTES = [0, 15, 30, 45]

/**
 * Jalali date + Tehran time picker (E-015). Shows the Shamsi calendar; the value it reports is a UTC instant
 * (`tehranLocalToUtc`), or null while the chosen day does not exist in that month. No external date library.
 */
export function JalaliDateTimeField({ value, onChange, legend, now }: { value: TehranLocal; onChange: (v: TehranLocal, utc: Date | null) => void; legend: string; now: Date }) {
  const id = useId()
  const thisYear = utcToTehranLocal(now).jy
  const days = jalaliMonthLength(value.jy, value.jm)
  const set = (patch: Partial<TehranLocal>) => {
    const next = { ...value, ...patch }
    onChange(next, tehranLocalToUtc(next))
  }
  const field = (key: string, label: string, el: React.ReactNode) => (
    <label htmlFor={`${id}-${key}`} className="grid gap-1 text-xs text-muted">
      {label}
      {el}
    </label>
  )
  return (
    <fieldset data-testid="jalali-picker" className="min-w-0">
      <legend className="mb-2 text-sm font-bold">{legend}</legend>
      <div className="flex flex-wrap items-end gap-2">
        {field(
          'd',
          'روز',
          <select id={`${id}-d`} data-part="day" value={value.jd} onChange={(e) => set({ jd: Number(e.target.value) })} className={SELECT}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d} disabled={d > days}>
                {fa(d)}
              </option>
            ))}
          </select>,
        )}
        {field(
          'm',
          'ماه',
          <select id={`${id}-m`} data-part="month" value={value.jm} onChange={(e) => set({ jm: Number(e.target.value) })} className={SELECT}>
            {JALALI_MONTHS_FA.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>,
        )}
        {field(
          'y',
          'سال',
          <select id={`${id}-y`} data-part="year" value={value.jy} onChange={(e) => set({ jy: Number(e.target.value) })} className={SELECT}>
            {[thisYear, thisYear + 1].map((y) => (
              <option key={y} value={y}>
                {fa(y)}
              </option>
            ))}
          </select>,
        )}
        {field(
          'h',
          'ساعت',
          <select id={`${id}-h`} data-part="hour" value={value.hour} onChange={(e) => set({ hour: Number(e.target.value) })} className={SELECT} dir="ltr">
            {Array.from({ length: 24 }, (_, h) => h).map((h) => (
              <option key={h} value={h}>
                {pad(h)}
              </option>
            ))}
          </select>,
        )}
        {field(
          'min',
          'دقیقه',
          <select id={`${id}-min`} data-part="minute" value={value.minute} onChange={(e) => set({ minute: Number(e.target.value) })} className={SELECT} dir="ltr">
            {(MINUTES.includes(value.minute) ? MINUTES : [...MINUTES, value.minute].sort((a, b) => a - b)).map((m) => (
              <option key={m} value={m}>
                {pad(m)}
              </option>
            ))}
          </select>,
        )}
      </div>
      {value.jd > days ? (
        <p role="alert" className="mt-2 text-sm font-bold text-danger">
          {JALALI_MONTHS_FA[value.jm - 1]} این سال {fa(days)} روز دارد؛ روز دیگری را انتخاب کنید.
        </p>
      ) : null}
    </fieldset>
  )
}

/** Tomorrow 10:00 Tehran: a sensible first value for the picker. */
export function defaultPickerValue(now: Date): TehranLocal {
  const t = utcToTehranLocal(new Date(now.getTime() + 24 * 60 * 60 * 1000))
  return { ...t, hour: 10, minute: 0 }
}
