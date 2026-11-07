import { ensureContrast, isHex, mix, readableInk, SURFACES, tenantPalette, type Hex } from '@edvora/ui/color'
import type { ServerProps } from 'payload'
import { getAdminTenantContext } from '../../lib/adminTenant'

const DEFAULT_BRAND: Hex = '#1A56DB'

/**
 * The admin accent follows the academy selected in the nav (E-031). Emits CSS variables in a <style> element,
 * never an inline style attribute: --brand-solid/--brand-solid-ink (button fills, visible on both themes), --brand-text (text/links, >=4.5:1 on the paper and
 * surface colours of each theme), --brand-wash (tint behind the active nav item). With no academy selected
 * (platform admin viewing all) the Edvora default blue is used.
 * custom.scss reads these with fallbacks, so the admin still looks right if this component renders nothing.
 */
export async function TenantAccent({ payload }: ServerProps) {
  const { tenant } = await getAdminTenantContext(payload)
  return <style>{adminAccentCss(tenant?.primaryColor)}</style>
}

/** The accent variables for one academy colour (shared with the login skin, which resolves the academy by Host). */
export function adminAccentCss(primaryColor: string | null | undefined): string {
  const brand: Hex = isHex(primaryColor) ? primaryColor : DEFAULT_BRAND
  const p = tenantPalette(brand, DEFAULT_BRAND)
  const textLight = ensureContrast(brand, SURFACES.light, '#000000', 4.5)
  const textDark = ensureContrast(brand, SURFACES.dark, '#ffffff', 4.5)
  const washLight = mix('#ffffff', brand, 0.09)
  const washDark = mix('#151820', brand, 0.22)
  // Dark theme: a fill that is still visible (>=3:1) against the dark surfaces, with readable text on it.
  const solidDark = ensureContrast(brand, SURFACES.dark, '#ffffff', 3)
  return (
    `html:root{--brand:${p.brand};--brand-solid:${p.brand};--brand-solid-ink:${p.brandInk};--brand-text:${textLight};--brand-wash:${washLight};--focus:${p.focus}}` +
    `html:root[data-theme='dark']{--brand-solid:${solidDark};--brand-solid-ink:${readableInk(solidDark)};--brand-text:${textDark};--brand-wash:${washDark};--focus:${p.focusDark}}`
  )
}
