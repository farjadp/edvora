import { redirect } from 'next/navigation'
import { getCurrentTenant, isEndedSandbox } from '../../lib/tenant'
import { SandboxCountdown } from './SandboxCountdown'

/**
 * Countdown bar for demo sandboxes (E-029 S12), placed in the /staff, /dashboard and /learn layouts. Renders nothing
 * on a real academy. An ended sandbox is sent to the ended state (server component redirect: allowed by ADR 005).
 */
export async function SandboxBanner() {
  const tenant = await getCurrentTenant()
  if (!tenant.isSandbox) return null
  if (isEndedSandbox(tenant)) redirect('/demo?state=ended')
  return <SandboxCountdown expiresAt={tenant.expiresAt ?? new Date().toISOString()} serverNow={Date.now()} contactHref={process.env.SANDBOX_CONTACT_URL?.trim() || '/demo'} />
}
