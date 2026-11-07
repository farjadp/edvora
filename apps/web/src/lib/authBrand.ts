import type { AuthBrand } from '../components/auth/AuthFrame'
import type { Media, Tenant } from '../payload-types'

/**
 * Public academy data for the login screens (spec §3): name, logo, welcome line. Welcome = `tagline` today; a dedicated
 * `loginWelcome` field is proposed in E-034 §7.2 (not built). Nothing here needs a session.
 */
export function authBrand(tenant: Tenant): AuthBrand {
  const logo = typeof tenant.logo === 'object' ? (tenant.logo as Media | null) : null
  return { name: tenant.name, logoUrl: logo?.url ?? null, logoAlt: logo?.alt ?? null, welcome: tenant.tagline?.trim() || null }
}
