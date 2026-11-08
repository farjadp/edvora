import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNextpayGateway } from './nextpay'
import { baseInput, call, formBody, stubFetch } from './test-helpers'

afterEach(() => vi.unstubAllGlobals())
const gw = () => createNextpayGateway({ credentials: { apiKey: 'k' }, sandbox: true })
const v = { authority: 'tr-1', amount: 10_000, attemptId: '42', extra: {} }

describe('nextpay', () => {
  it('requires apiKey', () => {
    expect(() => createNextpayGateway({ credentials: {}, sandbox: true })).toThrow(/apiKey/)
  })

  it('creates a payment (form-encoded, IRR, live host even in sandbox)', async () => {
    const f = stubFetch({ code: -1, trans_id: 'tr-1', amount: 10_000 })
    expect(await gw().createPayment(baseInput)).toEqual({ authority: 'tr-1', redirect: { method: 'GET', url: 'https://nextpay.org/nx/gateway/payment/tr-1' } })
    expect(call(f, 0).url).toBe('https://nextpay.org/nx/gateway/token')
    expect(Object.fromEntries(formBody(f, 0))).toEqual({
      api_key: 'k',
      order_id: '42',
      amount: '10000',
      callback_uri: baseInput.callbackUrl,
      currency: 'IRR',
      customer_phone: baseInput.mobile,
    })
  })

  it('throws on a failed token request', async () => {
    stubFetch({ code: -32 })
    await expect(gw().createPayment(baseInput)).rejects.toThrow(/-32/)
  })

  it('maps verify results', async () => {
    const f = stubFetch(
      { code: 0, amount: 10_000, order_id: '42', card_holder: '6037-99**-****-1234', Shaparak_Ref_Id: '1234567' },
      { code: -24 },
      { code: 0, amount: 10_000, order_id: '7', Shaparak_Ref_Id: '1' },
    )
    expect(await gw().verify(v)).toEqual({ ok: true, refId: '1234567', cardPan: '6037-99**-****-1234', amount: 10_000, alreadyVerified: false })
    expect(call(f, 0).url).toBe('https://nextpay.org/nx/gateway/verify')
    expect(Object.fromEntries(formBody(f, 0))).toEqual({ api_key: 'k', trans_id: 'tr-1', amount: '10000', currency: 'IRR' })
    expect(await gw().verify(v)).toMatchObject({ ok: false, code: '-24' })
    expect(await gw().verify(v)).toMatchObject({ ok: false, code: 'ORDER_MISMATCH' })
  })

  it('parses the callback', () => {
    expect(gw().parseCallback(new URLSearchParams({ trans_id: 'tr-1', order_id: '42', amount: '10000' }))).toEqual({
      authority: 'tr-1',
      success: true,
      extra: { order_id: '42', amount: '10000' },
    })
    expect(gw().parseCallback(new URLSearchParams({ order_id: '42' }))).toBeNull()
  })
})
