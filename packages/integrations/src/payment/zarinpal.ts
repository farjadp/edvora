import { z } from 'zod'
import { IntegrationError, fetchJson } from '../errors'
import type { PaymentProvider } from './types'

/** Zarinpal REST v4. Docs: https://www.zarinpal.com/docs/paymentGateway/ */
const RequestResponse = z.object({
  data: z.union([z.object({ code: z.number(), authority: z.string() }), z.array(z.unknown())]),
  errors: z.union([z.object({ code: z.number(), message: z.string() }), z.array(z.unknown())]),
})

const VerifyResponse = z.object({
  data: z.union([
    z.object({ code: z.number(), ref_id: z.union([z.number(), z.string()]), card_pan: z.string().optional() }),
    z.array(z.unknown()),
  ]),
  errors: z.union([z.object({ code: z.number(), message: z.string() }), z.array(z.unknown())]),
})

export function createZarinpalProvider(opts: { merchantId: string; sandbox?: boolean }): PaymentProvider {
  if (!opts.merchantId) throw new IntegrationError('zarinpal', 'ZARINPAL_MERCHANT_ID is missing')
  const host = opts.sandbox ? 'https://sandbox.zarinpal.com' : 'https://payment.zarinpal.com'

  return {
    name: 'zarinpal',
    async createPayment(input) {
      const raw = await fetchJson('zarinpal', `${host}/pg/v4/payment/request.json`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          merchant_id: opts.merchantId,
          amount: input.amount,
          currency: 'IRR',
          callback_url: input.callbackUrl,
          description: input.description,
          metadata: { mobile: input.mobile, email: input.email, order_id: input.orderId },
        }),
      })
      const parsed = RequestResponse.safeParse(raw)
      if (!parsed.success || Array.isArray(parsed.data.data) || parsed.data.data.code !== 100) {
        throw new IntegrationError('zarinpal', 'Payment request failed', raw)
      }
      const { authority } = parsed.data.data
      return { authority, redirectUrl: `${host}/pg/StartPay/${authority}` }
    },
    async verify({ authority, amount }) {
      const raw = await fetchJson('zarinpal', `${host}/pg/v4/payment/verify.json`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ merchant_id: opts.merchantId, amount, authority }),
      })
      const parsed = VerifyResponse.safeParse(raw)
      if (!parsed.success) throw new IntegrationError('zarinpal', 'Unexpected verify response', raw)
      const { data, errors } = parsed.data
      if (!Array.isArray(data) && (data.code === 100 || data.code === 101)) {
        return { ok: true, refId: String(data.ref_id), cardPan: data.card_pan, alreadyVerified: data.code === 101 }
      }
      const err = Array.isArray(errors) ? { code: -1, message: 'Unknown error' } : errors
      return { ok: false, code: String(err.code), message: err.message }
    },
    parseCallback(params) {
      const authority = params.get('Authority')
      if (!authority) return null
      return { authority, success: params.get('Status') === 'OK' }
    },
  }
}
