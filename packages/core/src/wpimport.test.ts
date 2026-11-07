import { describe, expect, it } from 'vitest'
import { RialConversionError, toRial } from './money'
import {
  isValidIranNationalCode,
  normaliseIranNationalCode,
  normaliseLegacyPath,
  normalisePersianText,
  parseDurationMinutes,
  parseWpDateGmt,
  pickPhone,
  titleMatchKey,
} from './wpimport'

const code = (fn: () => unknown): string | null => {
  try {
    fn()
    return null
  } catch (e) {
    return e instanceof RialConversionError ? e.code : 'other'
  }
}

describe('toRial', () => {
  it('applies every factor', () => {
    expect(toRial('1500000', 'IRR')).toBe(1_500_000)
    expect(toRial('1,500,000', 'IRT')).toBe(15_000_000)
    expect(toRial('1500', 'IRHR')).toBe(1_500_000)
    expect(toRial('150', 'IRHT')).toBe(1_500_000)
    expect(toRial(8_470_000, 'irt')).toBe(84_700_000)
  })
  it('normalises separators, Persian/Arabic digits and decimals', () => {
    expect(toRial('۱٬۵۰۰٬۰۰۰', 'IRT')).toBe(15_000_000)
    expect(toRial('١٥٠٠ ٠٠٠', 'IRR')).toBe(1_500_000)
    expect(toRial('1500000.00', 'IRT')).toBe(15_000_000)
    expect(toRial('12.5', 'IRT')).toBe(125)
    expect(toRial('1.234', 'IRHR')).toBe(1234)
    expect(toRial('۲٫۵', 'IRHT')).toBe(25_000)
    expect(toRial('0', 'IRT')).toBe(0)
    expect(toRial('.5', 'IRT')).toBe(5)
  })
  it('refuses to guess', () => {
    expect(code(() => toRial('12.55', 'IRT'))).toBe('fractional')
    expect(code(() => toRial('1.5', 'IRR'))).toBe('fractional')
    expect(code(() => toRial(0.1, 'IRR'))).toBe('fractional')
    expect(code(() => toRial('100', ''))).toBe('unknown_currency')
    expect(code(() => toRial('100', 'USD'))).toBe('unknown_currency')
    expect(code(() => toRial('100', 'تومان'))).toBe('unknown_currency')
    expect(code(() => toRial('', 'IRT'))).toBe('invalid_amount')
    expect(code(() => toRial('abc', 'IRT'))).toBe('invalid_amount')
    expect(code(() => toRial('1e5', 'IRT'))).toBe('invalid_amount')
    expect(code(() => toRial('-5', 'IRT'))).toBe('negative')
    expect(code(() => toRial('99999999999999999', 'IRT'))).toBe('too_large')
  })
})

describe('pickPhone', () => {
  it('follows the priority order', () => {
    expect(pickPhone({ digits_phone: '+989121234567', mobile: '09350000000' })).toEqual({ phone: '09121234567', source: 'digits_phone', invalidCandidates: [] })
    expect(pickPhone({ digits_phone_no: '9121234567', digt_countrycode: '+98' }).phone).toBe('09121234567')
    expect(pickPhone({ digits_phone_no: '9121234567', digt_countrycode: '98' }).source).toBe('digits_phone_no')
    expect(pickPhone({ mobile: '۰۹۱۲۱۲۳۴۵۶۷' }).source).toBe('mobile')
    expect(pickPhone({ phone_number: '00989121234567' }).source).toBe('phone_number')
    expect(pickPhone({ billing_phone: ['', '0912 123 4567'] }).source).toBe('billing_phone')
  })
  it('falls back to the latest order billing phone', () => {
    const r = pickPhone({}, [
      { billingPhone: '09120000001', dateGmt: '2021-01-01 00:00:00' },
      { billingPhone: '09120000002', dateGmt: '2023-01-01 00:00:00' },
      { billingPhone: '', dateGmt: '2024-01-01 00:00:00' },
    ])
    expect(r).toEqual({ phone: '09120000002', source: 'order_billing_phone', invalidCandidates: [] })
  })
  it('records invalid candidates and treats foreign numbers as invalid', () => {
    const r = pickPhone({ digits_phone: '+13214446666', mobile: '12345', billing_phone: '09121234567' })
    expect(r.phone).toBe('09121234567')
    expect(r.invalidCandidates.map((c) => c.source)).toEqual(['digits_phone', 'mobile'])
    expect(pickPhone({ digits_phone_no: '3214446666', digt_countrycode: '+1' })).toMatchObject({ phone: null, source: null })
    expect(pickPhone(undefined)).toEqual({ phone: null, source: null, invalidCandidates: [] })
  })
})

describe('Persian text', () => {
  it('fixes Arabic letters, keeps ZWNJ, NFC', () => {
    expect(normalisePersianText('علي كريمي')).toBe('علی کریمی')
    expect(normalisePersianText('می‌خواهم')).toBe('می‌خواهم')
    expect(normalisePersianText('ى')).toBe('ی')
    expect(normalisePersianText('é')).toBe('é')
  })
  it('builds a title match key', () => {
    expect(titleMatchKey(' دوره  برندسازي ')).toBe(titleMatchKey('دوره برندسازی'))
    expect(titleMatchKey('نیم‌فاصله')).toBe('نیم فاصله')
    expect(titleMatchKey('Brand MBA ۲۵')).toBe('brand mba 25')
  })
})

describe('national code', () => {
  it('validates the checksum', () => {
    expect(isValidIranNationalCode('0499370899')).toBe(true)
    expect(isValidIranNationalCode('۰۴۹۹۳۷۰۸۹۹')).toBe(true)
    expect(isValidIranNationalCode('0499370898')).toBe(false)
    expect(isValidIranNationalCode('1111111111')).toBe(false)
    expect(isValidIranNationalCode('12345')).toBe(false)
    expect(normaliseIranNationalCode('499370899')).toBe('0499370899')
    expect(normaliseIranNationalCode('abc')).toBeNull()
  })
})

describe('parseWpDateGmt', () => {
  it('reads the GMT column', () => {
    expect(parseWpDateGmt('2022-05-01 12:00:00', '2022-05-01 16:30:00', 3.5)?.toISOString()).toBe('2022-05-01T12:00:00.000Z')
    expect(parseWpDateGmt('2022-05-01T12:00:00', null)?.toISOString()).toBe('2022-05-01T12:00:00.000Z')
    expect(parseWpDateGmt('2022-05-01T12:00:00Z')?.toISOString()).toBe('2022-05-01T12:00:00.000Z')
  })
  it('falls back to local minus offset when GMT is zero', () => {
    expect(parseWpDateGmt('0000-00-00 00:00:00', '2022-05-01 16:30:00', 3.5)?.toISOString()).toBe('2022-05-01T13:00:00.000Z')
    expect(parseWpDateGmt('', '2022-05-01 16:30:00', '3.5')?.toISOString()).toBe('2022-05-01T13:00:00.000Z')
    expect(parseWpDateGmt('0000-00-00 00:00:00', '0000-00-00 00:00:00', 3.5)).toBeNull()
    expect(parseWpDateGmt(null, null)).toBeNull()
    expect(parseWpDateGmt('garbage', undefined)).toBeNull()
  })
})

describe('parseDurationMinutes', () => {
  it('parses clocks, units and Persian digits', () => {
    expect(parseDurationMinutes('۱۲:۳۰')).toBe(13)
    expect(parseDurationMinutes('12:20')).toBe(12)
    expect(parseDurationMinutes('1:02:30')).toBe(63)
    expect(parseDurationMinutes('10 minute')).toBe(10)
    expect(parseDurationMinutes('10 minutes')).toBe(10)
    expect(parseDurationMinutes('1 hour')).toBe(60)
    expect(parseDurationMinutes('1.5 hours')).toBe(90)
    expect(parseDurationMinutes('۲ ساعت و ۱۵ دقیقه')).toBe(135)
    expect(parseDurationMinutes('۴۵ دقیقه')).toBe(45)
    expect(parseDurationMinutes('45')).toBe(45)
    expect(parseDurationMinutes('30 seconds')).toBe(1)
    expect(parseDurationMinutes(0)).toBe(0)
  })
  it('returns null for unknown text', () => {
    expect(parseDurationMinutes('2 week')).toBeNull()
    expect(parseDurationMinutes('soon')).toBeNull()
    expect(parseDurationMinutes('12:75')).toBeNull()
    expect(parseDurationMinutes('')).toBeNull()
    expect(parseDurationMinutes(null)).toBeNull()
  })
})

describe('normaliseLegacyPath', () => {
  it('normalises paths', () => {
    expect(normaliseLegacyPath('https://iranbrandacademy.com/course/%D8%A8%D8%B1%D9%86%D8%AF/')).toBe('/course/برند')
    expect(normaliseLegacyPath('/Course/برند/')).toBe('/course/برند')
    expect(normaliseLegacyPath('/product/دوره-برندسازي?utm_source=x#top')).toBe('/product/دوره-برندسازی')
    expect(normaliseLegacyPath('//cdn.x.ir/a//b/')).toBe('/a/b')
    expect(normaliseLegacyPath('/bad/%E0%A4%A')).toBe('/bad/%e0%a4%a')
    expect(normaliseLegacyPath('https://x.ir')).toBe('/')
    expect(normaliseLegacyPath('/')).toBe('/')
  })
  it('keeps WP object queries on the root only', () => {
    expect(normaliseLegacyPath('https://x.ir/?utm_source=a&p=12')).toBe('/?p=12')
    expect(normaliseLegacyPath('/?page_id=7')).toBe('/?page_id=7')
    expect(normaliseLegacyPath('/?post_type=course&name=%D8%A8')).toBe('/?post_type=course&name=ب')
    expect(normaliseLegacyPath('/?utm_source=a')).toBe('/')
    expect(normaliseLegacyPath('/blog/?p=12')).toBe('/blog')
  })
})
