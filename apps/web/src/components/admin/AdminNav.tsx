import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent'
import type { ServerProps } from 'payload'
import { adminConsoleNav } from '../../lib/consoleNav'
import { AdminNavClient } from './AdminNavClient'

/**
 * Admin sidebar (E-035, `admin.components.Nav`): the console's module groups and icons, filtered by Payload's own
 * `permissions.collections[slug].read`. The academy selector from the multi-tenant plugin (`beforeNavLinks`) is kept.
 */
export async function Nav(props: ServerProps) {
  const { payload, permissions, i18n, locale, params, searchParams, user } = props
  const groups = adminConsoleNav((slug) => permissions?.collections?.[slug]?.read === true)
  const selector = RenderServerComponent({
    Component: payload.config.admin.components?.beforeNavLinks,
    importMap: payload.importMap,
    serverProps: { i18n, locale, params, payload, permissions, searchParams, user },
  })
  return <AdminNavClient groups={groups} selector={selector} />
}
