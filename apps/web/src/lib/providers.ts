import 'server-only'
import { createPaymentProvider, createSmsProvider, type PaymentProvider, type SmsProvider } from '@edvora/integrations'
import { env } from '../env'
import type { Tenant } from '../payload-types'

let sms: SmsProvider | undefined

export function getSms(): SmsProvider {
  if (!sms) {
    const e = env()
    sms = createSmsProvider({ provider: e.SMS_PROVIDER, kavenegarApiKey: e.KAVENEGAR_API_KEY, kavenegarSender: e.KAVENEGAR_SENDER })
  }
  return sms
}

/** Each academy can use its own gateway account; falls back to the platform default. */
export function getPayment(tenant: Tenant, origin?: string): PaymentProvider {
  const e = env()
  return createPaymentProvider({
    provider: e.PAYMENT_PROVIDER,
    zarinpalMerchantId: tenant.zarinpalMerchantId || e.ZARINPAL_MERCHANT_ID,
    zarinpalSandbox: e.ZARINPAL_SANDBOX,
    mockGatewayUrl: `${origin ?? e.NEXT_PUBLIC_SITE_URL}/pay/mock`,
  })
}

/** Notifications never break the main flow: failures are logged, not thrown. */
export async function notify(to: string | null | undefined, text: string): Promise<void> {
  if (!to) return
  try {
    const res = await getSms().send({ to, text })
    if (!res.ok) console.error(`[notify] SMS to ${to} failed: ${res.error}`)
  } catch (err) {
    console.error('[notify] SMS error', err)
  }
}
