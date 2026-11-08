import { afterEach, describe, expect, it, vi } from 'vitest'
import { baseInput, call, jsonBody, stubFetch } from './test-helpers'
import { createZarinpalGateway } from './zarinpal'

afterEach(() => vi.unstubAllGlobals())
const gw = () => createZarinpalGateway({ credentials: { merchantId: 'm' }, sandbox: true })

describe('zarinpal', () => {
  it('requires merchantId', () => {
    expect(() => createZarinpalGateway({ credentials: {}, sandbox: true })).toThrow(/merchantId/)
  })

  it('creates a payment in IRR on the sandbox host', async () => {
    const f = stubFetch({ data: { code: 100, authority: 'A0001' }, errors: [] })
    const r = await gw().createPayment(baseInput)
    expect(r).toEqual({ authority: 'A0001', redirect: { method: 'GET', url: 'https://sandbox.zarinpal.com/pg/StartPay/A0001' } })
    expect(call(f, 0).url).toBe('https://sandbox.zarinpal.com/pg/v4/payment/request.json')
    expect(jsonBody(f, 0)).toMatchObject({ merchant_id: 'm', amount: 10_000, currency: 'IRR', callback_url: baseInput.callbackUrl })
  })

  it('uses the live host without sandbox and throws on request errors', async () => {
    const f = stubFetch({ data: [], errors: { code: -9, message: 'validation' } })
    const z = createZarinpalGateway({ credentials: { merchantId: 'm' }, sandbox: false })
    await expect(z.createPayment(baseInput)).rejects.toThrow(/-9/)
    expect(call(f, 0).url).toBe('https://payment.zarinpal.com/pg/v4/payment/request.json')
  })

  it('maps verify ok / already verified / failure', async () => {
    const f = stubFetch(
      { data: { code: 100, ref_id: 555, card_pan: '6037**1234' }, errors: [] },
      { data: { code: 101, ref_id: 555 }, errors: [] },
      { data: [], errors: { code: -51, message: 'failed' } },
    )
    const v = { authority: 'A0001', amount: 10_000, attemptId: '42', extra: {} }
    expect(await gw().verify(v)).toEqual({ ok: true, refId: '555', cardPan: '6037**1234', alreadyVerified: false })
    expect(jsonBody(f, 0)).toEqual({ merchant_id: 'm', amount: 10_000, authority: 'A0001' })
    const again = await gw().verify(v)
    expect(again).toMatchObject({ ok: true, alreadyVerified: true })
    expect(again.ok && again.amount).toBeUndefined()
    expect(await gw().verify(v)).toEqual({ ok: false, code: '-51', message: 'failed' })
  })

  it('parses the callback', () => {
    expect(gw().parseCallback(new URLSearchParams({ Authority: 'A1', Status: 'OK' }))).toEqual({ authority: 'A1', success: true, extra: {} })
    expect(gw().parseCallback(new URLSearchParams({ Authority: 'A1', Status: 'NOK' }))?.success).toBe(false)
    expect(gw().parseCallback(new URLSearchParams())).toBeNull()
  })
})
