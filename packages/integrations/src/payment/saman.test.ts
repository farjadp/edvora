import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSamanGateway } from './saman'
import { baseInput, call, jsonBody, stubFetch } from './test-helpers'

afterEach(() => vi.unstubAllGlobals())
const gw = () => createSamanGateway({ credentials: { terminalId: '1234' }, sandbox: false })
const v = (extra: Record<string, string>) => ({ authority: 'tok', amount: 10_000, attemptId: '42', extra })

describe('saman', () => {
  it('requires a numeric terminalId', () => {
    expect(() => createSamanGateway({ credentials: {}, sandbox: true })).toThrow(/terminalId/)
    expect(() => createSamanGateway({ credentials: { terminalId: 'abc' }, sandbox: true })).toThrow(/numeric/)
  })

  it('gets a token and returns a POST redirect', async () => {
    const f = stubFetch({ status: 1, token: 'tok' })
    expect(await gw().createPayment(baseInput)).toEqual({
      authority: 'tok',
      redirect: { method: 'POST', url: 'https://sep.shaparak.ir/OnlinePG/OnlinePG', fields: { Token: 'tok', GetMethod: '' } },
    })
    expect(call(f, 0).url).toBe('https://sep.shaparak.ir/onlinepg/onlinepg')
    expect(jsonBody(f, 0)).toEqual({
      action: 'token',
      TerminalId: '1234',
      Amount: 10_000,
      ResNum: '42',
      RedirectUrl: baseInput.callbackUrl,
      CellNumber: baseInput.mobile,
    })
  })

  it('throws on a token error', async () => {
    stubFetch({ status: -1, errorCode: '5', errorDesc: 'invalid params' })
    await expect(gw().createPayment(baseInput)).rejects.toThrow(/5 invalid params/)
  })

  it('parses the POST callback', () => {
    const p = new URLSearchParams({
      MID: '1234',
      State: 'OK',
      Status: '2',
      RefNum: 'rn',
      ResNum: '42',
      TerminalId: '1234',
      TraceNo: 'tn',
      Amount: '10000',
      SecurePan: '6037******1234',
      Token: 'tok',
    })
    expect(gw().parseCallback(p)).toEqual({
      authority: 'tok',
      success: true,
      extra: { RefNum: 'rn', ResNum: '42', TraceNo: 'tn', SecurePan: '6037******1234' },
    })
    expect(gw().parseCallback(new URLSearchParams({ Token: 'tok', State: 'CanceledByUser', Status: '1' }))?.success).toBe(false)
    expect(gw().parseCallback(new URLSearchParams({ Token: 'tok', Status: '2' }))?.success).toBe(true)
  })

  it('maps verify results', async () => {
    const detail = { RRN: '14226761817', RefNum: 'rn', MaskedPan: '621986****8080', OrginalAmount: 10_000, AffectiveAmount: 10_000 }
    const f = stubFetch(
      { ResultCode: 0, ResultDescription: 'ok', Success: true, TransactionDetail: detail },
      { ResultCode: 2, ResultDescription: 'already verified', Success: true, TransactionDetail: detail },
      { ResultCode: -2, ResultDescription: 'not found', Success: false },
    )
    const extra = { RefNum: 'rn', ResNum: '42' }
    expect(await gw().verify(v(extra))).toEqual({ ok: true, refId: '14226761817', cardPan: '621986****8080', amount: 10_000, alreadyVerified: false })
    expect(call(f, 0).url).toBe('https://sep.shaparak.ir/verifyTxnRandomSessionkey/ipg/VerifyTransaction')
    expect(jsonBody(f, 0)).toEqual({ RefNum: 'rn', TerminalNumber: 1234 })
    expect(await gw().verify(v(extra))).toMatchObject({ ok: true, alreadyVerified: true })
    expect(await gw().verify(v(extra))).toEqual({ ok: false, code: '-2', message: 'not found' })
  })

  it('fails without calling the bank when RefNum is missing or ResNum mismatches', async () => {
    const f = stubFetch()
    expect(await gw().verify(v({}))).toMatchObject({ ok: false, code: 'MISSING_REFNUM' })
    expect(await gw().verify(v({ RefNum: 'rn', ResNum: '41' }))).toMatchObject({ ok: false, code: 'ORDER_MISMATCH' })
    expect(f).not.toHaveBeenCalled()
  })
})
