'use client'

import { toPersianDigits } from '@edvora/core/digits'
import { colourChecks, isHex, suggestAccent, suggestBrand, tenantPalette, type Hex } from '@edvora/ui/color'
import { useId, useMemo, useState } from 'react'

const norm = (v: string): Hex | null => {
  const s = v.trim().toLowerCase()
  return isHex(s) ? s : null
}

/**
 * E-047: colour inputs with a live preview and the AA checks the server will run on save (ADR 019 §8).
 * The preview's colours go into a <style> element scoped to this block (no inline style attributes).
 */
export function ColourPreview({ primary, accent, academy }: { primary: string; accent: string; academy: string }) {
  const [brand, setBrand] = useState(primary)
  const [acc, setAcc] = useState(accent)
  const scope = `ed-prev-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const b = norm(brand)
  const a = norm(acc)
  const checks = useMemo(() => (b && a ? colourChecks(b, a) : []), [b, a])
  const css = b && a ? (() => {
    const p = tenantPalette(b, a)
    return `.${scope}{--p-brand:${p.brand};--p-brand-ink:${p.brandInk};--p-accent:${p.accent};--p-accent-ink:${p.accentInk}}`
  })() : ''
  const failing = checks.some((c) => !c.pass)

  return (
    <div className="ed-set__colours">
      <div className="ed-set__colour-inputs">
        {(
          [
            ['primaryColor', 'رنگ اصلی', brand, setBrand],
            ['accentColor', 'رنگ تأکیدی', acc, setAcc],
          ] as const
        ).map(([name, label, value, set]) => (
          <div className="ed-set__field" key={name}>
            <label htmlFor={`f-${name}`}>{label}</label>
            <div className="ed-set__colour-row">
              <input type="color" aria-label={`${label} (انتخاب‌گر)`} value={norm(value) ?? '#000000'} onChange={(e) => set(e.target.value)} className="ed-set__swatch" />
              <input id={`f-${name}`} name={name} value={value} onChange={(e) => set(e.target.value)} dir="ltr" pattern="#[0-9a-fA-F]{6}" required className="ed-set__input ed-set__input--hex" aria-describedby={`f-${name}-help`} />
            </div>
            <p id={`f-${name}-help`} className="ed-set__help">
              به شکل #RRGGBB
            </p>
          </div>
        ))}
      </div>

      {css ? <style>{css}</style> : null}
      <div className={`ed-set__preview ${scope}`} aria-label="پیش‌نمایش" role="group" data-testid="colour-preview">
        <p className="ed-set__preview-title">{academy}</p>
        <p className="ed-set__preview-link">پیوند نمونه به رنگ اصلی</p>
        <div className="ed-set__preview-row">
          <span className="ed-set__preview-btn">ثبت‌نام در دوره</span>
          <span className="ed-set__preview-chip">نشان آکادمی</span>
          <span className="ed-set__preview-accent">تأکید</span>
        </div>
      </div>

      <ul className="ed-set__checks" aria-live="polite" data-testid="colour-checks">
        {checks.map((c) => (
          <li key={c.key} data-pass={c.pass ? 'true' : 'false'}>
            <span aria-hidden="true">{c.pass ? '✓' : '✗'}</span> {c.label}: {toPersianDigits(c.ratio.toFixed(2))} به ۱ (کمینه {toPersianDigits(String(c.min))})
          </li>
        ))}
        {!b || !a ? <li data-pass="false">رنگ را به شکل #RRGGBB بنویسید.</li> : null}
      </ul>
      {failing && b && a ? (
        <p className="ed-set__help" role="status">
          کنتراست کافی نیست و ذخیره پذیرفته نمی‌شود.{' '}
          <button
            type="button"
            className="c-btn c-btn--small"
            onClick={() => {
              setBrand(suggestBrand(b))
              setAcc(suggestAccent(a))
            }}
          >
            استفاده از رنگ‌های پیشنهادی{' '}
            <bdi dir="ltr">
              {suggestBrand(b)} · {suggestAccent(a)}
            </bdi>
          </button>
        </p>
      ) : null}
    </div>
  )
}
