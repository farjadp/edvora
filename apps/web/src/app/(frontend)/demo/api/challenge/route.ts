import { newChallenge } from '../../../../../lib/sandbox/demoState'
import { allowRequest, demoRequest, json, tooMany } from '../../../../../lib/sandbox/guard'

export const dynamic = 'force-dynamic'

/** GET /demo/api/challenge — a fresh signed proof-of-work challenge (after a failed attempt). */
export async function GET() {
  const r = await demoRequest()
  if (!r) return json({ state: 'not-found' }, 404)
  if (!allowRequest(r)) return tooMany()
  return json({ challenge: newChallenge(r.cfg.powBits) })
}
