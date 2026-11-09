import { safeEqual } from '@edvora/core'
import { NextResponse } from 'next/server'
import { env } from '../../../../env'
import { getPayloadClient } from '../../../../lib/payload'
import { runReminders, type ReminderRunOptions } from '../../../../lib/reminders/worker'

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } })

/** Bearer REMINDERS_CRON_SECRET (≥ 24 chars). No secret configured = 404, like the sandbox cleanup cron. */
function authorized(request: Request, secret: string | undefined): boolean {
  const s = secret?.trim() ?? ''
  if (s.length < 24) return false
  const got = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  return safeEqual(got, s)
}

let running = false

/**
 * POST /api/cron/reminders — E-016 SMS reminders worker (ADR 020, runbook docs/runbooks/sms-reminders.md).
 * Railway cron calls it every 10 minutes. Idempotent: reruns never resend (unique key per reminder per recipient).
 * `SMS_REMINDERS_ENABLED` is the global kill switch (default off). With REMINDERS_E2E_HOOKS=true (tests only) the
 * caller may pass `?now=<ISO>` and `?tenant=<slug>`.
 */
export async function POST(request: Request) {
  const e = env()
  if (!authorized(request, e.REMINDERS_CRON_SECRET)) return json({ error: 'not found' }, 404)
  if (!e.SMS_REMINDERS_ENABLED) return json({ ok: true, disabled: true })
  if (running) return json({ ok: false, busy: true }, 409)

  const opts: ReminderRunOptions = {}
  if (e.REMINDERS_E2E_HOOKS) {
    const url = new URL(request.url)
    const now = url.searchParams.get('now')
    const tenant = url.searchParams.get('tenant')
    if (now) {
      const d = new Date(now)
      if (Number.isNaN(d.getTime())) return json({ error: 'bad now' }, 400)
      opts.now = d
    }
    if (tenant && /^[a-z0-9-]{1,64}$/.test(tenant)) opts.tenantSlug = tenant
  }

  running = true
  try {
    const report = await runReminders(await getPayloadClient(), opts)
    return json({ ok: report.errors.length === 0, ...report }, report.errors.length ? 500 : 200)
  } catch (err) {
    console.error('[reminders] run failed', err)
    return json({ ok: false, error: 'run failed' }, 500)
  } finally {
    running = false
  }
}
