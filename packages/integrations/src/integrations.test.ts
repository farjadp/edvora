import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockPaymentProvider, createPaymentProvider, createZarinpalGateway } from './payment'
import { createKavenegarProvider, createMockSmsProvider } from './sms'

afterEach(() => vi.unstubAllGlobals())

describe('mock payment', () => {
  const p = createMockPaymentProvider({ mockGatewayUrl: 'http://localhost:3000/pay/mock' })

  it('round-trips create → callback → verify', async () => {
    const { authority, redirect } = await p.createPayment({
      amount: 84_700_000,
      description: 'Brand MBA',
      callbackUrl: 'http://localhost:3000/api/payments/callback',
      orderId: '1',
      attemptId: '1',
    })
    expect(redirect.method).toBe('GET')
    expect(redirect.url).toContain('/pay/mock')
    expect(p.parseCallback(new URLSearchParams({ Authority: authority, Status: 'OK' }))).toEqual({ authority, success: true, extra: {} })
    expect((await p.verify({ authority, amount: 84_700_000, attemptId: '1', extra: {} })).ok).toBe(true)
    expect(await p.verify({ authority, amount: 1, attemptId: '1', extra: {} })).toMatchObject({ ok: false, code: 'AMOUNT_MISMATCH' })
  })

  it('factory defaults to mock and rejects unknown providers', () => {
    expect(createPaymentProvider({ provider: undefined, mockGatewayUrl: 'http://x' }).name).toBe('mock')
    expect(() => createPaymentProvider({ provider: 'stripe', mockGatewayUrl: 'http://x' })).toThrow(/Unknown/)
  })
})

describe('zarinpal', () => {
  it('maps request and verify responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { code: 100, authority: 'A0001' }, errors: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { code: 100, ref_id: 555, card_pan: '6037**1234' }, errors: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [], errors: { code: -51, message: 'failed' } })))
    vi.stubGlobal('fetch', fetchMock)

    const z = createZarinpalGateway({ credentials: { merchantId: 'm' }, sandbox: true })
    const created = await z.createPayment({ amount: 10_000, description: 'x', callbackUrl: 'http://cb', orderId: '1', attemptId: '1' })
    expect(created.redirect).toEqual({ method: 'GET', url: 'https://sandbox.zarinpal.com/pg/StartPay/A0001' })
    const v = { authority: 'A0001', amount: 10_000, attemptId: '1', extra: {} }
    expect(await z.verify(v)).toMatchObject({ ok: true, refId: '555' })
    expect(await z.verify(v)).toMatchObject({ ok: false, code: '-51' })
  })

  it('requires a merchant id', () => {
    expect(() => createZarinpalGateway({ credentials: { merchantId: '' }, sandbox: true })).toThrow(/merchantId/)
  })
})

describe('sms', () => {
  it('mock keeps an outbox', async () => {
    const sms = createMockSmsProvider({ log: () => {} })
    await sms.sendTemplate({ to: '09121234567', template: 'verify', tokens: ['12345'] })
    expect(sms.outbox[0]?.text).toContain('12345')
  })

  it('kavenegar reports provider errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ return: { status: 418, message: 'credit' }, entries: null }))),
    )
    const k = createKavenegarProvider({ apiKey: 'k' })
    expect(await k.send({ to: '0912', text: 'hi' })).toEqual({ ok: false, error: 'credit' })
  })
})
