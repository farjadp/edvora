import { handlePush } from '../../../../../lib/wpimport/push'

/** FORMAT.md §2 — `POST /api/import/push/manifest` (signed by the Edvora Migrator plugin). */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  return handlePush(request, 'manifest')
}
