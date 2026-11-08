import { randomUUID } from 'node:crypto'
import { IntegrationError } from '../errors'
import type { ChainVerifier, PaymentGateway } from './types'

/**
 * Stateless mock gateway for local dev, tests, the demo and agents (PAYMENT_PROVIDER=mock).
 * The authority encodes the amount so verify() can check it without storage.
 * The redirect points to the app's own /pay/mock page, which simulates the bank page.
 */
export function createMockPaymentProvider(opts: { mockGatewayUrl: string }): PaymentGateway {
  return {
    name: 'mock',
    async createPayment(input) {
      const authority = `MOCK-${input.amount}-${randomUUID().slice(0, 8)}`
      const url = new URL(opts.mockGatewayUrl)
      url.searchParams.set('authority', authority)
      url.searchParams.set('amount', String(input.amount))
      url.searchParams.set('callback', input.callbackUrl)
      return { authority, redirect: { method: 'GET', url: url.toString() } }
    },
    async verify({ authority, amount }) {
      const m = /^MOCK-(\d+)-[a-f0-9]{8}$/.exec(authority)
      if (!m) return { ok: false, code: 'INVALID_AUTHORITY', message: 'Unknown authority' }
      if (Number(m[1]) !== amount) return { ok: false, code: 'AMOUNT_MISMATCH', message: 'Amount mismatch' }
      return { ok: true, refId: `REF-${authority.slice(-8)}`, cardPan: '6037-99**-****-1234', amount, alreadyVerified: false }
    },
    parseCallback(params) {
      const authority = params.get('Authority')
      if (!authority) return null
      return { authority, success: params.get('Status') === 'OK', extra: {} }
    },
  }
}

/**
 * Deterministic chain verifier for tests and the demo (CHAIN_VERIFIER=mock). The first hex digit of the hash
 * (after an optional 0x) picks the scenario:
 *   a → a matching, successful transfer with plenty of confirmations
 *   b → the amount is one unit short
 *   c → sent to another wallet
 *   d → the chain API is unavailable (throws, like a real outage)
 *   e → matching but only 1 confirmation (still waiting)
 *   f → the transaction failed on-chain
 *   anything else → not found
 */
export function createMockChainVerifier(): ChainVerifier {
  return {
    name: 'mock-chain',
    async lookup({ network, txHash, hint }) {
      const first = txHash.replace(/^0x/i, '').charAt(0).toLowerCase()
      if (first === 'd') throw new IntegrationError('mock-chain', 'chain API unavailable')
      if (!hint || !'abcef'.includes(first) || first === '') return { found: false }
      const to = first === 'c' ? (network === 'trc20' ? 'TXYZmockOtherWalletAddressAAAAAAAA' : '0x000000000000000000000000000000000000dead') : hint.to
      const amount = first === 'b' ? hint.amount - 1n : hint.amount
      return {
        found: true,
        network,
        txHash,
        success: first !== 'f',
        blockNumber: 1_000_000,
        confirmations: first === 'e' ? 1 : 100,
        timestamp: new Date(),
        transfers: [{ tokenContract: hint.tokenContract, from: 'mock-sender', to, amount }],
      }
    },
  }
}
