/**
 * Sandbox guards shared by collections (E-029, ADR 013). A sandbox is a tenant with `isSandbox = true`; its
 * accounts carry `users.sandboxTenant`. Flags are read from the DB (never from a token) and cached per request.
 */
import { clampMembershipExpiry, isPlatformHost, parseSandboxConfig, sandboxState, toPersianDigits, verifySandboxSelector, type SandboxConfig } from '@edvora/core'
import type { Access, CollectionBeforeChangeHook, CollectionBeforeOperationHook, PayloadRequest, Where } from 'payload'
import { APIError, parseCookies } from 'payload'
import { idOf } from '../lib/ids'
import { isSystemWrite } from './permissions'
import { isSuperAdmin } from './roles'

export type SandboxFlags = { id: number; isSandbox: boolean; expiresAt: string | null }

const CACHE_KEY = 'edvoraSandboxFlags'

export function sandboxConfig(): SandboxConfig {
  return parseSandboxConfig(process.env, process.env.NEXT_PUBLIC_SITE_URL)
}

/** Flags of one academy (null if it does not exist). Cached on req.context for the request. */
export async function tenantFlags(req: PayloadRequest, tenantId: number | null): Promise<SandboxFlags | null> {
  if (!tenantId) return null
  const cache = (req.context[CACHE_KEY] ??= {}) as Record<number, SandboxFlags | null>
  if (tenantId in cache) return cache[tenantId] ?? null
  const t = await req.payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, overrideAccess: true, disableErrors: true, req })
  const flags = t ? { id: t.id, isSandbox: t.isSandbox === true, expiresAt: t.expiresAt ?? null } : null
  cache[tenantId] = flags
  return flags
}

/** The sandbox an account belongs to, or null for a normal account. */
export const sandboxOfUser = (user: unknown): number | null =>
  user && typeof user === 'object' && 'sandboxTenant' in user ? idOf((user as { sandboxTenant?: unknown }).sandboxTenant) : null

/** Set by server code that already chose the sandbox (lib/sandbox/signin.ts) on its local `payload.login` call. */
export const SANDBOX_LOGIN_CONTEXT = 'edvoraSandboxLogin'

/**
 * The sandbox selected by the request's `edvora_sbx` cookie, on the platform host only (unexpired, signed). Same
 * cookie name and key as lib/sandbox/cookies.ts; duplicated here because collections must not import `server-only`
 * modules (the Payload CLI and seed load this file).
 */
export function selectedSandboxOf(req: PayloadRequest): number | null {
  const headers = req.headers
  const secret = process.env.SESSION_SECRET
  if (!headers || !secret) return null
  if (!isPlatformHost(headers.get('host') ?? '', sandboxConfig())) return null
  const token = parseCookies(headers).get('edvora_sbx')
  return verifySandboxSelector(token, `${secret}:sandbox`)?.tid ?? null
}

/**
 * Login guard (E1, BUG-2):
 *  - a sandbox account logs in only while its sandbox is active, and only inside that sandbox: either through our
 *    own sign-in code, or with that sandbox's valid selector cookie on the platform host. Not on academy domains;
 *  - a real account never logs in under a sandbox selector (leave the demo first).
 */
export async function assertSandboxLogin(req: PayloadRequest, user: unknown): Promise<void> {
  const own = sandboxOfUser(user)
  const trusted = req.context?.[SANDBOX_LOGIN_CONTEXT]
  if (own) {
    const flags = await tenantFlags(req, own)
    if (!flags || sandboxState(flags) !== 'active') throw new APIError('زمان آکادمی آزمایشی به پایان رسیده است.', 403)
    if (trusted === own) return
    if (selectedSandboxOf(req) !== own) throw new APIError('این حساب فقط از نشانی ورود آکادمی آزمایشی خودش وارد می‌شود.', 403)
    return
  }
  if (trusted === undefined && selectedSandboxOf(req) !== null) {
    throw new APIError('برای ورود به حساب واقعی، ابتدا از آکادمی آزمایشی خارج شوید.', 403)
  }
}

// ---------------------------------------------------------------- tenants: platform settings are off limits

/** Fields a sandbox account may never write (S4): routing, plan, modules, gateway, and the sandbox flags. */
export const SANDBOX_LOCKED_TENANT_FIELDS = ['slug', 'domains', 'plan', 'features', 'zarinpalMerchantId', 'isSandbox', 'expiresAt', 'purgeAt'] as const

/**
 * beforeOperation on tenants: a sandbox account touching a locked field gets a real 403 (field access alone would
 * drop the value silently). Runs before any field logic, on the raw request data.
 */
export const lockSandboxTenantFields: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  if (operation !== 'update' && operation !== 'updateByID' && operation !== 'create') return args
  if (isSystemWrite(req) || !sandboxOfUser(req.user)) return args
  if (operation === 'create') throw new APIError('آکادمی آزمایشی نمی‌تواند آکادمی بسازد.', 403)
  const data = (args as { data?: Record<string, unknown> }).data ?? {}
  const touched = SANDBOX_LOCKED_TENANT_FIELDS.filter((f) => f in data)
  if (touched.length) throw new APIError(`در آکادمی آزمایشی این تنظیمات قفل است: ${touched.join(', ')}`, 403)
  return args
}

// ---------------------------------------------------------------- memberships never outlive the sandbox

export const clampSandboxMembership: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  if (!data) return data
  const flags = await tenantFlags(req, idOf(data.tenant ?? originalDoc?.tenant))
  if (!flags?.isSandbox) return data
  // A sandbox without an expiry is treated as already ended (fail closed).
  data.expiresAt = clampMembershipExpiry(data.expiresAt ?? originalDoc?.expiresAt ?? null, flags.expiresAt ?? new Date(0).toISOString())
  return data
}

// ---------------------------------------------------------------- uploads quota (S6)

type Sized = { filesize?: number | null; id?: number }

/**
 * Total uploads of one sandbox (media + private submission files) stay under SANDBOX_UPLOAD_MB. Real academies are
 * not affected. Payload's mimeTypes lists still decide the allowed types.
 */
export const sandboxUploadQuota: CollectionBeforeChangeHook = async ({ data, originalDoc, req, collection }) => {
  if (!data) return data
  const file = (req as { file?: { size?: number } }).file
  const size = file?.size ?? (typeof data.filesize === 'number' ? data.filesize : 0)
  if (!size) return data
  const tenantId = idOf(data.tenant ?? originalDoc?.tenant)
  const flags = await tenantFlags(req, tenantId)
  if (!flags?.isSandbox) return data
  if (sandboxState(flags) !== 'active') throw new APIError('زمان آکادمی آزمایشی به پایان رسیده است.', 403)
  let used = 0
  for (const slug of ['media', 'submission-files'] as const) {
    const res = await req.payload.find({ collection: slug, where: { tenant: { equals: tenantId } }, depth: 0, limit: 1000, pagination: false, overrideAccess: true, req, select: { filesize: true } })
    for (const d of res.docs as Sized[]) if (!(slug === collection.slug && d.id === (originalDoc as Sized | undefined)?.id)) used += d.filesize ?? 0
  }
  const quota = sandboxConfig().uploadBytes
  if (used + size > quota) {
    throw new APIError(`حجم فایل‌های آکادمی آزمایشی از سقف ${toPersianDigits(Math.round(quota / 1024 / 1024))} مگابایت بیشتر می‌شود.`, 413)
  }
  return data
}

// ---------------------------------------------------------------- media of sandboxes (BUG-4)

/**
 * Media read (including the file URL `/api/media/file/<name>`): real academies' media stay public as before (ADR 009
 * follow-up); a sandbox's media is served only to requests carrying that sandbox's valid selector cookie on the
 * platform host, so the demo cannot be used to host arbitrary files on the platform domain. Super-admins see all.
 */
export const mediaRead: Access = ({ req }) => {
  if (isSuperAdmin(req.user)) return true
  const realAcademy: Where = { 'tenant.isSandbox': { not_equals: true } }
  const sel = selectedSandboxOf(req)
  return sel ? { or: [realAcademy, { tenant: { equals: sel } }] } : realAcademy
}
