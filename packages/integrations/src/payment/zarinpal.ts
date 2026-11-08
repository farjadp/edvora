import { z } from 'zod'
import { IntegrationError, fetchJson } from '../errors'
import type { GatewayAdapterOptions, PaymentGateway } from './types'
import { JSON_HEADERS, requireCredential } from './util'

/**
 * Zarinpal REST v4. Docs: https://www.zarinpal.com/docs/paymentGateway/
 * Amounts are sent with `currency: 'IRR'`. v4 verify does not echo the amount, so `amount` stays undefined.
 */
const ErrorObj = z.object({ code: z.number(), message: z.string() })
const RequestData = z.object({ code: z.number(), authority: z.string() })
const VerifyData = z.object({ code: z.number(), ref_id: z.union([z.number(), z.string()]), card_pan: z.string().nullish() })
const Envelope = z.object({ data: z.unknown(), errors: z.unknown() })

export function createZarinpalGateway(opts: GatewayAdapterOptions): PaymentGateway {
  const merchantId = requireCredential('zarinpal', opts.credentials, 'merchantId')
  const host = opts.sandbox ? 'https://sandbox.zarinpal.com' : 'https://payment.zarinpal.com'

  return {
    name: 'zarinpal',
    async createPayment(input) {
      const raw = await fetchJson('zarinpal', `${host}/pg/v4/payment/request.json`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          merchant_id: merchantId,
          amount: input.amount,
          currency: 'IRR',
          callback_url: input.callbackUrl,
          description: input.description,
          metadata: { mobile: input.mobile, email: input.email, order_id: input.attemptId },
        }),
      })
      const env = Envelope.safeParse(raw)
      const data = env.success ? RequestData.safeParse(env.data.data) : null
      if (!data?.success || data.data.code !== 100) {
        const err = env.success ? ErrorObj.safeParse(env.data.errors) : null
        throw new IntegrationError('zarinpal', `Payment request failed${err?.success ? `: ${err.data.code} ${err.data.message}` : ''}`, raw)
      }
      const { authority } = data.data
      return { authority, redirect: { method: 'GET', url: `${host}/pg/StartPay/${encodeURIComponent(authority)}` } }
    },
    async verify({ authority, amount }) {
      const raw = await fetchJson('zarinpal', `${host}/pg/v4/payment/verify.json`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ merchant_id: merchantId, amount, authority }),
      })
      const env = Envelope.safeParse(raw)
      if (!env.success) throw new IntegrationError('zarinpal', 'Unexpected verify response', raw)
      const data = VerifyData.safeParse(env.data.data)
      if (data.success && (data.data.code === 100 || data.data.code === 101)) {
        return { ok: true, refId: String(data.data.ref_id), cardPan: data.data.card_pan ?? undefined, alreadyVerified: data.data.code === 101 }
      }
      const err = ErrorObj.safeParse(env.data.errors)
      if (err.success) return { ok: false, code: String(err.data.code), message: err.data.message }
      return { ok: false, code: data.success ? String(data.data.code) : 'UNKNOWN', message: 'Verification failed' }
    },
    parseCallback(params) {
      const authority = params.get('Authority')
      if (!authority) return null
      return { authority, success: params.get('Status') === 'OK', extra: {} }
    },
  }
}
