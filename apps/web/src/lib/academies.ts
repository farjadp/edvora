import 'server-only'
import type { PayloadRequest } from 'payload'
import type { Tenant } from '../payload-types'

type NewTenant = Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'>

/**
 * Defaults every new academy starts with. The Tenants `afterChange` hook adds the role templates (ADR 006 §4).
 *
 * E-028: gamification is on for new academies through the `tenants.gamification` field defaults
 * (`GAMIFICATION_DEFAULTS`, fields/gamification.ts), which `payload.create` applies here. Demo sandboxes are created
 * through `createAcademy`, so they inherit it (and any later default) with no sandbox-specific code (E-029 S11).
 */
export const NEW_ACADEMY_DEFAULTS: Partial<NewTenant> = {
  plan: 'starter',
  features: ['site', 'lms', 'payments', 'certificates'],
  defaultTheme: 'light',
}

/** The one path for creating an academy in code. Runs in the caller's transaction (`req`). */
export async function createAcademy(req: PayloadRequest, data: Partial<NewTenant> & Pick<NewTenant, 'name' | 'slug' | 'certificatePrefix'>): Promise<Tenant> {
  return req.payload.create({ collection: 'tenants', overrideAccess: true, req, data: { ...NEW_ACADEMY_DEFAULTS, ...data } })
}
