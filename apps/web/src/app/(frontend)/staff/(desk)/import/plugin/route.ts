import { getStaffSession } from '../../../../../../lib/staff'
import { meets } from '@edvora/core/staff'
import { pluginDir, zipDirectory } from '../../../../../../lib/wpimport/zip'

export const dynamic = 'force-dynamic'

/**
 * The Edvora Migrator plugin zip (ADR 011 §Plugin constraints: distributed only from inside Edvora). Staff with
 * `import.view` in this academy only; never cached, never public.
 */
export async function GET(): Promise<Response> {
  const s = await getStaffSession()
  if (s.state !== 'ok') return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
  if (!meets(s, { any: ['import.view'] })) return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'private, no-store' } })
  try {
    const zip = await zipDirectory(pluginDir(), 'edvora-migrator')
    return new Response(new Uint8Array(zip), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="edvora-migrator.zip"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new Response('Plugin package is not available on this server', { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
