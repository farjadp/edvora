import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent'
import type { ServerProps } from 'payload'
import { getAdminConsoleContext } from '../../lib/adminTenant'
import { adminConsoleNav, payloadAllows } from '../../lib/consoleNav'
import { AdminNavClient } from './AdminNavClient'

/**
 * Admin sidebar (E-035, `admin.components.Nav`): the console's module groups and icons, filtered by Payload's own
 * `permissions.collections[slug].read` AND the person's membership permissions (consoleNav). The academy selector from the multi-tenant plugin (`beforeNavLinks`) is kept.
 */
export async function Nav(props: ServerProps) {
  const { payload, permissions, i18n, locale, params, searchParams, user } = props
  const ctx = await getAdminConsoleContext(payload)
  const groups = ctx ? adminConsoleNav((slug) => payloadAllows(permissions, slug), ctx.who) : []
  const selector = RenderServerComponent({
    Component: payload.config.admin.components?.beforeNavLinks,
    importMap: payload.importMap,
    serverProps: { i18n, locale, params, payload, permissions, searchParams, user },
  })
  return <AdminNavClient groups={groups} selector={selector} />
}
