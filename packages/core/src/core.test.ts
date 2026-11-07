import { describe, expect, it } from 'vitest'
import {
  applyCoupon,
  buildCertificateCode,
  buildInstalmentPlan,
  canTransitionLead,
  certificateEligibility,
  courseProgress,
  formatJalali,
  formatToman,
  generateOtp,
  hashOtp,
  maskPhone,
  nextFollowUpAt,
  normalizeIranMobile,
  parseCertificateCode,
  rial,
  signSession,
  toLatinDigits,
  toPersianDigits,
  tomanToRial,
  verifySession,
} from './index'

describe('digits', () => {
  it('converts both ways', () => {
    expect(toPersianDigits('BA-181')).toBe('BA-۱۸۱')
    expect(toLatinDigits('۰۹۱۲٣٤')).toBe('091234')
  })
})

describe('money', () => {
  it('stores rials, shows toman', () => {
    const price = tomanToRial(8_470_000)
    expect(price).toBe(84_700_000)
    expect(formatToman(price)).toBe('۸٬۴۷۰٬۰۰۰ تومان')
    expect(formatToman(price, { persianDigits: false, unit: false })).toBe('8٬470٬000')
  })
  it('rejects floats and negatives', () => {
    expect(() => rial(1.5)).toThrow()
    expect(() => rial(-1)).toThrow()
  })
  it('applies coupons without going negative', () => {
    expect(applyCoupon(rial(1000), { kind: 'percent', value: 20 })).toEqual({ price: 800, discount: 200 })
    expect(applyCoupon(rial(1000), { kind: 'percent', value: 50, maxDiscount: rial(100) }).price).toBe(900)
    expect(applyCoupon(rial(1000), { kind: 'fixed', value: rial(5000) }).price).toBe(0)
    expect(applyCoupon(rial(1000), null).price).toBe(1000)
  })
})

describe('instalments', () => {
  const first = new Date('2026-01-01T00:00:00Z')
  it('always sums to the total', () => {
    const total = tomanToRial(11_700_000)
    for (const count of [1, 2, 3, 4, 6, 7]) {
      const plan = buildInstalmentPlan({ total, count, firstDueDate: first })
      expect(plan).toHaveLength(count)
      expect(plan.reduce((s, i) => s + i.amount, 0)).toBe(total)
    }
  })
  it('supports a down payment and spaces due dates', () => {
    const plan = buildInstalmentPlan({ total: rial(1_000_000), count: 3, downPaymentPercent: 40, firstDueDate: first })
    expect(plan[0]!.amount).toBe(400_000)
    expect(plan[1]!.amount).toBe(300_000)
    expect(plan[2]!.dueDate.toISOString()).toBe('2026-03-02T00:00:00.000Z')
  })
  it('validates input', () => {
    expect(() => buildInstalmentPlan({ total: rial(100), count: 0, firstDueDate: first })).toThrow()
  })
})

describe('certificates', () => {
  it('builds codes in the IBA format', () => {
    expect(buildCertificateCode({ prefix: 'ba', program: 'mba', serial: 181 })).toBe('BA-MBA-181')
    expect(buildCertificateCode({ prefix: 'BA', program: 'DBA', serial: 81 })).toBe('BA-DBA-081')
  })
  it('parses messy user input', () => {
    expect(parseCertificateCode(' ba–mba–۱۸۱ ')).toEqual({ prefix: 'BA', program: 'MBA', serial: 181 })
    expect(parseCertificateCode('hello')).toBeNull()
  })
})

describe('phone', () => {
  it('normalises Iranian mobiles', () => {
    for (const v of ['09121234567', '+989121234567', '00989121234567', '989121234567', '۰۹۱۲ ۱۲۳ ۴۵۶۷', '9121234567']) {
      expect(normalizeIranMobile(v)).toBe('09121234567')
    }
    expect(normalizeIranMobile('02122277111')).toBeNull()
    expect(maskPhone('09121234567')).toBe('0912***4567')
  })
})

describe('leads', () => {
  it('enforces the pipeline', () => {
    expect(canTransitionLead('new', 'contacted')).toBe(true)
    expect(canTransitionLead('new', 'enrolled')).toBe(false)
    expect(canTransitionLead('enrolled', 'lost')).toBe(false)
    expect(nextFollowUpAt('enrolled')).toBeNull()
    expect(nextFollowUpAt('new', new Date(0))?.getTime()).toBe(2 * 3600 * 1000)
  })
})

describe('auth', () => {
  it('generates and hashes OTPs', () => {
    const code = generateOtp()
    expect(code).toMatch(/^\d{5}$/)
    expect(hashOtp(code, '0912', 's')).toBe(hashOtp(code, '0912', 's'))
    expect(hashOtp(code, '0912', 's')).not.toBe(hashOtp(code, '0913', 's'))
  })
  it('signs and verifies sessions', () => {
    const token = signSession({ uid: 7, exp: Date.now() + 1000 }, 'secret')
    expect(verifySession(token, 'secret')?.uid).toBe(7)
    expect(verifySession(token, 'other')).toBeNull()
    expect(verifySession(token, 'secret', Date.now() + 5000)).toBeNull()
    expect(verifySession(`${token}x`, 'secret')).toBeNull()
  })
})

describe('jalali', () => {
  it('formats in Shamsi with Persian digits', () => {
    // 2026-09-20 is 29 Shahrivar 1405
    expect(formatJalali(new Date('2026-09-20T12:00:00Z'))).toBe('۲۹ شهریور ۱۴۰۵')
  })
})

describe('progress', () => {
  it('computes progress and certificate eligibility', () => {
    expect(courseProgress(['a', 'b', 'x'], ['a', 'b', 'c', 'd'])).toBe(50)
    expect(courseProgress([], [])).toBe(0)
    expect(certificateEligibility({ progress: 100, defensePassed: false, requiresDefense: true })).toEqual({
      eligible: false,
      reason: 'defense',
      missing: ['defense'],
    })
    expect(certificateEligibility({ progress: 100, defensePassed: true, requiresDefense: true }).eligible).toBe(true)
  })
})
