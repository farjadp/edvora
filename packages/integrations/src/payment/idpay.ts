import { z } from 'zod'
import { IntegrationError, fetchJson } from '../errors'
import type { GatewayAdapterOptions, PaymentGateway } from './types'
import { orderMismatch, pickParams, requireCredential, str, toIntAmount } from './util'

/**
 * IDPay v1.1. Docs: https://idpay.ir/web-service/v1.1/
 * Sandbox: same host and API key with header `X-SANDBOX: 1`. Amounts in rials. Callback can be GET or POST.
 */
const BASE = 'https://api.idpay.ir/v1.1'
const ErrorBody = z.object({ error_code: z.union([z.number(), z.string()]), error_message: z.string() })
const CreateResponse = z.object({ id: z.string(), link: z.string() })
const VerifyResponse = z.object({
  status: z.union([z.number(), z.string()]),
  id: z.string().optional(),
  order_id: z.union([z.number(), z.string()]).nullish(),
  amount: z.union([z.number(), z.string()]).nullish(),
  track_id: z.union([z.number(), z.string()]).nullish(),
  payment: z.object({ card_no: z.string().nullish(), track_id: z.union([z.number(), z.string()]).nullish() }).nullish(),
})

export function createIdpayGateway(opts: GatewayAdapterOptions): PaymentGateway {
  const apiKey = requireCredential('idpay', opts.credentials, 'apiKey')
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json', 'X-API-KEY': apiKey }
  if (opts.sandbox) headers['X-SANDBOX'] = '1'

  return {
    name: 'idpay',
    async createPayment(input) {
      const raw = await fetchJson('idpay', `${BASE}/payment`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ order_id: input.attemptId, amount: input.amount, phone: input.mobile, desc: input.description, callback: input.callbackUrl }),
      })
      const parsed = CreateResponse.safeParse(raw)
      if (!parsed.success) {
        const err = ErrorBody.safeParse(raw)
        throw new IntegrationError('idpay', `Payment request failed${err.success ? `: ${err.data.error_code} ${err.data.error_message}` : ''}`, raw)
      }
      return { authority: parsed.data.id, redirect: { method: 'GET', url: parsed.data.link } }
    },
    async verify({ authority, attemptId }) {
      const raw = await fetchJson('idpay', `${BASE}/payment/verify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ id: authority, order_id: attemptId }),
      })
      const err = ErrorBody.safeParse(raw)
      if (err.success) return { ok: false, code: String(err.data.error_code), message: err.data.error_message }
      const parsed = VerifyResponse.safeParse(raw)
      if (!parsed.success) throw new IntegrationError('idpay', 'Unexpected verify response', raw)
      const d = parsed.data
      const status = Number(d.status)
      if (status !== 100 && status !== 101) return { ok: false, code: `STATUS_${status}`, message: 'Verification failed' }
      const mismatch = orderMismatch(str(d.order_id), attemptId)
      if (mismatch) return mismatch
      return {
        ok: true,
        refId: str(d.track_id) ?? str(d.payment?.track_id) ?? authority,
        cardPan: d.payment?.card_no ?? undefined,
        amount: toIntAmount(d.amount),
        alreadyVerified: status === 101,
      }
    },
    parseCallback(params) {
      const authority = params.get('id')
      if (!authority) return null
      return { authority, success: params.get('status') === '10', extra: pickParams(params, ['track_id', 'order_id', 'amount']) }
    },
  }
}
