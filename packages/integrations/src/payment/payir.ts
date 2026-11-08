import { z } from 'zod'
import { IntegrationError, fetchJson } from '../errors'
import type { GatewayAdapterOptions, PaymentGateway } from './types'
import { JSON_HEADERS, orderMismatch, str, toIntAmount } from './util'

/**
 * Pay.ir. Docs: https://docs.pay.ir/gateway/
 * Sandbox: API key `test` on the live host (used when sandbox is on and no apiKey is set). Amounts in rials.
 * Pay.ir reports "already verified" as an error code we have not confirmed, so a repeat verify is a failure here.
 */
const BASE = 'https://pay.ir/pg'
const Id = z.union([z.number(), z.string()])
const SendResponse = z.object({ status: Id, token: Id.optional(), errorCode: Id.optional(), errorMessage: z.string().optional() })
const VerifyResponse = z.object({
  status: Id,
  amount: Id.nullish(),
  transId: Id.nullish(),
  factorNumber: Id.nullish(),
  cardNumber: z.string().nullish(),
  errorCode: Id.optional(),
  errorMessage: z.string().optional(),
})

export function createPayirGateway(opts: GatewayAdapterOptions): PaymentGateway {
  const configured = opts.credentials.apiKey?.trim()
  if (!configured && !opts.sandbox) throw new IntegrationError('payir', 'apiKey is missing')
  const api = configured || 'test'

  return {
    name: 'payir',
    async createPayment(input) {
      const raw = await fetchJson('payir', `${BASE}/send`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          api,
          amount: input.amount,
          redirect: input.callbackUrl,
          mobile: input.mobile,
          factorNumber: input.attemptId,
          description: input.description,
        }),
      })
      const parsed = SendResponse.safeParse(raw)
      if (!parsed.success || String(parsed.data.status) !== '1' || parsed.data.token === undefined) {
        const why = parsed.success && parsed.data.errorCode !== undefined ? `: ${parsed.data.errorCode} ${parsed.data.errorMessage ?? ''}`.trimEnd() : ''
        throw new IntegrationError('payir', `Payment request failed${why}`, raw)
      }
      const authority = String(parsed.data.token)
      return { authority, redirect: { method: 'GET', url: `${BASE}/${encodeURIComponent(authority)}` } }
    },
    async verify({ authority, attemptId }) {
      const raw = await fetchJson('payir', `${BASE}/verify`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ api, token: authority }),
      })
      const parsed = VerifyResponse.safeParse(raw)
      if (!parsed.success) throw new IntegrationError('payir', 'Unexpected verify response', raw)
      const d = parsed.data
      if (String(d.status) !== '1') {
        return { ok: false, code: str(d.errorCode) ?? 'UNKNOWN', message: d.errorMessage ?? 'Verification failed' }
      }
      const mismatch = orderMismatch(str(d.factorNumber), attemptId)
      if (mismatch) return mismatch
      return { ok: true, refId: str(d.transId) ?? authority, cardPan: d.cardNumber ?? undefined, amount: toIntAmount(d.amount), alreadyVerified: false }
    },
    parseCallback(params) {
      const authority = params.get('token')
      if (!authority) return null
      return { authority, success: params.get('status') === '1', extra: {} }
    },
  }
}
