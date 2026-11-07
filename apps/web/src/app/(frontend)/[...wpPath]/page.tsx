import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { ContentPage } from '../../../components/ContentPage'
import { isPageSlugShape } from '../../../lib/pageSlugs'
import { getPageBySlug } from '../../../lib/queries'
import { findRedirect } from '../../../lib/redirects'
import { getCurrentTenant } from '../../../lib/tenant'

type Props = { params: Promise<{ wpPath: string[] }> }

/** A single path segment that could be a page slug (E-030 Pages, see lib/pageSlugs). */
async function pageSlug(params: Props['params']): Promise<string | null> {
  const { wpPath } = await params
  if (wpPath.length !== 1) return null
  let s: string
  try {
    s = decodeURIComponent(wpPath[0]!)
  } catch {
    return null
  }
  return isPageSlugShape(s) ? s : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = await pageSlug(params)
  if (!slug) return {}
  const tenant = await getCurrentTenant()
  const page = await getPageBySlug(tenant.id, slug)
  return page ? { title: page.title, description: page.intro ?? undefined } : {}
}

/**
 * Lowest-priority catch-all (ADR 011 §Redirects serving): every real route is more specific, so this only renders
 * for paths nothing else matched.
 *  1. `/<slug>` → the academy's published content page (E-030 Pages), if there is one;
 *  2. old WordPress URLs imported for this academy → permanent redirect (308);
 *  3. otherwise the normal 404.
 * The tenant comes from the Host header of this real request (ADR 005).
 */
export default async function LegacyPath({ params }: Props) {
  const { wpPath } = await params
  const tenant = await getCurrentTenant()
  const slug = await pageSlug(params)
  if (slug) {
    const page = await getPageBySlug(tenant.id, slug)
    if (page) return <ContentPage page={page} tenant={tenant} />
  }
  const to = await findRedirect(tenant.id, `/${wpPath.join('/')}`)
  if (to) permanentRedirect(to)
  notFound()
}
