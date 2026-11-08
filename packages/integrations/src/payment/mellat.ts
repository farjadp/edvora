import { IntegrationError, fetchText } from '../errors'
import type { GatewayAdapterOptions, PaymentGateway } from './types'
import { pickParams, requireCredential, toIntAmount } from './util'

/**
 * Behpardakht Mellat, SOAP 1.1. bpPayRequest → form POST to startpay → POST callback → bpVerifyRequest + bpSettleRequest.
 * The `sandbox` flag does not change hosts (Mellat gives test terminals on the live endpoint).
 * localDate/localTime are Tehran wall-clock time (Gregorian yyyyMMdd / HHmmss).
 * If settle fails the bank reverses an unsettled payment itself; we do not call bpReversalRequest.
 */
const SOAP_URL = 'https://bpm.shaparak.ir/pgwchannel/services/pgw'
const PAY_URL = 'https://bpm.shaparak.ir/pgwchannel/startpay.mellat'
const NS = 'http://interfaces.core.sw.bps.com/'

const XML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
export const xmlEscape = (s: string): string => s.replace(/[&<>"']/g, (c) => XML_ESC[c] ?? c)
const xmlUnescape = (s: string): string =>
  s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (m, e: string) => {
    const k = e.toLowerCase()
    if (k === 'lt') return '<'
    if (k === 'gt') return '>'
    if (k === 'quot') return '"'
    if (k === 'apos') return "'"
    if (k === 'amp') return '&'
    const code = k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : m
  })

/** A SOAP 1.1 envelope for one bp* operation. Parameters are unqualified, in the given order. */
export function soapEnvelope(operation: string, params: ReadonlyArray<readonly [string, string]>): string {
  const body = params.map(([k, v]) => `<${k}>${xmlEscape(v)}</${k}>`).join('')
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="${NS}">` +
    `<soapenv:Body><ns1:${operation}>${body}</ns1:${operation}></soapenv:Body></soapenv:Envelope>`
  )
}

/** Text of the first `<return>` element (any namespace prefix), or null. */
export function soapReturn(xml: string): string | null {
  const m = /<(?:[\w.-]+:)?return(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?return>/.exec(xml)
  return m ? xmlUnescape(m[1] ?? '').trim() : null
}

function soapFault(xml: string): string | null {
  const m = /<(?:[\w.-]+:)?faultstring(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?faultstring>/.exec(xml)
  return m ? xmlUnescape(m[1] ?? '').trim() : null
}

function tehranNow(d: Date): { localDate: string; localTime: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === t)?.value ?? ''
  return { localDate: `${get('year')}${get('month')}${get('day')}`, localTime: `${get('hour')}${get('minute')}${get('second')}` }
}

export function createMellatGateway(opts: GatewayAdapterOptions): PaymentGateway {
  const terminalId = requireCredential('mellat', opts.credentials, 'terminalId')
  const userName = requireCredential('mellat', opts.credentials, 'username')
  const userPassword = requireCredential('mellat', opts.credentials, 'password')
  const auth = [
    ['terminalId', terminalId],
    ['userName', userName],
    ['userPassword', userPassword],
  ] as const

  async function call(operation: string, params: ReadonlyArray<readonly [string, string]>): Promise<string> {
    const xml = await fetchText('mellat', SOAP_URL, {
      method: 'POST',
      headers: { 'content-type': 'text/xml; charset=utf-8', SOAPAction: '""' },
      body: soapEnvelope(operation, [...auth, ...params]),
    })
    const ret = soapReturn(xml)
    if (ret === null) throw new IntegrationError('mellat', `${operation}: ${soapFault(xml) ?? 'no <return> in response'}`, xml.slice(0, 500))
    return ret
  }

  return {
    name: 'mellat',
    async createPayment(input) {
      if (!/^\d{1,18}$/.test(input.attemptId)) throw new IntegrationError('mellat', 'attemptId must be digits (Mellat orderId is a long)')
      const { localDate, localTime } = tehranNow(new Date())
      const ret = await call('bpPayRequest', [
        ['orderId', input.attemptId],
        ['amount', String(input.amount)],
        ['localDate', localDate],
        ['localTime', localTime],
        ['additionalData', input.description],
        ['callBackUrl', input.callbackUrl],
        ['payerId', '0'],
      ])
      const [code, refId] = ret.split(',').map((s) => s.trim())
      if (code !== '0' || !refId) throw new IntegrationError('mellat', `bpPayRequest failed: ${ret}`, ret)
      const fields: Record<string, string> = { RefId: refId }
      if (input.mobile) fields.MobileNo = input.mobile
      return { authority: refId, redirect: { method: 'POST', url: PAY_URL, fields } }
    },
    async verify({ attemptId, extra }) {
      const saleOrderId = extra.SaleOrderId
      const saleReferenceId = extra.SaleReferenceId
      if (!saleOrderId || !saleReferenceId) return { ok: false, code: 'MISSING_REFERENCE', message: 'Callback carried no SaleOrderId/SaleReferenceId' }
      if (saleOrderId !== attemptId) {
        return { ok: false, code: 'ORDER_MISMATCH', message: `Gateway order ${saleOrderId} does not match attempt ${attemptId}` }
      }
      const args = [
        ['orderId', attemptId],
        ['saleOrderId', saleOrderId],
        ['saleReferenceId', saleReferenceId],
      ] as const
      const v = await call('bpVerifyRequest', args)
      if (v !== '0' && v !== '43') return { ok: false, code: v, message: 'bpVerifyRequest failed' }
      const s = await call('bpSettleRequest', args)
      if (s !== '0' && s !== '45') return { ok: false, code: s, message: 'bpSettleRequest failed' }
      return {
        ok: true,
        refId: saleReferenceId,
        cardPan: extra.CardHolderPan,
        amount: toIntAmount(extra.FinalAmount),
        alreadyVerified: v === '43' || s === '45',
      }
    },
    parseCallback(params) {
      const authority = params.get('RefId')
      if (!authority) return null
      return {
        authority,
        success: params.get('ResCode') === '0',
        extra: pickParams(params, ['SaleOrderId', 'SaleReferenceId', 'CardHolderPan', 'FinalAmount']),
      }
    },
  }
}
