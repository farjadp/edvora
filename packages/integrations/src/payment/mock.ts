import { randomUUID } from 'node:crypto'
import type { PaymentProvider } from './types'

/**
 * Stateless mock gateway for local dev, tests and agents.
 * The authority encodes the amount so verify() can check it without storage.
 * redirectUrl points to the app's own /pay/mock page, which simulates the bank page.
 */
export function createMockPaymentProvider(opts: { mockGatewayUrl: string }): PaymentProvider {
  return {
    name: 'mock',
    async createPayment(input) {
      const authority = `MOCK-${input.amount}-${randomUUID().slice(0, 8)}`
      const url = new URL(opts.mockGatewayUrl)
      url.searchParams.set('authority', authority)
      url.searchParams.set('amount', String(input.amount))
      url.searchParams.set('callback', input.callbackUrl)
      return { authority, redirectUrl: url.toString() }
    },
    async verify({ authority, amount }) {
      const m = /^MOCK-(\d+)-[a-f0-9]{8}$/.exec(authority)
      if (!m) return { ok: false, code: 'INVALID_AUTHORITY', message: 'Unknown authority' }
      if (Number(m[1]) !== amount) return { ok: false, code: 'AMOUNT_MISMATCH', message: 'Amount mismatch' }
      return { ok: true, refId: `REF${Date.now()}`, cardPan: '6037-99**-****-1234', alreadyVerified: false }
    },
    parseCallback(params) {
      const authority = params.get('Authority')
      if (!authority) return null
      return { authority, success: params.get('Status') === 'OK' }
    },
  }
}
