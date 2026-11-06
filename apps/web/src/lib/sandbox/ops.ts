import 'server-only'
import { headers } from 'next/headers'
import { isSuperAdmin } from '../../access/roles'
import { getPayloadClient } from '../payload'

/** Edvora super-admin signed in to Payload (O1, O3). Sandbox accounts are never super-admins. */
export async function requirePlatformAdmin() {
  const payload = await getPayloadClient()
  try {
    const { user } = await payload.auth({ headers: await headers() })
    if (user && user.collection === 'users' && isSuperAdmin(user)) return { payload, user }
  } catch (err) {
    payload.logger.error({ err, msg: 'demo ops: auth failed' })
  }
  return null
}
