import { afterEach, describe, expect, it, vi } from 'vitest'
import { createIdpayGateway } from './idpay'
import { baseInput, call, jsonBody, stubFetch } from './test-helpers'

afterEach(() => vi.unstubAllGlobals())
const gw = (sandbox = true) => createIdpayGateway({ credentials: { apiKey: 'key' }, sandbox })
const v = { authority: 'pid', amount: 10_000, attemptId: '42', extra: {} }

describe('idpay', () => {
  it('requires apiKey', () => {
    expect(() => createIdpayGateway({ credentials: {}, sandbox: true })).toThrow(/apiKey/)
  })

  it('creates a payment with sandbox header', async () => {
    const f = stubFetch({ id: 'pid', link: 'https://idpay.ir/p/ws-sandbox/pid' })
    expect(await gw().createPayment(baseInput)).toEqual({ authority: 'pid', redirect: { method: 'GET', url: 'https://idpay.ir/p/ws-sandbox/pid' } })
    const { url, init } = call(f, 0)
    expect(url).toBe('https://api.idpay.ir/v1.1/payment')
    expect(init.headers).toMatchObject({ 'X-API-KEY': 'key', 'X-SANDBOX': '1' })
    expect(jsonBody(f, 0)).toEqual({ order_id: '42', amount: 10_000, phone: baseInput.mobile, desc: baseInput.description, callback: baseInput.callbackUrl })
  })

  it('omits the sandbox header in production and surfaces error bodies', async () => {
    const f = stubFetch({ error_code: 11, error_message: 'user blocked' })
    await expect(gw(false).createPayment(baseInput)).rejects.toThrow(/11 user blocked/)
    expect(call(f, 0).init.headers).not.toHaveProperty('X-SANDBOX')
  })

  it('maps verify results', async () => {
    const f = stubFetch(
      { status: 100, track_id: '7777', id: 'pid', order_id: '42', amount: '10000', payment: { card_no: '603799******1234' } },
      { status: 101, track_id: '7777', id: 'pid', order_id: '42', amount: 10_000 },
      { error_code: 53, error_message: 'cannot verify' },
      { status: 100, track_id: '7777', id: 'pid', order_id: '99', amount: 10_000 },
    )
    expect(await gw().verify(v)).toEqual({ ok: true, refId: '7777', cardPan: '603799******1234', amount: 10_000, alreadyVerified: false })
    expect(call(f, 0).url).toBe('https://api.idpay.ir/v1.1/payment/verify')
    expect(jsonBody(f, 0)).toEqual({ id: 'pid', order_id: '42' })
    expect(await gw().verify(v)).toMatchObject({ ok: true, alreadyVerified: true })
    expect(await gw().verify(v)).toEqual({ ok: false, code: '53', message: 'cannot verify' })
    expect(await gw().verify(v)).toMatchObject({ ok: false, code: 'ORDER_MISMATCH' })
  })

  it('parses GET or POST callbacks', () => {
    const p = new URLSearchParams({ status: '10', id: 'pid', track_id: '1', order_id: '42', amount: '10000' })
    expect(gw().parseCallback(p)).toEqual({ authority: 'pid', success: true, extra: { track_id: '1', order_id: '42', amount: '10000' } })
    expect(gw().parseCallback(new URLSearchParams({ status: '7', id: 'pid' }))?.success).toBe(false)
    expect(gw().parseCallback(new URLSearchParams({ status: '10' }))).toBeNull()
  })
})
