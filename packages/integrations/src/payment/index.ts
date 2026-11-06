import { IntegrationError } from '../errors'
import { createMockPaymentProvider } from './mock'
import type { PaymentProvider } from './types'
import { createZarinpalProvider } from './zarinpal'

export * from './types'
export { createMockPaymentProvider, createZarinpalProvider }

export type PaymentConfig = {
  provider: string | undefined
  zarinpalMerchantId?: string
  zarinpalSandbox?: boolean
  mockGatewayUrl: string
}

/** Picks the gateway from config. Per-tenant credentials are passed in by the caller. */
export function createPaymentProvider(cfg: PaymentConfig): PaymentProvider {
  switch (cfg.provider ?? 'mock') {
    case 'mock':
      return createMockPaymentProvider({ mockGatewayUrl: cfg.mockGatewayUrl })
    case 'zarinpal':
      return createZarinpalProvider({ merchantId: cfg.zarinpalMerchantId ?? '', sandbox: cfg.zarinpalSandbox })
    default:
      throw new IntegrationError('payment', `Unknown PAYMENT_PROVIDER: ${cfg.provider}`)
  }
}
