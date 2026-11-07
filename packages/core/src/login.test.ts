import { describe, expect, it } from 'vitest'
import { PAYLOAD_LOCKED_MESSAGES, classifyStaffLogin, looksLikePhone, studentOtpReason } from './login'

describe('classifyStaffLogin', () => {
  it('2xx is ok', () => {
    expect(classifyStaffLogin(200, {})).toBe('ok')
  })
  it('401 with a plain message is wrong credentials (same for unknown email and student accounts)', () => {
    expect(classifyStaffLogin(401, { errors: [{ message: 'The email or password provided is incorrect.' }] })).toBe('invalid')
    expect(classifyStaffLogin(401, null)).toBe('invalid')
    expect(classifyStaffLogin(400, { errors: [{ message: 'x' }] })).toBe('invalid')
  })
  it("Payload's LockedAuth comes back as 401: recognised by its message in English or Persian", () => {
    for (const message of PAYLOAD_LOCKED_MESSAGES) expect(classifyStaffLogin(401, { errors: [{ message }] })).toBe('locked')
    expect(classifyStaffLogin(401, { errors: [{ name: 'LockedAuth', message: 'whatever' }] })).toBe('locked')
  })
  it('423 and 429 are locked', () => {
    expect(classifyStaffLogin(423, {})).toBe('locked')
    expect(classifyStaffLogin(429, {})).toBe('locked')
  })
  it('403 (beforeLogin: status not active) is inactive', () => {
    expect(classifyStaffLogin(403, { errors: [{ message: 'This account is not active' }] })).toBe('inactive')
  })
  it('5xx is a server error', () => {
    expect(classifyStaffLogin(500, {})).toBe('error')
    expect(classifyStaffLogin(503, 'oops')).toBe('error')
  })
})

describe('studentOtpReason', () => {
  it('maps every message the OTP actions return today', () => {
    expect(studentOtpReason({ ok: false, message: 'شماره موبایل معتبر نیست.' })).toBe('invalid-phone')
    expect(studentOtpReason({ ok: true, message: 'کد قبلاً ارسال شده است. یک دقیقه صبر کنید.' })).toBe('already-sent')
    expect(studentOtpReason({ ok: true, message: 'کد ورود پیامک شد.' })).toBe('sent')
    expect(studentOtpReason({ ok: false, message: 'ارسال پیامک انجام نشد. دوباره تلاش کنید.' })).toBe('sms-failed')
    expect(studentOtpReason({ ok: false, message: 'خطایی رخ داد. دوباره تلاش کنید.' })).toBe('server')
    expect(studentOtpReason({ ok: false, message: 'کد منقضی شده است. دوباره درخواست دهید.' })).toBe('expired')
    expect(studentOtpReason({ ok: false, message: 'تعداد تلاش‌ها زیاد بود. کد جدید بگیرید.' })).toBe('too-many')
    expect(studentOtpReason({ ok: false, message: 'کد وارد شده درست نیست.' })).toBe('wrong-code')
    expect(studentOtpReason({ ok: false, message: 'این حساب غیرفعال است. با پشتیبانی آکادمی تماس بگیرید.' })).toBe('inactive')
    expect(studentOtpReason({ ok: true, message: 'وارد شدید.' })).toBe('signed-in')
  })
  it('anything else is unknown (the UI then shows the server text as is)', () => {
    expect(studentOtpReason({ ok: false, message: 'something new' })).toBe('unknown')
  })
})

describe('looksLikePhone', () => {
  it('spots an Iranian mobile typed into the staff email field', () => {
    expect(looksLikePhone('09121234567')).toBe(true)
    expect(looksLikePhone('۰۹۱۲ ۱۲۳ ۴۵۶۷')).toBe(true)
    expect(looksLikePhone('+989121234567')).toBe(true)
    expect(looksLikePhone('name@example.com')).toBe(false)
    expect(looksLikePhone('0912')).toBe(false)
  })
})
