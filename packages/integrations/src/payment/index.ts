import { IntegrationError } from '../errors'
import { createBscVerifier } from './bsc'
import { createIdpayGateway } from './idpay'
import { createMellatGateway } from './mellat'
import { createMockChainVerifier, createMockPaymentProvider } from './mock'
import { createNextpayGateway } from './nextpay'
import { createPayirGateway } from './payir'
import { createSamanGateway } from './saman'
import { createTronVerifier } from './tron'
import type { ChainVerifier, GatewayAdapterOptions, GatewayCredentials, GatewayName, PaymentGateway } from './types'
import { createZarinpalGateway } from './zarinpal'
import { createZibalGateway } from './zibal'

export * from './types'
export { tronHexToBase58, tronBase58ToHex, isTronAddress } from './tron'
export {
  createBscVerifier,
  createIdpayGateway,
  createMellatGateway,
  createMockChainVerifier,
  createMockPaymentProvider,
  createNextpayGateway,
  createPayirGateway,
  createSamanGateway,
  createTronVerifier,
  createZarinpalGateway,
  createZibalGateway,
}

export type GatewayConfig = {
  gateway: GatewayName
  sandbox: boolean
  credentials: GatewayCredentials
  /** The app's /pay/mock page; used when `gateway` is mock. */
  mockGatewayUrl: string
}

/** Builds one academy's gateway from its method settings. `PAYMENT_PROVIDER=mock` is applied by the caller. */
export function createGateway(cfg: GatewayConfig): PaymentGateway {
  const o: GatewayAdapterOptions = { credentials: cfg.credentials, sandbox: cfg.sandbox }
  switch (cfg.gateway) {
    case 'mock':
      return createMockPaymentProvider({ mockGatewayUrl: cfg.mockGatewayUrl })
    case 'mellat':
      return createMellatGateway(o)
    case 'saman':
      return createSamanGateway(o)
    case 'zarinpal':
      return createZarinpalGateway(o)
    case 'zibal':
      return createZibalGateway(o)
    case 'idpay':
      return createIdpayGateway(o)
    case 'payir':
      return createPayirGateway(o)
    case 'nextpay':
      return createNextpayGateway(o)
    default:
      throw new IntegrationError('payment', `Unknown gateway: ${String(cfg.gateway)}`)
  }
}

export type ChainVerifierConfig =
  | { verifier: 'mock' }
  | { verifier: 'live'; network: 'trc20'; apiUrl: string; apiKey?: string }
  | { verifier: 'live'; network: 'bep20'; apiUrl: string; apiKey?: string }

export function createChainVerifier(cfg: ChainVerifierConfig): ChainVerifier {
  if (cfg.verifier === 'mock') return createMockChainVerifier()
  return cfg.network === 'trc20' ? createTronVerifier({ apiUrl: cfg.apiUrl, apiKey: cfg.apiKey }) : createBscVerifier({ apiUrl: cfg.apiUrl, apiKey: cfg.apiKey })
}

// ---------------------------------------------------------------- Legacy factory (env-only, before ADR 017)

export type PaymentConfig = {
  provider: string | undefined
  zarinpalMerchantId?: string
  zarinpalSandbox?: boolean
  mockGatewayUrl: string
}

/** Instance-wide gateway from env (`PAYMENT_PROVIDER`), used when an academy has no payment methods configured. */
export function createPaymentProvider(cfg: PaymentConfig): PaymentGateway {
  switch (cfg.provider ?? 'mock') {
    case 'mock':
      return createMockPaymentProvider({ mockGatewayUrl: cfg.mockGatewayUrl })
    case 'zarinpal':
      return createZarinpalGateway({ credentials: { merchantId: cfg.zarinpalMerchantId ?? '' }, sandbox: cfg.zarinpalSandbox ?? true })
    default:
      throw new IntegrationError('payment', `Unknown PAYMENT_PROVIDER: ${cfg.provider}`)
  }
}
