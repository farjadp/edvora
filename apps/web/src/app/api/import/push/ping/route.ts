import { handlePush } from '../../../../../lib/wpimport/push'

/** FORMAT.md §2 — `GET /api/import/push/ping` (signed by the Edvora Migrator plugin). */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handlePush(request, 'ping')
}
