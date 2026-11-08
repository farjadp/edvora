import { afterEach, describe, expect, it, vi } from 'vitest'
import { baseInput, call, jsonBody, stubFetch } from './test-helpers'
import { createZibalGateway } from './zibal'

afterEach(() => vi.unstubAllGlobals())
const v = { authority: '123', amount: 10_000, attemptId: '42', extra: {} }

describe('zibal', () => {
  it('uses merchant "zibal" in sandbox and requires merchantId in production', async () => {
    expect(() => createZibalGateway({ credentials: {}, sandbox: false })).toThrow(/merchantId/)
    const f = stubFetch({ result: 100, trackId: 123, message: 'success' })
    const r = await createZibalGateway({ credentials: {}, sandbox: true }).createPayment(baseInput)
    expect(r).toEqual({ authority: '123', redirect: { method: 'GET', url: 'https://gateway.zibal.ir/start/123' } })
    expect(call(f, 0).url).toBe('https://gateway.zibal.ir/v1/request')
    expect(jsonBody(f, 0)).toEqual({
      merchant: 'zibal',
      amount: 10_000,
      callbackUrl: baseInput.callbackUrl,
      orderId: '42',
      mobile: baseInput.mobile,
      description: baseInput.description,
    })
  })

  it('throws on a failed request', async () => {
    stubFetch({ result: 102, message: 'merchant not found' })
    await expect(createZibalGateway({ credentials: { merchantId: 'x' }, sandbox: false }).createPayment(baseInput)).rejects.toThrow(/102/)
  })

  it('maps verify results', async () => {
    const gw = createZibalGateway({ credentials: { merchantId: 'mm' }, sandbox: false })
    const f = stubFetch(
      { result: 100, amount: 10_000, refNumber: 999, cardNumber: '6037**1234', orderId: '42' },
      { result: 201, amount: 10_000, refNumber: 999, orderId: '42' },
      { result: 202, message: 'not paid' },
      { result: 100, amount: 10_000, refNumber: 999, orderId: '43' },
    )
    expect(await gw.verify(v)).toEqual({ ok: true, refId: '999', cardPan: '6037**1234', amount: 10_000, alreadyVerified: false })
    expect(jsonBody(f, 0)).toEqual({ merchant: 'mm', trackId: 123 })
    expect(call(f, 0).url).toBe('https://gateway.zibal.ir/v1/verify')
    expect(await gw.verify(v)).toMatchObject({ ok: true, alreadyVerified: true })
    expect(await gw.verify(v)).toEqual({ ok: false, code: '202', message: 'not paid' })
    expect(await gw.verify(v)).toMatchObject({ ok: false, code: 'ORDER_MISMATCH' })
  })

  it('parses the callback', () => {
    const gw = createZibalGateway({ credentials: {}, sandbox: true })
    expect(gw.parseCallback(new URLSearchParams({ trackId: '123', success: '1', orderId: '42', status: '2' }))).toEqual({
      authority: '123',
      success: true,
      extra: { orderId: '42', status: '2' },
    })
    expect(gw.parseCallback(new URLSearchParams({ trackId: '123', success: '0' }))?.success).toBe(false)
  })
})
