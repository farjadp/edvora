import { sandboxConfig } from '../../../../../access/sandbox'
import { getPayloadClient } from '../../../../../lib/payload'
import { runSandboxCleanup } from '../../../../../lib/sandbox/cleanup'
import { cronAuthorized, json } from '../../../../../lib/sandbox/guard'

export const dynamic = 'force-dynamic'

/**
 * POST /demo/api/cleanup — the sandbox cleanup cron (every ~10 min). Idempotent: revokes ended sandboxes, hard-deletes
 * those past grace (ADR 010's single hard-delete exception), marks stale reservations. Works on any host and even
 * with SANDBOX_ENABLED=false (the kill switch stops creation, not cleanup).
 */
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return json({ error: 'not found' }, 404)
  const report = await runSandboxCleanup(await getPayloadClient(), sandboxConfig())
  return json({ ok: report.failed.length === 0, ...report }, report.failed.length ? 500 : 200)
}
