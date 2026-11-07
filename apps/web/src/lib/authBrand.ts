import type { AuthBrand } from '../components/auth/AuthFrame'
import type { Tenant } from '../payload-types'
import { tenantLogo } from './staff'

/**
 * Public academy data for the login screens (spec §3): name, logo, welcome line. Welcome = `tagline` today; a dedicated
 * `loginWelcome` field is proposed in E-034 §7.2 (not built). Nothing here needs a session.
 */
export function authBrand(tenant: Tenant): AuthBrand {
  const logo = tenantLogo(tenant)
  return { name: tenant.name, logoUrl: logo.url, logoAlt: logo.alt, welcome: tenant.tagline?.trim() || null }
}
