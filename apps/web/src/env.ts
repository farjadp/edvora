import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PAYLOAD_SECRET: z.string().min(8),
  SESSION_SECRET: z.string().min(8),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  DEFAULT_TENANT_SLUG: z.string().default('iba'),
  PAYMENT_PROVIDER: z.enum(['mock', 'zarinpal']).default('mock'),
  ZARINPAL_MERCHANT_ID: z.string().optional(),
  ZARINPAL_SANDBOX: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  SMS_PROVIDER: z.enum(['mock', 'kavenegar']).default('mock'),
  KAVENEGAR_API_KEY: z.string().optional(),
  KAVENEGAR_SENDER: z.string().optional(),
  KAVENEGAR_OTP_TEMPLATE: z.string().default('verify'),
  // E-033 live classes (ADR 012). One BBB server per Edvora instance, shared by its academies.
  LIVE_CLASS_PROVIDER: z.enum(['mock', 'bigbluebutton']).default('mock'),
  LIVE_CLASS_MOCK_SECRET: z.string().optional(),
  BBB_URL: z.string().url().optional(),
  BBB_SECRET: z.string().optional(),
  BBB_CHECKSUM: z.enum(['sha1', 'sha256', 'sha512']).default('sha256'),
  // E-017 object storage: mock (memory) or any S3-compatible service (ArvanCloud in production, SeaweedFS locally).
  STORAGE_PROVIDER: z.enum(['mock', 's3']).default('mock'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_REGION: z.string().default('default'),
  /** Media (images, PDFs) in S3 too. Off = local disk as before. */
  S3_MEDIA: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
})

export type Env = z.infer<typeof schema>

let cached: Env | undefined

/** Validated environment. Throws with a clear message when config is missing. */
export function env(): Env {
  if (cached) return cached
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  cached = parsed.data
  return cached
}
