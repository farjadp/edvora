import { NextResponse } from 'next/server'
import { getRequestOrigin } from '../../../lib/origin'
import { endSession } from '../../../lib/session'

/** POST only (SameSite=Lax cookies are not sent on cross-site POSTs, so this can't be triggered by other sites). */
export async function POST() {
  await endSession()
  return NextResponse.redirect(new URL('/', await getRequestOrigin()), 303)
}
