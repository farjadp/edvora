import { notFound, permanentRedirect } from 'next/navigation'
import { findRedirect } from '../../../lib/redirects'
import { getCurrentTenant } from '../../../lib/tenant'

type Props = { params: Promise<{ wpPath: string[] }> }

/**
 * Lowest-priority catch-all (ADR 011 §Redirects serving): every real route is more specific, so this only renders
 * for paths nothing else matched. Old WordPress URLs imported for this academy get a permanent redirect (308);
 * everything else is the normal 404. The tenant comes from the Host header of this real request (ADR 005).
 */
export default async function LegacyPath({ params }: Props) {
  const { wpPath } = await params
  const tenant = await getCurrentTenant()
  const to = await findRedirect(tenant.id, `/${wpPath.join('/')}`)
  if (to) permanentRedirect(to)
  notFound()
}
