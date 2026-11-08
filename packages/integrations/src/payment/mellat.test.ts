import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMellatGateway, soapEnvelope, soapReturn } from './mellat'
import { baseInput, call, stubFetch } from './test-helpers'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const soap = (op: string, ret: string) =>
  `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:${op}Response xmlns:ns2="http://interfaces.core.sw.bps.com/"><return>${ret}</return></ns2:${op}Response></soap:Body></soap:Envelope>`
const gw = () => createMellatGateway({ credentials: { terminalId: '111', username: 'user', password: 'p&<ss' }, sandbox: false })
const extra = { SaleOrderId: '42', SaleReferenceId: '987654', CardHolderPan: '6104****1234', FinalAmount: '10000' }
const v = (e: Record<string, string> = extra) => ({ authority: 'REF', amount: 10_000, attemptId: '42', extra: e })
const tag = (xml: string, t: string) => new RegExp(`<${t}>([^<]*)</${t}>`).exec(xml)?.[1]

describe('mellat soap helpers', () => {
  it('escapes parameters and reads <return>', () => {
    const env = soapEnvelope('bpPayRequest', [['additionalData', 'a & <b>']])
    expect(env).toContain('<ns1:bpPayRequest><additionalData>a &amp; &lt;b&gt;</additionalData></ns1:bpPayRequest>')
    expect(env).toContain('xmlns:ns1="http://interfaces.core.sw.bps.com/"')
    expect(soapReturn(soap('bpPayRequest', '0,AF82041a2Bf6989c7fF9'))).toBe('0,AF82041a2Bf6989c7fF9')
    expect(soapReturn('<x:return>a&amp;b</x:return>')).toBe('a&b')
    expect(soapReturn('<nothing/>')).toBeNull()
  })
})

describe('mellat', () => {
  it('requires all credentials', () => {
    expect(() => createMellatGateway({ credentials: { terminalId: '1', username: 'u' }, sandbox: false })).toThrow(/password/)
  })

  it('bpPayRequest → POST redirect to startpay', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-08T20:45:10Z')) // Tehran (UTC+3:30) → 2026-11-09 00:15:10
    const f = stubFetch(soap('bpPayRequest', '0,AF82041a2Bf6989c7fF9'))
    expect(await gw().createPayment(baseInput)).toEqual({
      authority: 'AF82041a2Bf6989c7fF9',
      redirect: { method: 'POST', url: 'https://bpm.shaparak.ir/pgwchannel/startpay.mellat', fields: { RefId: 'AF82041a2Bf6989c7fF9', MobileNo: baseInput.mobile } },
    })
    const { url, init } = call(f, 0)
    expect(url).toBe('https://bpm.shaparak.ir/pgwchannel/services/pgw')
    expect(init.headers).toMatchObject({ 'content-type': 'text/xml; charset=utf-8' })
    const xml = String(init.body)
    expect(xml).toContain('<ns1:bpPayRequest>')
    expect(tag(xml, 'terminalId')).toBe('111')
    expect(tag(xml, 'userPassword')).toBe('p&amp;&lt;ss')
    expect(tag(xml, 'orderId')).toBe('42')
    expect(tag(xml, 'amount')).toBe('10000')
    expect(tag(xml, 'localDate')).toBe('20261109')
    expect(tag(xml, 'localTime')).toBe('001510')
    expect(tag(xml, 'callBackUrl')).toBe(baseInput.callbackUrl)
    expect(tag(xml, 'payerId')).toBe('0')
  })

  it('throws on a bpPayRequest error code, a SOAP fault, or a non-numeric attemptId', async () => {
    stubFetch(soap('bpPayRequest', '21'), '<soap:Envelope><soap:Body><soap:Fault><faultstring>bad</faultstring></soap:Fault></soap:Body></soap:Envelope>')
    await expect(gw().createPayment(baseInput)).rejects.toThrow(/bpPayRequest failed: 21/)
    await expect(gw().createPayment(baseInput)).rejects.toThrow(/bad/)
    await expect(gw().createPayment({ ...baseInput, attemptId: 'abc' })).rejects.toThrow(/digits/)
  })

  it('parses the POST callback', () => {
    const p = new URLSearchParams({ RefId: 'REF', ResCode: '0', ...extra })
    expect(gw().parseCallback(p)).toEqual({ authority: 'REF', success: true, extra })
    expect(gw().parseCallback(new URLSearchParams({ RefId: 'REF', ResCode: '17' }))).toEqual({ authority: 'REF', success: false, extra: {} })
  })

  it('verifies then settles', async () => {
    const f = stubFetch(soap('bpVerifyRequest', '0'), soap('bpSettleRequest', '0'))
    expect(await gw().verify(v())).toEqual({ ok: true, refId: '987654', cardPan: '6104****1234', amount: 10_000, alreadyVerified: false })
    const verifyXml = String(call(f, 0).init.body)
    expect(verifyXml).toContain('<ns1:bpVerifyRequest>')
    expect(tag(verifyXml, 'saleOrderId')).toBe('42')
    expect(tag(verifyXml, 'saleReferenceId')).toBe('987654')
    expect(String(call(f, 1).init.body)).toContain('<ns1:bpSettleRequest>')
  })

  it('treats 43 / 45 as already verified / settled', async () => {
    stubFetch(soap('bpVerifyRequest', '43'), soap('bpSettleRequest', '45'))
    expect(await gw().verify(v())).toMatchObject({ ok: true, alreadyVerified: true })
  })

  it('fails on a verify or settle error code', async () => {
    const f = stubFetch(soap('bpVerifyRequest', '415'), soap('bpVerifyRequest', '0'), soap('bpSettleRequest', '46'))
    expect(await gw().verify(v())).toEqual({ ok: false, code: '415', message: 'bpVerifyRequest failed' })
    expect(await gw().verify(v())).toEqual({ ok: false, code: '46', message: 'bpSettleRequest failed' })
    expect(f).toHaveBeenCalledTimes(3)
  })

  it('rejects a mismatched SaleOrderId or a missing reference without calling the bank', async () => {
    const f = stubFetch()
    expect(await gw().verify(v({ ...extra, SaleOrderId: '41' }))).toMatchObject({ ok: false, code: 'ORDER_MISMATCH' })
    expect(await gw().verify(v({ SaleOrderId: '42' }))).toMatchObject({ ok: false, code: 'MISSING_REFERENCE' })
    expect(f).not.toHaveBeenCalled()
  })

  it('leaves amount undefined when FinalAmount is not numeric', async () => {
    stubFetch(soap('bpVerifyRequest', '0'), soap('bpSettleRequest', '0'))
    expect(await gw().verify(v({ ...extra, FinalAmount: '' }))).toMatchObject({ ok: true, amount: undefined })
  })
})
