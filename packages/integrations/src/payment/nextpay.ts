import { z } from 'zod'
import { IntegrationError, fetchJson } from '../errors'
import type { GatewayAdapterOptions, PaymentGateway } from './types'
import { orderMismatch, pickParams, requireCredential, str, toIntAmount } from './util'

/**
 * NextPay. Docs: https://nextpay.org/nx/docs
 * NextPay has no official sandbox: with `sandbox: true` this adapter still calls the live API with the given key.
 * We always send `currency: 'IRR'` so amounts stay in rials. Requests are form-encoded.
 */
const BASE = 'https://nextpay.org/nx/gateway'
const Id = z.union([z.number(), z.string()])
const TokenResponse = z.object({ code: Id, trans_id: z.string().optional() })
const VerifyResponse = z.object({
  code: Id,
  amount: Id.nullish(),
  order_id: Id.nullish(),
  card_holder: z.string().nullish(),
  Shaparak_Ref_Id: Id.nullish(),
})

const form = (fields: Record<string, string | undefined>): URLSearchParams => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) p.set(k, v)
  return p
}
const FORM_HEADERS = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' } as const

export function createNextpayGateway(opts: GatewayAdapterOptions): PaymentGateway {
  const apiKey = requireCredential('nextpay', opts.credentials, 'apiKey')

  return {
    name: 'nextpay',
    async createPayment(input) {
      const raw = await fetchJson('nextpay', `${BASE}/token`, {
        method: 'POST',
        headers: FORM_HEADERS,
        body: form({
          api_key: apiKey,
          order_id: input.attemptId,
          amount: String(input.amount),
          callback_uri: input.callbackUrl,
          currency: 'IRR',
          customer_phone: input.mobile,
        }),
      })
      const parsed = TokenResponse.safeParse(raw)
      if (!parsed.success || Number(parsed.data.code) !== -1 || !parsed.data.trans_id) {
        throw new IntegrationError('nextpay', `Payment request failed${parsed.success ? `: ${parsed.data.code}` : ''}`, raw)
      }
      const authority = parsed.data.trans_id
      return { authority, redirect: { method: 'GET', url: `${BASE}/payment/${encodeURIComponent(authority)}` } }
    },
    async verify({ authority, amount, attemptId }) {
      const raw = await fetchJson('nextpay', `${BASE}/verify`, {
        method: 'POST',
        headers: FORM_HEADERS,
        body: form({ api_key: apiKey, trans_id: authority, amount: String(amount), currency: 'IRR' }),
      })
      const parsed = VerifyResponse.safeParse(raw)
      if (!parsed.success) throw new IntegrationError('nextpay', 'Unexpected verify response', raw)
      const d = parsed.data
      if (Number(d.code) !== 0) return { ok: false, code: String(d.code), message: 'Verification failed' }
      const mismatch = orderMismatch(str(d.order_id), attemptId)
      if (mismatch) return mismatch
      return { ok: true, refId: str(d.Shaparak_Ref_Id) ?? authority, cardPan: d.card_holder ?? undefined, amount: toIntAmount(d.amount), alreadyVerified: false }
    },
    parseCallback(params) {
      const authority = params.get('trans_id')
      if (!authority) return null
      // NextPay's callback carries no status flag: verify decides.
      return { authority, success: true, extra: pickParams(params, ['order_id', 'amount']) }
    },
  }
}
