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
