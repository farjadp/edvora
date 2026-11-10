import { z } from 'zod'

/** `KEY=` in a copied .env.example means "not set", not "an empty value to validate". */
const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)
const optionalUrl = z.preprocess(blank, z.string().url().optional())
const optionalText = z.preprocess(blank, z.string().optional())

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
  // E-045 (ADR 017). Sealing key for gateway credentials; falls back to PAYLOAD_SECRET. Set a dedicated one in production.
  PAYMENT_SECRETS_KEY: optionalText,
  PAYMENT_RECEIPTS_DIR: optionalText,
  // USDT on-chain verification. mock = deterministic (tests, demo). Default: mock when PAYMENT_PROVIDER=mock.
  CHAIN_VERIFIER: z.preprocess(blank, z.enum(['mock', 'live']).optional()),
  TRONGRID_API_URL: z.preprocess(blank, z.string().url().default('https://api.trongrid.io')),
  TRONGRID_TESTNET_API_URL: z.preprocess(blank, z.string().url().default('https://nile.trongrid.io')),
  TRONGRID_API_KEY: optionalText,
  BSC_API_URL: z.preprocess(blank, z.string().url().default('https://api.etherscan.io/v2/api?chainid=56')),
  BSC_TESTNET_API_URL: z.preprocess(blank, z.string().url().default('https://api.etherscan.io/v2/api?chainid=97')),
  BSC_API_KEY: optionalText,
  /** Testnet USDT contracts for sandbox mode (no default: testnets have many look-alike tokens). */
  USDT_TRC20_TESTNET_CONTRACT: optionalText,
  USDT_BEP20_TESTNET_CONTRACT: optionalText,
  SMS_PROVIDER: z.enum(['mock', 'kavenegar']).default('mock'),
  KAVENEGAR_API_KEY: z.string().optional(),
  KAVENEGAR_SENDER: z.string().optional(),
  KAVENEGAR_OTP_TEMPLATE: z.string().default('verify'),
  // E-016 (ADR 020) SMS reminders worker. Kill switch: anything but `true` = the worker sends nothing.
  SMS_REMINDERS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v?.trim() === 'true'),
  /** Bearer secret for POST /api/cron/reminders (≥ 24 chars). Unset = the route answers 404. */
  REMINDERS_CRON_SECRET: optionalText,
  /** Test-only: lets the cron call pass `now` and `tenant` (e2e). Never true on a public deployment. */
  REMINDERS_E2E_HOOKS: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  // E-033 live classes (ADR 012). One BBB server per Edvora instance, shared by its academies.
  LIVE_CLASS_PROVIDER: z.preprocess(blank, z.enum(['mock', 'bigbluebutton']).default('mock')),
  LIVE_CLASS_MOCK_SECRET: optionalText,
  BBB_URL: optionalUrl,
  BBB_SECRET: optionalText,
  BBB_CHECKSUM: z.preprocess(blank, z.enum(['sha1', 'sha256', 'sha512']).default('sha256')),
  // E-017 object storage: mock (memory) or any S3-compatible service (ArvanCloud in production, SeaweedFS locally).
  STORAGE_PROVIDER: z.preprocess(blank, z.enum(['mock', 's3']).default('mock')),
  S3_ENDPOINT: optionalUrl,
  S3_BUCKET: optionalText,
  S3_ACCESS_KEY_ID: optionalText,
  S3_SECRET_ACCESS_KEY: optionalText,
  S3_REGION: z.preprocess(blank, z.string().default('default')),
  /** Media (images, PDFs) in S3 too. Off = local disk as before. */
  S3_MEDIA: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
}).superRefine((e, ctx) => {
  // Real providers need their settings; the mocks need nothing (CI and local dev run on mocks).
  const need = (when: boolean, keys: (keyof typeof e)[], why: string) => {
    if (!when) return
    for (const k of keys) if (!e[k]) ctx.addIssue({ code: 'custom', path: [k], message: `required when ${why}` })
  }
  need(e.LIVE_CLASS_PROVIDER === 'bigbluebutton', ['BBB_URL', 'BBB_SECRET'], 'LIVE_CLASS_PROVIDER=bigbluebutton')
  need(e.STORAGE_PROVIDER === 's3', ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'], 'STORAGE_PROVIDER=s3')
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
