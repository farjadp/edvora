import 'server-only'
import { createHash } from 'node:crypto'
import { createPaymentProvider, createSmsProvider, type PaymentProvider, type SmsProvider } from '@edvora/integrations'
import { createLiveClassProvider, type LiveClassProvider } from '@edvora/integrations/live-class'
import { createObjectStorage, type ObjectStorage } from '@edvora/integrations/storage'
import { renderTemplate, type MessageEvent } from '@edvora/core/settings'
import { env } from '../env'
import type { Tenant } from '../payload-types'
import { getPayloadClient } from './payload'
import { academyProvider } from './settings'

let sms: SmsProvider | undefined

export function getSms(): SmsProvider {
  if (!sms) {
    const e = env()
    sms = createSmsProvider({ provider: e.SMS_PROVIDER, kavenegarApiKey: e.KAVENEGAR_API_KEY, kavenegarSender: e.KAVENEGAR_SENDER })
  }
  return sms
}

/**
 * E-047 (ADR 019 §5): the academy's own SMS account when it is switched on, keyed and allowed by the platform;
 * otherwise the platform default from env. Also returns the OTP template name to use with it.
 */
export async function getSmsFor(tenantId: number | null | undefined): Promise<{ sms: SmsProvider; otpTemplate: string }> {
  const fallback = { sms: getSms(), otpTemplate: env().KAVENEGAR_OTP_TEMPLATE }
  if (!tenantId) return fallback
  const own = await academyProvider(await getPayloadClient(), tenantId, 'sms')
  if (!own || own.provider !== 'kavenegar') return fallback
  const sender = typeof own.config.sender === 'string' && own.config.sender ? own.config.sender : undefined
  const otp = typeof own.config.otpTemplate === 'string' && own.config.otpTemplate ? own.config.otpTemplate : fallback.otpTemplate
  return { sms: createSmsProvider({ provider: 'kavenegar', kavenegarApiKey: own.secret, kavenegarSender: sender }), otpTemplate: otp }
}

/** The academy's SMS text for an event when its template is on (settings hub), else `fallback`. */
export function messageFor(tenant: Pick<Tenant, 'name' | 'messageTemplates'>, event: MessageEvent, vars: Record<string, string | number>, fallback: string): string {
  const t = (tenant.messageTemplates ?? []).find((m) => m.event === event && m.channel === 'sms' && m.enabled && m.body?.trim())
  return t?.body ? renderTemplate(t.body, { academy: tenant.name, ...vars }).trim() || fallback : fallback
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

/**
 * Live-class provider (ADR 012). One provider per Edvora instance (env), shared by its academies; the mock
 * needs no server and opens `/live/mock` on the request's own origin.
 */
export function getLiveClass(origin?: string): LiveClassProvider {
  const e = env()
  if (e.LIVE_CLASS_PROVIDER === 'bigbluebutton') {
    return createLiveClassProvider({ provider: 'bigbluebutton', baseUrl: e.BBB_URL ?? '', secret: e.BBB_SECRET ?? '', checksumAlgorithm: e.BBB_CHECKSUM })
  }
  return createLiveClassProvider({
    provider: 'mock',
    mockRoomUrl: `${origin ?? e.NEXT_PUBLIC_SITE_URL}/live/mock`,
    mockSecret: e.LIVE_CLASS_MOCK_SECRET || createHash('sha256').update(`live:${e.SESSION_SECRET}`).digest('hex'),
  })
}

let storage: ObjectStorage | undefined

/** Private object storage (E-017). One bucket per instance; keys start with the tenant id. */
export function getStorage(): ObjectStorage {
  if (!storage) {
    const e = env()
    storage =
      e.STORAGE_PROVIDER === 's3'
        ? createObjectStorage({
            provider: 's3',
            endpoint: e.S3_ENDPOINT ?? '',
            bucket: e.S3_BUCKET ?? '',
            accessKeyId: e.S3_ACCESS_KEY_ID ?? '',
            secretAccessKey: e.S3_SECRET_ACCESS_KEY ?? '',
            region: e.S3_REGION,
          })
        : createObjectStorage({ provider: 'mock', mockBaseUrl: `${e.NEXT_PUBLIC_SITE_URL}/mock-storage` })
  }
  return storage
}

/** Notifications never break the main flow: failures are logged, not thrown. With `tenantId`, the academy's own SMS account is used when set. */
export async function notify(to: string | null | undefined, text: string, tenantId?: number | null): Promise<void> {
  if (!to) return
  try {
    const { sms: provider } = await getSmsFor(tenantId)
    const res = await provider.send({ to, text })
    if (!res.ok) console.error(`[notify] SMS to ${to} failed: ${res.error}`)
  } catch (err) {
    console.error('[notify] SMS error', err)
  }
}
