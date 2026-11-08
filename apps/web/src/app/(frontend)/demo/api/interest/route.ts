import { z } from 'zod'
import { getPayloadClient } from '../../../../../lib/payload'
import { savePlatformLead } from '../../../../../lib/sandbox/create'
import { VisitorInput } from '../../../../../lib/sandbox/demoState'
import { allowRequest, demoRequest, json, tooMany } from '../../../../../lib/sandbox/guard'

export const dynamic = 'force-dynamic'

const Input = VisitorInput.extend({ source: z.enum(['full-state', 'expired-state', 'talk']) })

/** POST /demo/api/interest — leave an email from the full or ended state (F3). Consent is required to store it. */
export async function POST(request: Request) {
  const r = await demoRequest()
  if (!r) return json({ state: 'not-found' }, 404)
  if (!allowRequest(r)) return tooMany()
  const parsed = Input.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ state: parsed.error.issues.some((i) => i.path[0] === 'email') ? 'invalid-email' : 'retry' }, 400)
  const { email, name, consent, website, source } = parsed.data
  if (!email) return json({ state: 'invalid-email' }, 400)
  // Honeypot or no consent: answer "saved" without saving anything.
  if (!website && consent) await savePlatformLead(await getPayloadClient(), { name, email, source })
  return json({ state: 'saved' })
}
