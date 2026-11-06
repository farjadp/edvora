import { toPersianDigits } from '@edvora/core'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { DemoScreen, type DemoInitial } from '../../../components/demo/DemoScreen'
import { getRequestOrigin } from '../../../lib/origin'
import { getPayloadClient } from '../../../lib/payload'
import { CREATOR_COOKIE, SELECTOR_COOKIE, readSelector } from '../../../lib/sandbox/cookies'
import { isActive, newChallenge, remainingFa, timeFa } from '../../../lib/sandbox/demoState'
import { demoRequest } from '../../../lib/sandbox/guard'
import { verifiedCreator } from '../../../lib/sandbox/signin'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: 'آکادمی آزمایشی ادورا' },
  description: 'آکادمی خودتان را چند ساعت رایگان و بدون ثبت‌نام آزمایش کنید.',
  robots: { index: false, follow: false },
}

type Props = { searchParams: Promise<{ state?: string }> }

const ttlLabel = (hours: number) => toPersianDigits(Number.isInteger(hours) ? hours : Math.round(hours * 10) / 10)

/**
 * /demo — public self-serve demo (E-029). Platform host only. Decides the first state on the server (server clock):
 * live sandbox for this browser → «ادامه» (passwords never shown again); ended → expired state; kill switch → off;
 * capacity full → full state; otherwise the form with a freshly signed proof-of-work challenge.
 */
export default async function DemoPage({ searchParams }: Props) {
  const r = await demoRequest()
  if (!r) notFound()
  const sp = await searchParams
  const payload = await getPayloadClient()
  const jar = await cookies()
  const origin = await getRequestOrigin()
  const found = await verifiedCreator(payload, jar.get(CREATOR_COOKIE)?.value)
  const selector = readSelector(jar.get(SELECTOR_COOKIE)?.value, true)

  let initial: DemoInitial = { kind: 'form' }
  if (found && isActive(found.tenant)) {
    initial = {
      kind: 'continue',
      remainingFa: remainingFa(found.tenant.expiresAt),
      expiresAtFa: timeFa(found.tenant.expiresAt ?? new Date()),
      loginUrl: `${origin}/demo/s/${found.tenant.slug}`,
      hasCreator: true,
    }
  } else if (!found && selector && !selector.expired) {
    // Second device (selected via the login address): show time left, sign in with the password form.
    const t = await payload.findByID({ collection: 'tenants', id: selector.tid, depth: 0, overrideAccess: true, disableErrors: true })
    if (t && t.isSandbox && isActive(t)) {
      initial = { kind: 'continue', remainingFa: remainingFa(t.expiresAt), expiresAtFa: timeFa(t.expiresAt ?? new Date()), loginUrl: `${origin}/demo/s/${t.slug}`, hasCreator: false }
    } else initial = { kind: 'ended', canCreate: false }
  } else if (found || selector?.expired || sp.state === 'ended' || (jar.get(CREATOR_COOKIE)?.value && !found)) {
    initial = { kind: 'ended', canCreate: false }
  }

  if (initial.kind === 'form' || initial.kind === 'ended') {
    const now = new Date().toISOString()
    const [active, ipDay, ipActive] = await Promise.all([
      payload.find({ collection: 'demo-sandboxes', where: { and: [{ status: { in: ['creating', 'active'] } }, { expiresAt: { greater_than: now } }] }, sort: 'expiresAt', limit: 1, depth: 0, overrideAccess: true, select: { expiresAt: true } }),
      payload.count({ collection: 'demo-sandboxes', where: { and: [{ ipHash: { equals: r.ipHash } }, { status: { not_equals: 'failed' } }, { createdAt: { greater_than: new Date(Date.now() - 24 * 3600_000).toISOString() } }] }, overrideAccess: true }),
      payload.count({ collection: 'demo-sandboxes', where: { and: [{ ipHash: { equals: r.ipHash } }, { status: { in: ['creating', 'active'] } }, { expiresAt: { greater_than: now } }] }, overrideAccess: true }),
    ])
    const ipAllowed = ipDay.totalDocs < r.cfg.ipDailyMax && ipActive.totalDocs < r.cfg.ipActiveMax
    const capacity = active.totalDocs < r.cfg.maxActive
    if (initial.kind === 'ended') initial = { kind: 'ended', canCreate: r.cfg.enabled && ipAllowed && capacity }
    else if (!r.cfg.enabled) initial = { kind: 'disabled' }
    else if (sp.state === 'rate-limited' || !ipAllowed) initial = { kind: 'rate-limited' }
    else if (!capacity) initial = { kind: 'full', nextFreeInFa: active.docs[0]?.expiresAt ? remainingFa(active.docs[0].expiresAt) : null }
  }

  return (
    <DemoScreen
      initial={initial}
      challenge={newChallenge(r.cfg.powBits)}
      ttlFa={ttlLabel(r.cfg.ttlHours)}
      minFillMs={r.cfg.minFillMs}
      // TODO(client): Farjad's contact channel (Q4) — WhatsApp/Telegram/phone/email. Until then the button opens the email form.
      contactHref={process.env.SANDBOX_CONTACT_URL?.trim() || null}
    />
  )
}
