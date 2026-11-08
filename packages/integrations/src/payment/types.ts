/**
 * Payment adapters (ADR 003, ADR 017). Every gateway and chain verifier implements one of these interfaces and has a
 * mock. All money is integer rials; USDT is an integer in the token's smallest unit (bigint).
 */

/** Online gateways Edvora can talk to. `mock` is the offline stand-in for all of them. */
export const GATEWAY_KEYS = ['mellat', 'saman', 'zarinpal', 'zibal', 'idpay', 'payir', 'nextpay'] as const
export type GatewayKey = (typeof GATEWAY_KEYS)[number]
export type GatewayName = GatewayKey | 'mock'

export const isGatewayKey = (v: unknown): v is GatewayKey => typeof v === 'string' && (GATEWAY_KEYS as readonly string[]).includes(v)

/** Per-academy secrets. Which ones a gateway needs: see `GATEWAY_CREDENTIALS`. */
export type GatewayCredentials = {
  merchantId?: string
  terminalId?: string
  username?: string
  password?: string
  apiKey?: string
}
export type CredentialKey = keyof GatewayCredentials

/** Options every real gateway adapter takes (re-exported from `./index`). */
export type GatewayAdapterOptions = { credentials: GatewayCredentials; sandbox: boolean }

/** Required credentials per gateway (the admin form and the config check read this). */
export const GATEWAY_CREDENTIALS: Readonly<Record<GatewayKey, readonly CredentialKey[]>> = {
  mellat: ['terminalId', 'username', 'password'],
  saman: ['terminalId'],
  zarinpal: ['merchantId'],
  zibal: ['merchantId'],
  idpay: ['apiKey'],
  payir: ['apiKey'],
  nextpay: ['apiKey'],
}

export type CreatePaymentInput = {
  /** Amount in rials (integer). */
  amount: number
  description: string
  /** Where the gateway sends the buyer back. Must be on the academy's own origin. */
  callbackUrl: string
  mobile?: string
  email?: string
  orderId: string
  /**
   * Our id for this attempt, unique per gateway account: digits only (Mellat needs a long; also used as
   * Saman's ResNum and the intermediaries' order_id). The app passes the `payments` row id.
   */
  attemptId: string
}

/** How to send the buyer to the bank page. POST is a form the app renders on its own origin and submits. */
export type GatewayRedirect = { method: 'GET'; url: string } | { method: 'POST'; url: string; fields: Record<string, string> }

export type CreatePaymentResult = {
  /** Gateway reference stored on the payment row (token / authority / trackId / RefId). */
  authority: string
  redirect: GatewayRedirect
}

export type GatewayCallback = {
  authority: string
  /** The gateway says the buyer paid. Always verify anyway. */
  success: boolean
  /** Values `verify` needs that only the callback carries (Mellat SaleReferenceId, Saman RefNum, …). */
  extra: Record<string, string>
}

export type VerifyPaymentInput = {
  authority: string
  /** The amount we expect, in rials. */
  amount: number
  attemptId: string
  extra: Record<string, string>
}

export type VerifyPaymentResult =
  | {
      ok: true
      refId: string
      cardPan?: string
      /** Amount the gateway says was paid, in rials, when its API returns it. The app compares it with the attempt. */
      amount?: number
      /** The gateway had already verified this payment (a repeated callback). */
      alreadyVerified: boolean
    }
  | { ok: false; code: string; message: string }

/** Every online gateway implements this. */
export interface PaymentGateway {
  readonly name: GatewayName
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>
  /** Reads the callback: query string and, for POST callbacks, the form body merged into one set of params. */
  parseCallback(params: URLSearchParams): GatewayCallback | null
  verify(input: VerifyPaymentInput): Promise<VerifyPaymentResult>
}

/** @deprecated name kept for older imports. */
export type PaymentProvider = PaymentGateway

// ---------------------------------------------------------------- Tether (USDT) on-chain verification

export const USDT_NETWORKS = ['trc20', 'bep20'] as const
export type UsdtNetwork = (typeof USDT_NETWORKS)[number]

/** One token transfer inside a transaction, in canonical address form (TRON base58, BSC lowercase 0x hex). */
export type ChainTransfer = {
  tokenContract: string
  from: string
  to: string
  /** Smallest unit of the token. */
  amount: bigint
}

export type ChainLookup =
  | { found: false }
  | {
      found: true
      network: UsdtNetwork
      txHash: string
      /** The transaction executed successfully (TRON receipt SUCCESS / EVM status 0x1). */
      success: boolean
      blockNumber: number
      confirmations: number
      timestamp: Date
      transfers: ChainTransfer[]
    }

export type ChainLookupInput = {
  network: UsdtNetwork
  txHash: string
  /** Only the mock uses this, to fabricate a matching transfer. Real verifiers ignore it. */
  hint?: { to: string; amount: bigint; tokenContract: string }
}

/** Throws `IntegrationError` when the chain API is unavailable (no key, network error, rate limit). */
export interface ChainVerifier {
  readonly name: string
  lookup(input: ChainLookupInput): Promise<ChainLookup>
}
