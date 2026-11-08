import { z } from 'zod'
import { IntegrationError, fetchJson } from '../errors'
import type { GatewayAdapterOptions, PaymentGateway } from './types'
import { JSON_HEADERS, orderMismatch, pickParams, str, toIntAmount } from './util'

/**
 * Zibal. Docs: https://help.zibal.ir/IPG/API/
 * Sandbox: merchant `zibal` on the live host (used when sandbox is on and no merchantId is set). Amounts in rials.
 */
const BASE = 'https://gateway.zibal.ir'
const RequestResponse = z.object({ result: z.number(), trackId: z.union([z.number(), z.string()]).optional(), message: z.string().optional() })
const VerifyResponse = z.object({
  result: z.number(),
  message: z.string().optional(),
  amount: z.union([z.number(), z.string()]).nullish(),
  refNumber: z.union([z.number(), z.string()]).nullish(),
  cardNumber: z.string().nullish(),
  orderId: z.union([z.number(), z.string()]).nullish(),
})

export function createZibalGateway(opts: GatewayAdapterOptions): PaymentGateway {
  const configured = opts.credentials.merchantId?.trim()
  if (!configured && !opts.sandbox) throw new IntegrationError('zibal', 'merchantId is missing')
  const merchant = configured || 'zibal'

  return {
    name: 'zibal',
    async createPayment(input) {
      const raw = await fetchJson('zibal', `${BASE}/v1/request`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          merchant,
          amount: input.amount,
          callbackUrl: input.callbackUrl,
          orderId: input.attemptId,
          mobile: input.mobile,
          description: input.description,
        }),
      })
      const parsed = RequestResponse.safeParse(raw)
      if (!parsed.success || parsed.data.result !== 100 || parsed.data.trackId === undefined) {
        const why = parsed.success ? `: ${parsed.data.result} ${parsed.data.message ?? ''}`.trimEnd() : ''
        throw new IntegrationError('zibal', `Payment request failed${why}`, raw)
      }
      const authority = String(parsed.data.trackId)
      return { authority, redirect: { method: 'GET', url: `${BASE}/start/${encodeURIComponent(authority)}` } }
    },
    async verify({ authority, attemptId }) {
      const raw = await fetchJson('zibal', `${BASE}/v1/verify`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ merchant, trackId: /^\d+$/.test(authority) ? Number(authority) : authority }),
      })
      const parsed = VerifyResponse.safeParse(raw)
      if (!parsed.success) throw new IntegrationError('zibal', 'Unexpected verify response', raw)
      const d = parsed.data
      if (d.result !== 100 && d.result !== 201) return { ok: false, code: String(d.result), message: d.message ?? 'Verification failed' }
      const mismatch = orderMismatch(str(d.orderId), attemptId)
      if (mismatch) return mismatch
      return {
        ok: true,
        refId: str(d.refNumber) ?? authority,
        cardPan: d.cardNumber ?? undefined,
        amount: toIntAmount(d.amount),
        alreadyVerified: d.result === 201,
      }
    },
    parseCallback(params) {
      const authority = params.get('trackId')
      if (!authority) return null
      return { authority, success: params.get('success') === '1', extra: pickParams(params, ['orderId', 'status']) }
    },
  }
}
