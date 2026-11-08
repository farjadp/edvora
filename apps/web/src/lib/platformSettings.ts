import { staff2faRequiredBy, type IntegrationKind } from '@edvora/core/settings'
import type { Payload } from 'payload'

/**
 * Platform settings (ADR 019 §2) read from the `platform-settings` global, cached in memory for 30 s per process.
 * `staff2faRequired()` is synchronous (pages call it), so it reads this cache; `getAccess` warms it on every request.
 */
export type PlatformSettingsDoc = {
  staff2fa?: string | null
  academyProviders?: Partial<Record<IntegrationKind, boolean | null>> | null
}

const TTL_MS = 30_000
let cached: { at: number; doc: PlatformSettingsDoc } | null = null

export function rememberPlatformSettings(doc: unknown): void {
  cached = { at: Date.now(), doc: (doc ?? {}) as PlatformSettingsDoc }
}

export async function loadPlatformSettings(payload: Payload): Promise<PlatformSettingsDoc> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.doc
  try {
    const doc = (await payload.findGlobal({ slug: 'platform-settings', depth: 0, overrideAccess: true })) as PlatformSettingsDoc
    rememberPlatformSettings(doc)
    return doc
  } catch (err) {
    // A missing table (before the migration) must not lock everyone out: fall back to env.
    payload.logger.warn({ err, msg: 'platform settings: load failed, using env defaults' })
    rememberPlatformSettings({})
    return {}
  }
}

/** The staff 2FA rule: the platform policy when set, else STAFF_2FA_REQUIRED. */
export function staff2faRequiredNow(): boolean {
  return staff2faRequiredBy(cached?.doc.staff2fa, process.env.STAFF_2FA_REQUIRED)
}
