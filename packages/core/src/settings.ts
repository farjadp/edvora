/**
 * Settings hub rules (E-047, ADR 019). Pure: which sections exist, who may open them, how form input is validated,
 * how message templates render, how a write-only secret input is interpreted, and which uploads are accepted.
 * No node:crypto here, so client components may import `@edvora/core/settings` (sealing is in settingsSecrets.ts).
 */
import { z } from 'zod'
import { satisfies } from './permissions'

// ---------------------------------------------------------------- Sections

export type SettingsScope = 'academy' | 'platform'
export type SettingsGroup = 'academy' | 'site' | 'messages' | 'integrations' | 'modules' | 'people' | 'platform'

export const SETTINGS_GROUP_LABELS: Record<SettingsGroup, string> = {
  academy: 'آکادمی',
  site: 'سایت',
  messages: 'پیام‌ها',
  integrations: 'سرویس‌های بیرونی',
  modules: 'ماژول‌ها',
  people: 'اعضا و دسترسی',
  platform: 'پلتفرم ادورا',
}

/** Sections whose form is built into the hub (the app's registry adds link sections for other modules). */
export const BUILT_IN_SECTIONS = [
  'identity',
  'appearance',
  'contact',
  'seo',
  'homepage',
  'certificates',
  'notifications',
  'login',
  'features',
  'legal',
  'integrations',
  'platform-providers',
  'platform-academies',
] as const
export type BuiltInSection = (typeof BUILT_IN_SECTIONS)[number]

export const isBuiltInSection = (v: unknown): v is BuiltInSection => typeof v === 'string' && (BUILT_IN_SECTIONS as readonly string[]).includes(v)

/** `null` permission = platform admins only. */
export const SECTION_PERMISSION: Record<BuiltInSection, string | null> = {
  identity: 'settings.edit',
  appearance: 'settings.edit',
  contact: 'settings.edit',
  seo: 'settings.edit',
  homepage: 'settings.edit',
  certificates: 'settings.edit',
  login: 'settings.edit',
  features: 'settings.edit',
  legal: 'settings.edit',
  notifications: 'templates.edit',
  integrations: 'settings.integrations',
  'platform-providers': null,
  'platform-academies': null,
}

export type SettingsViewer = { isPlatformAdmin: boolean; permissions: readonly string[] }

/**
 * Default deny. A platform-scope section (`permission: null`) is for platform admins only; an academy section needs
 * the permission in THAT academy (the caller passes that academy's permissions). Platform admins open everything.
 */
export function canOpenSettings(who: SettingsViewer, permission: string | null): boolean {
  if (who.isPlatformAdmin) return true
  if (permission === null || permission === '') return false
  return who.permissions.some((p) => satisfies(p, permission))
}

// ---------------------------------------------------------------- Field validation

const HEX = /^#[0-9a-fA-F]{6}$/
const trimmed = (max: number) => z.string().trim().max(max)
const optionalText = (max: number) => trimmed(max).optional().transform((v) => (v ? v : null))
export const hexColour = z.string().trim().regex(HEX, 'رنگ را به شکل #1A56DB بنویسید')
/** https only; no javascript:, data: or http: links on a public page. */
export const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    try {
      return new URL(v).protocol === 'https:'
    } catch {
      return false
    }
  }, 'نشانی باید با https:// شروع شود')
const optionalHttpsUrl = z.union([z.literal('').transform(() => null), httpsUrl])
/** A bare host name (no scheme, path or port). */
export const domainName = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$|^[a-z0-9-]+\.localhost$/, 'دامنه را بدون http و / بنویسید، مثل academy.ir')

export const FONT_DISPLAY = [
  { value: 'morabba', fa: 'مُربا (پیش‌فرض نمایشی)' },
  { value: 'vazirmatn', fa: 'وزیرمتن' },
] as const
export const FONT_BODY = [{ value: 'vazirmatn', fa: 'وزیرمتن' }] as const

export const SOCIAL_PLATFORMS = [
  { value: 'instagram', fa: 'اینستاگرام' },
  { value: 'telegram', fa: 'تلگرام' },
  { value: 'linkedin', fa: 'لینکدین' },
  { value: 'youtube', fa: 'یوتیوب' },
  { value: 'aparat', fa: 'آپارات' },
  { value: 'x', fa: 'ایکس' },
  { value: 'whatsapp', fa: 'واتس‌اپ' },
  { value: 'eitaa', fa: 'ایتا' },
  { value: 'bale', fa: 'بله' },
  { value: 'website', fa: 'وب‌سایت' },
] as const
const socialValues = SOCIAL_PLATFORMS.map((s) => s.value) as [string, ...string[]]

/** Public-site switches an academy can turn on or off itself (plan modules stay platform-only). */
export const SITE_TOGGLES = [
  { key: 'journal', fa: 'مجله', help: 'صفحهٔ /journal و پیوندش در منو' },
  { key: 'faculty', fa: 'اساتید', help: 'صفحهٔ /faculty و پیوندش در منو' },
  { key: 'verify', fa: 'استعلام گواهی در منو', help: 'فقط پیوند منو؛ خود صفحهٔ /verify همیشه باز است چون کد QR گواهی‌های چاپ‌شده به آن می‌رسد' },
  { key: 'leadForm', fa: 'فرم درخواست مشاوره', help: 'فرم تماس در صفحهٔ دوره‌ها' },
] as const
export type SiteToggle = (typeof SITE_TOGGLES)[number]['key']

const checkbox = z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean())

export const SECTION_SCHEMAS = {
  identity: z.object({
    name: trimmed(120).min(2, 'نام آکادمی دست‌کم دو حرف است'),
    tagline: optionalText(200),
  }),
  appearance: z.object({
    primaryColor: hexColour,
    accentColor: hexColour,
    defaultTheme: z.enum(['light', 'dark']),
    fontDisplay: z.enum(['morabba', 'vazirmatn']),
  }),
  contact: z.object({
    phone: optionalText(40),
    email: z.union([z.literal('').transform(() => null), z.string().trim().email('ایمیل درست نیست').max(200)]),
    address: optionalText(300),
    social: z
      .array(z.object({ platform: z.enum(socialValues), url: httpsUrl }))
      .max(12),
  }),
  seo: z.object({
    titleSuffix: optionalText(80),
    description: optionalText(300),
    keywords: optionalText(300),
    noindex: checkbox,
  }),
  homepage: z.object({
    noticeEnabled: checkbox,
    noticeText: optionalText(200),
    services: z.array(z.object({ title: trimmed(120).min(1), text: optionalText(600) })).max(12),
    stats: z.array(z.object({ value: trimmed(30).min(1), label: trimmed(80).min(1) })).max(8),
    clientLogos: z.array(z.object({ name: trimmed(80).min(1) })).max(40),
  }),
  certificates: z.object({
    certificatePrefix: z.string().trim().toUpperCase().regex(/^[A-Z]{2,6}$/, 'دو تا شش حرف بزرگ لاتین'),
    signerName: optionalText(120),
    signerTitle: optionalText(120),
  }),
  login: z.object({
    title: optionalText(120),
    subtitle: optionalText(300),
    help: optionalText(300),
  }),
  features: z.object({
    journal: checkbox,
    faculty: checkbox,
    verify: checkbox,
    leadForm: checkbox,
    gamificationEnabled: checkbox,
  }),
  legal: z.object({
    terms: z.coerce.number().int().positive().nullable(),
    privacy: z.coerce.number().int().positive().nullable(),
    refund: z.coerce.number().int().positive().nullable(),
  }),
} as const

export type SectionInput<K extends keyof typeof SECTION_SCHEMAS> = z.infer<(typeof SECTION_SCHEMAS)[K]>

/** First validation message of a failed parse, for the `?error=` banner. */
export function firstIssue(err: z.ZodError): string {
  const i = err.issues[0]
  return i ? i.message : 'ورودی نادرست است'
}

// ---------------------------------------------------------------- Message templates

export const MESSAGE_EVENTS = [
  { key: 'otp', fa: 'کد ورود', vars: ['code', 'academy'] },
  { key: 'lead.received', fa: 'دریافت درخواست مشاوره', vars: ['name', 'course', 'academy'] },
  { key: 'payment.received', fa: 'پرداخت موفق', vars: ['name', 'amount', 'course', 'academy'] },
  { key: 'instalment.due', fa: 'یادآوری قسط', vars: ['name', 'amount', 'dueDate', 'course', 'academy'] },
  { key: 'enrolment.confirmed', fa: 'تأیید ثبت‌نام', vars: ['name', 'course', 'academy'] },
  { key: 'live.reminder', fa: 'یادآوری کلاس زنده', vars: ['name', 'course', 'startsAt', 'link', 'academy'] },
  { key: 'certificate.issued', fa: 'صدور گواهی', vars: ['name', 'course', 'code', 'link', 'academy'] },
] as const
export type MessageEvent = (typeof MESSAGE_EVENTS)[number]['key']
export type MessageChannel = 'sms' | 'email'

export const VARIABLE_LABELS: Record<string, string> = {
  code: 'کد',
  academy: 'نام آکادمی',
  name: 'نام گیرنده',
  course: 'نام دوره',
  amount: 'مبلغ (تومان)',
  dueDate: 'تاریخ سررسید',
  startsAt: 'زمان شروع',
  link: 'پیوند',
}

const VAR = /\{\{\s*([a-zA-Z]+)\s*\}\}/g
export const isMessageEvent = (v: unknown): v is MessageEvent => typeof v === 'string' && MESSAGE_EVENTS.some((e) => e.key === v)

/** Variables used in `body` that the event does not offer (empty = valid). */
export function unknownVariables(event: MessageEvent, body: string): string[] {
  const allowed = new Set<string>(MESSAGE_EVENTS.find((e) => e.key === event)?.vars ?? [])
  const bad = new Set<string>()
  for (const m of body.matchAll(VAR)) if (!allowed.has(m[1]!)) bad.add(m[1]!)
  return [...bad]
}

/** `{{name}}` → value. Unknown or missing variables render as empty text, never as the raw braces. */
export function renderTemplate(body: string, vars: Partial<Record<string, string | number>>): string {
  return body.replace(VAR, (_, k: string) => (vars[k] === undefined || vars[k] === null ? '' : String(vars[k])))
}

export const messageTemplateSchema = z
  .object({
    event: z.enum(MESSAGE_EVENTS.map((e) => e.key) as [MessageEvent, ...MessageEvent[]]),
    channel: z.enum(['sms', 'email']),
    enabled: checkbox,
    subject: optionalText(150),
    body: trimmed(1000),
  })
  .superRefine((t, ctx) => {
    if (t.enabled && !t.body) ctx.addIssue({ code: 'custom', path: ['body'], message: 'متن پیام روشن خالی است' })
    if (t.channel === 'sms' && t.body.length > 480) ctx.addIssue({ code: 'custom', path: ['body'], message: 'پیامک حداکثر ۴۸۰ نویسه' })
    const bad = unknownVariables(t.event, t.body + (t.subject ?? ''))
    if (bad.length) ctx.addIssue({ code: 'custom', path: ['body'], message: `متغیر ناشناخته: ${bad.join('، ')}` })
  })
export type MessageTemplate = z.infer<typeof messageTemplateSchema>

// ---------------------------------------------------------------- Integrations

export const INTEGRATION_KINDS = ['sms', 'email', 'live'] as const
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number]
export const isIntegrationKind = (v: unknown): v is IntegrationKind => typeof v === 'string' && (INTEGRATION_KINDS as readonly string[]).includes(v)

export const INTEGRATION_PROVIDERS: Record<IntegrationKind, readonly { value: string; fa: string }[]> = {
  sms: [
    { value: 'mock', fa: 'آزمایشی (بدون ارسال واقعی)' },
    { value: 'kavenegar', fa: 'کاوه‌نگار' },
  ],
  email: [
    { value: 'mock', fa: 'آزمایشی (بدون ارسال واقعی)' },
    { value: 'smtp', fa: 'SMTP' },
  ],
  live: [
    { value: 'mock', fa: 'آزمایشی' },
    { value: 'bigbluebutton', fa: 'BigBlueButton' },
  ],
}

export const INTEGRATION_LABELS: Record<IntegrationKind, { fa: string; secret: string; help: string }> = {
  sms: { fa: 'پیامک', secret: 'کلید API', help: 'کد ورود و پیام‌های آکادمی با حساب پیامک خود آکادمی فرستاده می‌شود.' },
  email: { fa: 'ایمیل', secret: 'رمز SMTP', help: 'سرور ارسال ایمیل آکادمی. فعلاً فقط ذخیره و آزموده می‌شود؛ ارسال ایمیل در ماژول اعلان‌ها می‌آید.' },
  live: { fa: 'کلاس زنده', secret: 'رمز مشترک (shared secret)', help: 'سرور BigBlueButton خود آکادمی. خالی = سرور مشترک ادورا.' },
}

const port = z.coerce.number().int().min(1).max(65535)
const sender = z.string().trim().regex(/^[0-9+]{3,20}$/, 'شمارهٔ خط فقط رقم است')

/** Non-secret provider config per kind and provider. The secret never goes through these schemas. */
export function integrationConfigSchema(kind: IntegrationKind, provider: string) {
  if (provider === 'mock') return z.object({})
  if (kind === 'sms' && provider === 'kavenegar') return z.object({ sender: z.union([z.literal('').transform(() => null), sender]), otpTemplate: optionalText(60) })
  if (kind === 'email' && provider === 'smtp')
    return z.object({
      host: z.string().trim().min(3).max(200).regex(/^[a-zA-Z0-9.-]+$/, 'نام سرور SMTP درست نیست'),
      port,
      secure: checkbox,
      username: optionalText(200),
      fromEmail: z.string().trim().email('ایمیل فرستنده درست نیست'),
      fromName: optionalText(120),
    })
  if (kind === 'live' && provider === 'bigbluebutton') return z.object({ baseUrl: httpsUrl, checksum: z.enum(['sha1', 'sha256', 'sha512']).default('sha256') })
  return null
}

export function isKnownProvider(kind: IntegrationKind, provider: string): boolean {
  return INTEGRATION_PROVIDERS[kind].some((p) => p.value === provider)
}

/** Providers that need a secret before they can be switched on. */
export const needsSecret = (provider: string) => provider !== 'mock'

/**
 * A write-only secret field. The form never receives the stored value, so:
 *  - empty input and no "remove" tick → keep what is stored;
 *  - "remove" ticked → clear (wins over a typed value, so a slip never stores half a key);
 *  - otherwise → store the new value.
 */
export type SecretInput = { value?: string | null; clear?: boolean }
export type SecretDecision = { action: 'keep' } | { action: 'clear' } | { action: 'set'; value: string }

export function decideSecret(input: SecretInput): SecretDecision {
  if (input.clear) return { action: 'clear' }
  const v = (input.value ?? '').trim()
  if (!v) return { action: 'keep' }
  return { action: 'set', value: v }
}

/** What the audit log records for a secret: never the value. */
export function auditSecret(d: SecretDecision): string | null {
  return d.action === 'set' ? '[changed]' : d.action === 'clear' ? '[removed]' : null
}

/** Never put a secret in an error shown to staff: strip anything that looks like the key we just used. */
export function scrubSecret(message: string, secret: string | null | undefined): string {
  const s = (secret ?? '').trim()
  const clean = s.length >= 4 ? message.split(s).join('[secret]') : message
  return clean.slice(0, 200)
}

// ---------------------------------------------------------------- Uploads

export type UploadSlot = 'logo' | 'logoDark' | 'favicon' | 'ogImage' | 'signature' | 'clientLogo'
export type ImageKind = 'png' | 'jpeg' | 'webp' | 'gif' | 'ico' | 'svg'

export const UPLOAD_RULES: Record<UploadSlot, { maxBytes: number; types: readonly ImageKind[]; fa: string }> = {
  logo: { maxBytes: 1_000_000, types: ['png', 'jpeg', 'webp'], fa: 'لوگو (زمینهٔ روشن)' },
  logoDark: { maxBytes: 1_000_000, types: ['png', 'jpeg', 'webp'], fa: 'لوگو (زمینهٔ تیره)' },
  favicon: { maxBytes: 256_000, types: ['png', 'ico'], fa: 'نماد زبانه (favicon)' },
  ogImage: { maxBytes: 2_000_000, types: ['png', 'jpeg', 'webp'], fa: 'تصویر اشتراک‌گذاری (OG)' },
  signature: { maxBytes: 1_000_000, types: ['png', 'webp'], fa: 'تصویر امضا' },
  clientLogo: { maxBytes: 1_000_000, types: ['png', 'jpeg', 'webp'], fa: 'لوگوی برند همراه' },
}

export const MIME_OF: Record<ImageKind, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
}

/** File type from the first bytes, ignoring the name and the browser's claimed type. */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  const b = (i: number) => bytes[i] ?? -1
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'png'
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'jpeg'
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return 'webp'
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46) return 'gif'
  if (b(0) === 0x00 && b(1) === 0x00 && b(2) === 0x01 && b(3) === 0x00) return 'ico'
  const head = new TextDecoder().decode(bytes.slice(0, 512)).trimStart().toLowerCase()
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg')) || head.includes('<svg')) return 'svg'
  return null
}

export type UploadCheck = { ok: true; kind: ImageKind; mime: string } | { ok: false; reason: string }

export function checkUpload(slot: UploadSlot, bytes: Uint8Array): UploadCheck {
  const rule = UPLOAD_RULES[slot]
  if (bytes.length === 0) return { ok: false, reason: 'فایل خالی است' }
  if (bytes.length > rule.maxBytes) return { ok: false, reason: `${rule.fa}: حداکثر ${Math.round(rule.maxBytes / 1000)} کیلوبایت` }
  const kind = sniffImage(bytes)
  if (kind === 'svg') return { ok: false, reason: 'فایل SVG پذیرفته نمی‌شود (ممکن است اسکریپت داشته باشد). PNG یا WebP بفرستید.' }
  if (!kind || !rule.types.includes(kind)) return { ok: false, reason: `${rule.fa}: فقط ${rule.types.map((t) => t.toUpperCase()).join('، ')}` }
  return { ok: true, kind, mime: MIME_OF[kind] }
}

// ---------------------------------------------------------------- Platform

export const STAFF_2FA_POLICIES = [
  { value: 'env', fa: 'طبق متغیر محیطی STAFF_2FA_REQUIRED' },
  { value: 'required', fa: 'برای همهٔ کارکنان اجباری' },
  { value: 'optional', fa: 'اختیاری (هر نقش خودش تعیین می‌کند)' },
] as const
export type Staff2faPolicy = (typeof STAFF_2FA_POLICIES)[number]['value']

/** The platform policy wins; `env` (or no policy saved yet) falls back to the env flag. */
export function staff2faRequiredBy(policy: string | null | undefined, envFlag: string | undefined): boolean {
  if (policy === 'required') return true
  if (policy === 'optional') return false
  return envFlag === 'true'
}

export const PLAN_LIMITS = ['maxStudents', 'maxStaff', 'maxCourses', 'storageMb'] as const
export type PlanLimit = (typeof PLAN_LIMITS)[number]
export const PLAN_LIMIT_LABELS: Record<PlanLimit, string> = {
  maxStudents: 'حداکثر دانشجو',
  maxStaff: 'حداکثر کارکنان',
  maxCourses: 'حداکثر دوره',
  storageMb: 'فضای ذخیره (مگابایت)',
}
const limit = z.union([z.literal('').transform(() => null), z.coerce.number().int().min(0).max(10_000_000)])
export const academyPlatformSchema = z.object({
  plan: z.enum(['starter', 'growth', 'pro']),
  domains: z.array(domainName).max(10),
  maxStudents: limit,
  maxStaff: limit,
  maxCourses: limit,
  storageMb: limit,
  features: z.array(z.enum(['site', 'lms', 'payments', 'crm', 'certificates', 'live', 'consulting', 'b2b'])).max(8),
})

/** Is an academy override allowed for this kind? Default: yes (each academy may bring its own provider). */
export function academyOverrideAllowed(allow: Partial<Record<IntegrationKind, boolean | null>> | null | undefined, kind: IntegrationKind): boolean {
  const v = allow?.[kind]
  return v === undefined || v === null ? true : v
}
