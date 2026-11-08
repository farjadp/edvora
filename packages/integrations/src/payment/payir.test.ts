import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPayirGateway } from './payir'
import { baseInput, call, jsonBody, stubFetch } from './test-helpers'

afterEach(() => vi.unstubAllGlobals())
const v = { authority: 'tok', amount: 10_000, attemptId: '42', extra: {} }

describe('pay.ir', () => {
  it('uses api "test" in sandbox, requires apiKey in production', async () => {
    expect(() => createPayirGateway({ credentials: {}, sandbox: false })).toThrow(/apiKey/)
    const f = stubFetch({ status: 1, token: 'tok' })
    expect(await createPayirGateway({ credentials: {}, sandbox: true }).createPayment(baseInput)).toEqual({
      authority: 'tok',
      redirect: { method: 'GET', url: 'https://pay.ir/pg/tok' },
    })
    expect(call(f, 0).url).toBe('https://pay.ir/pg/send')
    expect(jsonBody(f, 0)).toEqual({
      api: 'test',
      amount: 10_000,
      redirect: baseInput.callbackUrl,
      mobile: baseInput.mobile,
      factorNumber: '42',
      description: baseInput.description,
    })
  })

  it('throws on a failed send', async () => {
    stubFetch({ status: 0, errorCode: -3, errorMessage: 'bad api' })
    await expect(createPayirGateway({ credentials: { apiKey: 'k' }, sandbox: false }).createPayment(baseInput)).rejects.toThrow(/-3 bad api/)
  })

  it('maps verify results', async () => {
    const gw = createPayirGateway({ credentials: { apiKey: 'k' }, sandbox: false })
    const f = stubFetch(
      { status: 1, amount: '10000', transId: 3344, factorNumber: '42', cardNumber: '603799******1234', message: 'OK' },
      { status: 0, errorCode: -5, errorMessage: 'failed' },
      { status: 1, amount: 10_000, transId: 3344, factorNumber: '41' },
    )
    expect(await gw.verify(v)).toEqual({ ok: true, refId: '3344', cardPan: '603799******1234', amount: 10_000, alreadyVerified: false })
    expect(call(f, 0).url).toBe('https://pay.ir/pg/verify')
    expect(jsonBody(f, 0)).toEqual({ api: 'k', token: 'tok' })
    expect(await gw.verify(v)).toEqual({ ok: false, code: '-5', message: 'failed' })
    expect(await gw.verify(v)).toMatchObject({ ok: false, code: 'ORDER_MISMATCH' })
  })

  it('parses the callback', () => {
    const gw = createPayirGateway({ credentials: {}, sandbox: true })
    expect(gw.parseCallback(new URLSearchParams({ token: 'tok', status: '1' }))).toEqual({ authority: 'tok', success: true, extra: {} })
    expect(gw.parseCallback(new URLSearchParams({ token: 'tok', status: '0' }))?.success).toBe(false)
  })
})
