import { describe, expect, it } from 'vitest'
import { formatToman, rial, rialToToman, toRial } from './money'
import { normalizeIranMobile } from './phone'
import { pickPhone } from './wpimport'

// E-032 QA: the money and phone rules the import depends on, written from the user's side. What a WooCommerce admin
// sees in toman must be exactly what an Edvora student sees (same number, Persian digits), and never a float.

describe('money: WooCommerce IRT → integer rials → toman on screen', () => {
  it('the toman the academy had is the toman Edvora shows', () => {
    for (const toman of [1, 990, 1_500_000, 8_470_000, 23_450_000, 123_456_789, 900_719_925_474_099]) {
      const r = toRial(String(toman), 'IRT')
      expect(Number.isInteger(r), String(toman)).toBe(true)
      expect(r).toBe(toman * 10)
      expect(rialToToman(r)).toBe(toman)
      const shown = formatToman(r, { persianDigits: false, unit: false }).replace(/٬/g, '')
      expect(shown).toBe(String(toman))
    }
    expect(formatToman(rial(84_700_000))).toBe('۸٬۴۷۰٬۰۰۰ تومان')
  })

  it('accepts what Iranian shops actually store: separators, Persian and Arabic digits, trailing .00, spaces', () => {
    for (const raw of ['8,470,000', '۸٬۴۷۰٬۰۰۰', '٨٬٤٧٠٬٠٠٠', '8470000.00', ' 8 470 000 ', '8470000.0', '+8470000']) {
      expect(toRial(raw, 'IRT'), raw).toBe(84_700_000)
    }
    expect(toRial(8470000, 'irt')).toBe(84_700_000) // currency code case does not matter
    expect(toRial('99', 'IRR')).toBe(99)
    expect(toRial('1.5', 'IRHT')).toBe(15_000)
  })

  it('never rounds, never floats: half-toman prices are exact rials, finer ones are refused', () => {
    expect(toRial('1234.5', 'IRT')).toBe(12_345)
    expect(toRial('0.1', 'IRT')).toBe(1)
    expect(() => toRial('0.15', 'IRT')).toThrow(/fractional/)
    expect(() => toRial('99.5', 'IRR')).toThrow(/fractional/)
    // The classic float trap.
    expect(toRial(0.1 + 0.2 === 0.3 ? '0.3' : '0.30000000000000004'.slice(0, 4), 'IRT')).toBe(3)
    expect(() => toRial('-1', 'IRT')).toThrow(/negative/)
    expect(() => toRial('', 'IRT')).toThrow(/invalid_amount/)
    expect(() => toRial('abc', 'IRT')).toThrow(/invalid_amount/)
    expect(() => toRial('100', 'USD')).toThrow(/unknown_currency/)
    expect(() => toRial('100', '')).toThrow(/unknown_currency/)
    expect(() => toRial('900719925474099100', 'IRT')).toThrow(/too_large/)
  })

  it('price 0 (free) stays 0', () => {
    expect(toRial('0', 'IRT')).toBe(0)
    expect(formatToman(toRial('0', 'IRT'))).toBe('۰ تومان')
  })
})

describe('phones the way WordPress sites store them', () => {
  const sara = '09121234567'
  it('+98, 0098, 98, 9…, Persian and Arabic digits, spaces and dashes all become 09…', () => {
    for (const raw of ['+989121234567', '00989121234567', '989121234567', '9121234567', '09121234567', '۰۹۱۲۱۲۳۴۵۶۷', '٠٩١٢١٢٣٤٥٦٧', '0912 123 4567', '0912-123-4567', '+98 912 123 4567', '\u00a00912\u00a0123\u00a04567', '\ufeff09121234567']) {
      expect(normalizeIranMobile(raw), raw).toBe(sara)
    }
  })

  // QA-E032-04 (minor): numbers copied from Persian chat apps or typed by Digits often carry invisible direction marks
  // (RLM U+200F, LRM U+200E, LRE/PDF U+202A/C) or a ZWNJ. \s does not match them, so the user is "invalid" at login and
  // "held" in an import. Remove `.fails` once normalizeIranMobile strips U+200B–U+200F, U+202A–U+202E, U+2066–U+2069.
  it.fails('QA-E032-04: invisible direction marks / ZWNJ around or inside a number are ignored', () => {
    for (const raw of ['\u200f09121234567', '\u200e09121234567', '09121234567\u200f', '\u202a09121234567\u202c', '09\u200c121234567']) {
      expect(normalizeIranMobile(raw), JSON.stringify(raw)).toBe(sara)
    }
  })

  it('garbage is refused (held, never guessed): letters, 8 digits, foreign, landline, empty', () => {
    for (const raw of ['abc', '0912123456', '+13214446666', '02112345678', '', '0812 123 4567', '09121234567890', 'phone: n/a']) {
      expect(normalizeIranMobile(raw), raw).toBeNull()
    }
  })

  it('priority: Digits first, then country code + number, mobile, billing, and the latest order as the last resort', () => {
    const r = pickPhone({ digits_phone: '+989121110001', mobile: '09122223333', billing_phone: '09124445555' })
    expect(r).toMatchObject({ phone: '09121110001', source: 'digits_phone' })
    expect(pickPhone({ digits_phone: 'garbage', mobile: '۰۹۱۲۲۲۲۳۳۳۳' })).toMatchObject({ phone: '09122223333', source: 'mobile' })
    expect(pickPhone({}, [{ billingPhone: '0912 555 6666', dateGmt: '2022-01-01 00:00:00' }])).toMatchObject({ phone: '09125556666', source: 'order_billing_phone' })
    expect(pickPhone({})).toMatchObject({ phone: null })
  })
})
