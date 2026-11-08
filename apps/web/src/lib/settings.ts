import 'server-only'
import { activeMemberships, can, isPlatformAdmin, sandboxIntegrationViolations, type AccessContext } from '@edvora/core'
import {
  INTEGRATION_KINDS,
  MESSAGE_EVENTS,
  SECTION_SCHEMAS,
  academyOverrideAllowed,
  academyPlatformSchema,
  auditSecret,
  canOpenSettings,
  checkUpload,
  decideSecret,
  firstIssue,
  integrationConfigSchema,
  isKnownProvider,
  messageTemplateSchema,
  needsSecret,
  scrubSecret,
  type IntegrationKind,
  type MessageTemplate,
  type SettingsViewer,
  type UploadSlot,
} from '@edvora/core/settings'
import { openSettingSecret, sealSettingSecret, settingsServerKey } from '@edvora/core/settings-secrets'
import { checkConnection, type ConnectionCheck, type ConnectionResult } from '@edvora/integrations/connection'
import { colourChecks, isHex, suggestAccent, suggestBrand } from '@edvora/ui/color'
import { createLocalReq, type Payload, type PayloadRequest, type TypedUser } from 'payload'
import { asSystem, getAccess } from '../access/permissions'
import { diff, writeAudit, type Changes } from '../hooks/audit'
import type { Media, Tenant } from '../payload-types'
import { idOf } from './ids'
import { loadPlatformSettings, rememberPlatformSettings, type PlatformSettingsDoc } from './platformSettings'
import { hubPermissions, sectionByKey } from './settingsRegistry'

/**
 * Settings hub server side (E-047, ADR 019). Every function takes the actor and an explicit academy id and checks
 * the section's permission IN THAT academy with the full access engine (`can`: membership status, expiry, 2FA,
 * role security rules). Writes run as system writes (no generic hooks) and write their own audit row.
 */

export type SettingsActor = { user: TypedUser; req: PayloadRequest; ctx: AccessContext }

export async function getSettingsActor(payload: Payload, headers: Headers): Promise<SettingsActor | null> {
  const { user } = await payload.auth({ headers })
  if (!user || user.collection !== 'users') return null
  const req = await createLocalReq({ user }, payload)
  const ctx = await getAccess(req)
  return ctx ? { user, req, ctx } : null
}

export const isPlatform = (a: SettingsActor) => isPlatformAdmin(a.ctx)

/** What this person may do in one academy, for the hub's permission rules. */
export function viewerIn(a: SettingsActor, tenantId: number | null): SettingsViewer {
  const platform = isPlatform(a)
  if (tenantId === null) return { isPlatformAdmin: platform, permissions: [] }
  return { isPlatformAdmin: platform, permissions: hubPermissions().filter((p) => can(a.ctx, tenantId, p)) }
}

/** Academies where the person may open at least one hub section ('all' for platform admins). */
export function settingsAcademies(a: SettingsActor): number[] | 'all' {
  if (isPlatform(a)) return 'all'
  const ids = [...new Set(activeMemberships(a.ctx).map((m) => Number(m.tenantId)))]
  return ids.filter((t) => viewerIn(a, t).permissions.length > 0)
}

/** The academy being edited: asked (query/form) → selected in the admin → the person's only academy. */
export function pickAcademy(a: SettingsActor, asked: number | null, selected: number | null): number | null {
  const mine = settingsAcademies(a)
  const allowed = (t: number) => mine === 'all' || mine.includes(t)
  if (asked !== null) return allowed(asked) ? asked : null
  if (selected !== null && allowed(selected)) return selected
  return mine !== 'all' && mine.length === 1 ? mine[0]! : null
}

export function canOpen(a: SettingsActor, tenantId: number | null, sectionKey: string): boolean {
  const s = sectionByKey(sectionKey)
  if (!s) return false
  if (s.scope === 'platform') return isPlatform(a)
  return tenantId !== null && canOpenSettings(viewerIn(a, tenantId), s.permission)
}

export async function loadTenant(payload: Payload, id: number): Promise<Tenant | null> {
  try {
    return await payload.findByID({ collection: 'tenants', id, depth: 1, overrideAccess: true })
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- Form helpers

const str = (fd: FormData, k: string) => {
  const v = fd.get(k)
  return typeof v === 'string' ? v : ''
}

/** Rows posted as `prefix.<i>.<field>`; rows whose fields are all empty are dropped. */
function rows(fd: FormData, prefix: string, fields: readonly string[]): { index: number; values: Record<string, string> }[] {
  const idx = new Set<number>()
  for (const k of fd.keys()) {
    const m = new RegExp(`^${prefix}\\.(\\d+)\\.`).exec(k)
    if (m) idx.add(Number(m[1]))
  }
  return [...idx]
    .sort((x, y) => x - y)
    .slice(0, 50)
    .map((i) => ({ index: i, values: Object.fromEntries(fields.map((f) => [f, str(fd, `${prefix}.${i}.${f}`).trim()])) }))
    .filter((r) => Object.values(r.values).some(Boolean))
}

const fileOf = (fd: FormData, k: string): File | null => {
  const v = fd.get(k)
  return v && typeof v === 'object' && 'arrayBuffer' in v && (v as File).size > 0 ? (v as File) : null
}

export type SaveResult = { ok: true; notice?: string } | { ok: false; error: string }

async function uploadImage(a: SettingsActor, tenantId: number, slot: UploadSlot, file: File, alt: string): Promise<{ id: number } | { error: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const check = checkUpload(slot, bytes)
  if (!check.ok) return { error: check.reason }
  const ext = check.kind === 'jpeg' ? 'jpg' : check.kind
  const doc = await a.req.payload.create({
    collection: 'media',
    overrideAccess: true,
    req: a.req,
    data: { tenant: tenantId, alt: alt.slice(0, 200) || slot },
    file: { data: Buffer.from(bytes), mimetype: check.mime, name: `${slot}-${tenantId}-${Date.now()}.${ext}`, size: bytes.length },
  })
  return { id: doc.id }
}

const mediaId = (v: unknown): number | null => idOf(v)

/** Update the academy as a system write and log `settings.<section>` with the field diff. */
async function updateTenant(a: SettingsActor, tenantId: number, section: string, data: Record<string, unknown>, extra: Changes = {}): Promise<SaveResult> {
  const before = (await a.req.payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, overrideAccess: true, req: a.req })) as unknown as Record<string, unknown>
  const after = (await asSystem(a.req, () =>
    a.req.payload.update({ collection: 'tenants', id: tenantId, data: data as never, depth: 0, overrideAccess: true, req: a.req }),
  )) as unknown as Record<string, unknown>
  const picked = Object.fromEntries(Object.keys(data).map((k) => [k, before[k]]))
  const changes = { ...diff(picked, Object.fromEntries(Object.keys(data).map((k) => [k, after[k]]))), ...extra }
  if (Object.keys(changes).length) await writeAudit(a.req, { tenants: [tenantId], action: `settings.${section}`, collection: 'tenants', docId: tenantId, changes })
  return { ok: true }
}

// ---------------------------------------------------------------- Academy sections

type Saver = (a: SettingsActor, tenantId: number, fd: FormData) => Promise<SaveResult>

const identity: Saver = async (a, t, fd) => {
  const p = SECTION_SCHEMAS.identity.safeParse({ name: str(fd, 'name'), tagline: str(fd, 'tagline') })
  if (!p.success) return { ok: false, error: firstIssue(p.error) }
  const data: Record<string, unknown> = { name: p.data.name, tagline: p.data.tagline }
  for (const slot of ['logo', 'logoDark', 'favicon', 'ogImage'] as const) {
    const f = fileOf(fd, slot)
    if (f) {
      const up = await uploadImage(a, t, slot, f, `${p.data.name} — ${slot}`)
      if ('error' in up) return { ok: false, error: up.error }
      data[slot] = up.id
    } else if (str(fd, `${slot}.remove`) === 'on') data[slot] = null
  }
  return updateTenant(a, t, 'identity', data)
}

const appearance: Saver = async (a, t, fd) => {
  const p = SECTION_SCHEMAS.appearance.safeParse({
    primaryColor: str(fd, 'primaryColor'),
    accentColor: str(fd, 'accentColor'),
    defaultTheme: str(fd, 'defaultTheme'),
    fontDisplay: str(fd, 'fontDisplay'),
  })
  if (!p.success) return { ok: false, error: firstIssue(p.error) }
  const brand = p.data.primaryColor.toLowerCase()
  const accent = p.data.accentColor.toLowerCase()
  if (!isHex(brand) || !isHex(accent)) return { ok: false, error: 'رنگ نادرست است' }
  const failed = colourChecks(brand, accent).filter((c) => !c.pass)
  if (failed.length) {
    return { ok: false, error: `کنتراست کافی نیست (${failed.map((f) => f.label).join('، ')}). پیشنهاد: رنگ اصلی ${suggestBrand(brand)} و تأکیدی ${suggestAccent(accent)}` }
  }
  return updateTenant(a, t, 'appearance', { primaryColor: brand.toUpperCase(), accentColor: accent.toUpperCase(), defaultTheme: p.data.defaultTheme, fontDisplay: p.data.fontDisplay })
}

const contact: Saver = async (a, t, fd) => {
  // A row counts only when it has a URL (the platform select always has a value).
  const social = rows(fd, 'social', ['platform', 'url']).map((r) => r.values).filter((v) => v.url)
  const p = SECTION_SCHEMAS.contact.safeParse({ phone: str(fd, 'phone'), email: str(fd, 'email'), address: str(fd, 'address'), social })
  if (!p.success) return { ok: false, error: firstIssue(p.error) }
  return updateTenant(a, t, 'contact', { contact: { phone: p.data.phone, email: p.data.email, address: p.data.address, social: p.data.social } })
}

const seo: Saver = async (a, t, fd) => {
  const p = SECTION_SCHEMAS.seo.safeParse({ titleSuffix: str(fd, 'titleSuffix'), description: str(fd, 'description'), keywords: str(fd, 'keywords'), noindex: str(fd, 'noindex') })
  if (!p.success) return { ok: false, error: firstIssue(p.error) }
  return updateTenant(a, t, 'seo', { seo: p.data })
}

const homepage: Saver = async (a, t, fd) => {
  const services = rows(fd, 'services', ['title', 'text']).map((r) => r.values)
  const stats = rows(fd, 'stats', ['value', 'label']).map((r) => r.values)
  const logoRows = rows(fd, 'clientLogos', ['name', 'logo'])
  const p = SECTION_SCHEMAS.homepage.safeParse({
    noticeEnabled: str(fd, 'noticeEnabled'),
    noticeText: str(fd, 'noticeText'),
    services,
    stats,
    clientLogos: logoRows.map((r) => ({ name: r.values.name })),
  })
  if (!p.success) return { ok: false, error: firstIssue(p.error) }
  if (p.data.noticeEnabled && !p.data.noticeText) return { ok: false, error: 'متن نوار اطلاع‌رسانی خالی است' }
  const clientLogos: { name: string; logo: number | null }[] = []
  for (const r of logoRows) {
    const f = fileOf(fd, `clientLogos.${r.index}.file`)
    let logo = Number(r.values.logo) || null
    if (f) {
      const up = await uploadImage(a, t, 'clientLogo', f, r.values.name)
      if ('error' in up) return { ok: false, error: up.error }
      logo = up.id
    }
    // A kept logo id must be one of this academy's media (never another academy's file).
    if (logo && !f) {
      const m = await a.req.payload.findByID({ collection: 'media', id: logo, depth: 0, overrideAccess: true, disableErrors: true })
      if (!m || idOf((m as { tenant?: unknown }).tenant) !== t) logo = null
    }
    clientLogos.push({ name: r.values.name, logo })
  }
  return updateTenant(a, t, 'homepage', {
    notice: { enabled: p.data.noticeEnabled, text: p.data.noticeText },
    services: p.data.services,
    stats: p.data.stats,
    clientLogos,
  })
}

const certificates: Saver = async (a, t, fd) => {
  const p = SECTION_SCHEMAS.certificates.safeParse({ certificatePrefix: str(fd, 'certificatePrefix'), signerName: str(fd, 'signerName'), signerTitle: str(fd, 'signerTitle') })
  if (!p.success) return { ok: false, error: firstIssue(p.error) }
  const current = await loadTenant(a.req.payload, t)
  let signature = mediaId(current?.certificateSigner?.signature)
  const f = fileOf(fd, 'signature')
  if (f) {
    const up = await uploadImage(a, t, 'signature', f, `امضای ${p.data.signerName ?? ''}`)
    if ('error' in up) return { ok: false, error: up.error }
    signature = up.id
  } else if (str(fd, 'signature.remove') === 'on') signature = null
  return updateTenant(a, t, 'certificates', { certificatePrefix: p.data.certificatePrefix, certificateSigner: { name: p.data.signerName, title: p.data.signerTitle, signature } })
}

const login: Saver = async (a, t, fd) => {
  const p = SECTION_SCHEMAS.login.safeParse({ title: str(fd, 'title'), subtitle: str(fd, 'subtitle'), help: str(fd, 'help') })
  if (!p.success) return { ok: false, error: firstIssue(p.error) }
  return updateTenant(a, t, 'login', { loginTexts: p.data })
}

const features: Saver = async (a, t, fd) => {
  const p = SECTION_SCHEMAS.features.safeParse({ journal: str(fd, 'journal'), faculty: str(fd, 'faculty'), verify: str(fd, 'verify'), leadForm: str(fd, 'leadForm'), gamificationEnabled: str(fd, 'gamificationEnabled') })
  if (!p.success) return { ok: false, error: firstIssue(p.error) }
  const current = await loadTenant(a.req.payload, t)
  const { gamificationEnabled, ...toggles } = p.data
  return updateTenant(a, t, 'features', { toggles, gamification: { ...(current?.gamification ?? {}), enabled: gamificationEnabled } })
}

const legal: Saver = async (a, t, fd) => {
  const pick = (k: string) => (str(fd, k) ? str(fd, k) : null)
  const p = SECTION_SCHEMAS.legal.safeParse({ terms: pick('terms'), privacy: pick('privacy'), refund: pick('refund') })
  if (!p.success) return { ok: false, error: firstIssue(p.error) }
  // Only this academy's pages.
  for (const id of Object.values(p.data)) {
    if (id === null) continue
    const page = await a.req.payload.findByID({ collection: 'pages', id, depth: 0, overrideAccess: true, disableErrors: true })
    if (!page || idOf((page as { tenant?: unknown }).tenant) !== t) return { ok: false, error: 'صفحهٔ انتخاب‌شده از این آکادمی نیست' }
  }
  return updateTenant(a, t, 'legal', { legal: p.data })
}

const notifications: Saver = async (a, t, fd) => {
  const out: MessageTemplate[] = []
  for (const e of MESSAGE_EVENTS) {
    for (const channel of ['sms', 'email'] as const) {
      const k = `t.${e.key}.${channel}`
      const raw = { event: e.key, channel, enabled: str(fd, `${k}.enabled`), subject: str(fd, `${k}.subject`), body: str(fd, `${k}.body`) }
      if (!raw.enabled && !raw.body.trim() && !raw.subject.trim()) continue
      const p = messageTemplateSchema.safeParse(raw)
      if (!p.success) return { ok: false, error: `${e.fa} (${channel === 'sms' ? 'پیامک' : 'ایمیل'}): ${firstIssue(p.error)}` }
      out.push(p.data)
    }
  }
  return updateTenant(a, t, 'notifications', { messageTemplates: out })
}

const ACADEMY_SAVERS: Record<string, Saver> = { identity, appearance, contact, seo, homepage, certificates, login, features, legal, notifications }

// ---------------------------------------------------------------- Integrations

export type IntegrationRow = {
  id: number
  kind: IntegrationKind
  provider: string
  enabled: boolean
  config: Record<string, unknown>
  hasSecret: boolean
  secretOpens: boolean
  secretSetAt: string | null
  lastTest: { ok?: boolean | null; at?: string | null; message?: string | null } | null
}

type RawIntegration = { id: number; kind: IntegrationKind; provider: string; enabled?: boolean | null; config?: unknown; secretSealed?: string | null; secretSetAt?: string | null; lastTest?: IntegrationRow['lastTest'] }

const serverKey = () => settingsServerKey({ SETTINGS_SECRETS_KEY: process.env.SETTINGS_SECRETS_KEY, PAYLOAD_SECRET: process.env.PAYLOAD_SECRET })

async function rawIntegration(payload: Payload, tenantId: number, kind: IntegrationKind): Promise<RawIntegration | null> {
  const res = await payload.find({
    collection: 'integration-settings',
    where: { and: [{ tenant: { equals: tenantId } }, { kind: { equals: kind } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })
  return (res.docs[0] as unknown as RawIntegration | undefined) ?? null
}

/** For the form: never the secret, only whether one is stored and opens. */
export async function loadIntegrations(payload: Payload, tenantId: number): Promise<Partial<Record<IntegrationKind, IntegrationRow>>> {
  const out: Partial<Record<IntegrationKind, IntegrationRow>> = {}
  for (const kind of INTEGRATION_KINDS) {
    const r = await rawIntegration(payload, tenantId, kind)
    if (!r) continue
    out[kind] = {
      id: r.id,
      kind,
      provider: r.provider,
      enabled: Boolean(r.enabled),
      config: (r.config && typeof r.config === 'object' ? r.config : {}) as Record<string, unknown>,
      hasSecret: Boolean(r.secretSealed),
      secretOpens: Boolean(r.secretSealed && openSettingSecret(r.secretSealed, { tenantId, kind }, serverKey())),
      secretSetAt: r.secretSetAt ?? null,
      lastTest: r.lastTest ?? null,
    }
  }
  return out
}

/** The academy's own provider when it is on, keyed, allowed by the platform and opens; else null (use env). */
export async function academyProvider(payload: Payload, tenantId: number, kind: IntegrationKind): Promise<{ provider: string; config: Record<string, unknown>; secret: string } | null> {
  // E-029 (ADR 013): a demo sandbox never uses an academy-level provider (SMS, email, live), whatever is stored.
  if (await isSandboxAcademy(payload, tenantId)) return null
  try {
    const platform = await loadPlatformSettings(payload)
    if (!academyOverrideAllowed(platform.academyProviders, kind)) return null
    const r = await rawIntegration(payload, tenantId, kind)
    if (!r?.enabled || r.provider === 'mock' || !r.secretSealed) return null
    const secret = openSettingSecret(r.secretSealed, { tenantId, kind }, serverKey())
    if (!secret) return null
    return { provider: r.provider, config: (r.config ?? {}) as Record<string, unknown>, secret }
  } catch (err) {
    payload.logger.error({ err, msg: `settings: academy ${kind} provider unavailable, using platform default` })
    return null
  }
}

function connectionInput(kind: IntegrationKind, provider: string, config: Record<string, unknown>, secret: string): ConnectionCheck | null {
  if (provider === 'mock') return { kind, provider: 'mock' } as ConnectionCheck
  if (kind === 'sms' && provider === 'kavenegar') return { kind, provider, secret }
  if (kind === 'email' && provider === 'smtp') return { kind, provider, host: String(config.host ?? ''), port: Number(config.port ?? 0), secure: Boolean(config.secure) }
  if (kind === 'live' && provider === 'bigbluebutton') return { kind, provider, baseUrl: String(config.baseUrl ?? ''), secret, checksum: (config.checksum as 'sha256') ?? 'sha256' }
  return null
}

/** Dev and CI may test against local servers (mailpit, a local BBB); production refuses internal addresses. */
const connectionDeps = () => ({ allowPrivateHosts: process.env.NODE_ENV !== 'production' && process.env.SETTINGS_ALLOW_PRIVATE_HOSTS !== 'false' })

/** E-029: demo sandboxes (flag read from the DB). */
async function isSandboxAcademy(payload: Payload, tenantId: number): Promise<boolean> {
  const t = await payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, overrideAccess: true, disableErrors: true, select: { isSandbox: true } })
  return t?.isSandbox === true
}

async function saveIntegration(a: SettingsActor, t: number, fd: FormData): Promise<SaveResult> {
  const kind = str(fd, 'kind')
  if (!(INTEGRATION_KINDS as readonly string[]).includes(kind)) return { ok: false, error: 'نوع سرویس نامعتبر است' }
  const k = kind as IntegrationKind
  const provider = str(fd, 'provider')
  if (!isKnownProvider(k, provider)) return { ok: false, error: 'سرویس‌دهندهٔ نامعتبر' }
  const schema = integrationConfigSchema(k, provider)
  if (!schema) return { ok: false, error: 'سرویس‌دهندهٔ نامعتبر' }
  const cfgRaw = Object.fromEntries([...fd.keys()].filter((x) => x.startsWith('config.')).map((x) => [x.slice(7), str(fd, x)]))
  const parsed = schema.safeParse(cfgRaw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const config = parsed.data as Record<string, unknown>
  const decision = decideSecret({ value: str(fd, 'secret'), clear: str(fd, 'secret.clear') === 'on' })
  const enabled = str(fd, 'enabled') === 'on'
  const intent = str(fd, 'intent') === 'test' ? 'test' : 'save'

  // E-029 (ADR 013): a demo sandbox keeps the mock with nothing stored (403), and never tests a real connection.
  const sandbox = await isSandboxAcademy(a.req.payload, t)
  if (sandbox && sandboxIntegrationViolations({ provider, secret: decision.action === 'set' ? decision.value : '', config }).length) return { ok: false, error: 'forbidden' }

  const existing = await rawIntegration(a.req.payload, t, k)
  const sealed = decision.action === 'set' ? sealSettingSecret(decision.value, { tenantId: t, kind: k }, serverKey()) : decision.action === 'clear' ? null : (existing?.secretSealed ?? null)
  if (enabled && needsSecret(provider) && !sealed) return { ok: false, error: `برای روشن کردن، ${provider === 'smtp' ? 'رمز SMTP' : 'کلید'} را وارد کنید` }

  let lastTest: IntegrationRow['lastTest'] = existing?.lastTest ?? null
  let notice: string | undefined
  if (intent === 'test') {
    const secret = decision.action === 'set' ? decision.value : sealed ? (openSettingSecret(sealed, { tenantId: t, kind: k }, serverKey()) ?? '') : ''
    const input = connectionInput(k, provider, config, secret)
    let r: ConnectionResult = { ok: false, message: 'این سرویس آزمون اتصال ندارد' }
    if (sandbox) r = { ok: true, message: 'آکادمی آزمایشی: فقط سرویس آزمایشی؛ اتصالی برقرار نمی‌شود' }
    else if (input) {
      try {
        r = await checkConnection(input, connectionDeps())
      } catch {
        r = { ok: false, message: 'آزمون اتصال انجام نشد' }
      }
    }
    const message = scrubSecret(r.message, secret)
    lastTest = { ok: r.ok, at: new Date().toISOString(), message }
    notice = `${r.ok ? '✓' : '✗'} ${message}`
  }

  const data = {
    tenant: t,
    kind: k,
    provider,
    enabled,
    config,
    secretSealed: sealed,
    secretSetAt: decision.action === 'set' ? new Date().toISOString() : decision.action === 'clear' ? null : (existing?.secretSetAt ?? null),
    lastTest: lastTest ?? {},
  }
  await asSystem(a.req, async () => {
    if (existing) await a.req.payload.update({ collection: 'integration-settings', id: existing.id, data: data as never, overrideAccess: true, req: a.req })
    else await a.req.payload.create({ collection: 'integration-settings', data: data as never, overrideAccess: true, req: a.req })
  })
  const changes: Changes = diff(
    { provider: existing?.provider ?? null, enabled: Boolean(existing?.enabled), config: existing?.config ?? null },
    { provider, enabled, config },
  )
  const s = auditSecret(decision)
  if (s) changes.secret = { from: existing?.secretSealed ? '[set]' : null, to: s }
  if (intent === 'test') changes.test = { from: null, to: lastTest?.ok ? 'ok' : 'failed' }
  if (Object.keys(changes).length) await writeAudit(a.req, { tenants: [t], action: `settings.integrations.${k}`, collection: 'integration-settings', docId: existing?.id ?? 'new', changes })
  return { ok: true, notice }
}

// ---------------------------------------------------------------- Platform

async function savePlatformProviders(a: SettingsActor, fd: FormData): Promise<SaveResult> {
  const staff2fa = str(fd, 'staff2fa')
  if (!['env', 'required', 'optional'].includes(staff2fa)) return { ok: false, error: 'سیاست نامعتبر' }
  const academyProviders = Object.fromEntries(INTEGRATION_KINDS.map((k) => [k, str(fd, `allow.${k}`) === 'on']))
  const before = (await a.req.payload.findGlobal({ slug: 'platform-settings', depth: 0, overrideAccess: true })) as PlatformSettingsDoc
  const after = await asSystem(a.req, () => a.req.payload.updateGlobal({ slug: 'platform-settings', data: { staff2fa, academyProviders } as never, overrideAccess: true, req: a.req }))
  rememberPlatformSettings(after)
  const changes = diff({ staff2fa: before.staff2fa ?? null, academyProviders: before.academyProviders ?? null }, { staff2fa, academyProviders })
  // Platform changes are logged in every academy (each academy's admin should see who changed the rules above them).
  if (Object.keys(changes).length) {
    const all = await a.req.payload.find({ collection: 'tenants', depth: 0, limit: 500, pagination: false, overrideAccess: true, select: { name: true } })
    await writeAudit(a.req, { tenants: all.docs.map((d) => d.id), action: 'settings.platform', collection: 'platform-settings', docId: 'global', changes })
  }
  return { ok: true }
}

async function savePlatformAcademy(a: SettingsActor, fd: FormData): Promise<SaveResult> {
  const id = Number(str(fd, 'academyId'))
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'آکادمی نامعتبر' }
  const domains = str(fd, 'domains')
    .split(/[\s,،]+/)
    .map((d) => d.trim())
    .filter(Boolean)
  const p = academyPlatformSchema.safeParse({
    plan: str(fd, 'plan'),
    domains,
    maxStudents: str(fd, 'maxStudents'),
    maxStaff: str(fd, 'maxStaff'),
    maxCourses: str(fd, 'maxCourses'),
    storageMb: str(fd, 'storageMb'),
    features: fd.getAll('features').filter((x): x is string => typeof x === 'string'),
  })
  if (!p.success) return { ok: false, error: firstIssue(p.error) }
  // A domain may belong to one academy only (tenant resolution is by Host).
  for (const d of p.data.domains) {
    const taken = await a.req.payload.find({ collection: 'tenants', where: { and: [{ 'domains.domain': { equals: d } }, { id: { not_equals: id } }] }, limit: 1, depth: 0, overrideAccess: true })
    if (taken.docs.length) return { ok: false, error: `دامنهٔ ${d} مال آکادمی دیگری است` }
  }
  const { plan, maxStudents, maxStaff, maxCourses, storageMb, features } = p.data
  return updateTenant(a, id, 'platform-academy', { plan, domains: [...new Set(p.data.domains)].map((domain) => ({ domain })), limits: { maxStudents, maxStaff, maxCourses, storageMb }, features })
}

// ---------------------------------------------------------------- Entry point

/** One save from the hub. The caller resolved the actor; this checks the section permission in the academy. */
export async function saveSection(a: SettingsActor, section: string, tenantId: number | null, fd: FormData): Promise<SaveResult> {
  if (!canOpen(a, tenantId, section)) return { ok: false, error: 'forbidden' }
  try {
    if (section === 'platform-providers') return await savePlatformProviders(a, fd)
    if (section === 'platform-academies') return await savePlatformAcademy(a, fd)
    if (tenantId === null) return { ok: false, error: 'forbidden' }
    if (section === 'integrations') return await saveIntegration(a, tenantId, fd)
    const saver = ACADEMY_SAVERS[section]
    if (!saver) return { ok: false, error: 'forbidden' }
    return await saver(a, tenantId, fd)
  } catch (err) {
    a.req.payload.logger.error({ err, msg: `settings: save ${section} failed` })
    return { ok: false, error: 'ذخیره انجام نشد. دوباره تلاش کنید.' }
  }
}

/** Media URL of an upload field (populated at depth 1). */
export const mediaUrl = (v: unknown): string | null => (v && typeof v === 'object' && 'url' in v ? ((v as Media).url ?? null) : null)
