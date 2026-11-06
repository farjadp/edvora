/**
 * Sandbox guards shared by collections (E-029, ADR 010). A sandbox is a tenant with `isSandbox = true`; its
 * accounts carry `users.sandboxTenant`. Flags are read from the DB (never from a token) and cached per request.
 */
import { clampMembershipExpiry, parseSandboxConfig, sandboxState, toPersianDigits, type SandboxConfig } from '@edvora/core'
import type { CollectionBeforeChangeHook, CollectionBeforeOperationHook, PayloadRequest } from 'payload'
import { APIError } from 'payload'
import { idOf } from '../lib/ids'
import { isSystemWrite } from './permissions'

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

/** Throws the expired error when the account's sandbox has ended (login, E1). */
export async function assertSandboxUserActive(req: PayloadRequest, user: unknown): Promise<void> {
  const sid = sandboxOfUser(user)
  if (!sid) return
  const flags = await tenantFlags(req, sid)
  if (!flags || sandboxState(flags) !== 'active') throw new APIError('زمان آکادمی آزمایشی به پایان رسیده است.', 403)
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
