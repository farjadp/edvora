import { checkTwoFactorReset } from '@edvora/core'
import type { UIFieldServerProps } from 'payload'
import { getAccess, loadMembershipGrants } from '../../access/permissions'
import { isSuperAdmin } from '../../access/roles'
import { idOf } from '../../lib/ids'
import type { User } from '../../payload-types'
import { TwoFactorResetButton } from './TwoFactorResetButton'

const OTHER_ACADEMY = 'این کاربر در آکادمی دیگری هم کارمند است؛ بازنشانی فقط توسط پشتیبانی ادورا ممکن است.'

/**
 * Users → edit → «وضعیت و دسترسی»: admin reset of someone's 2FA (UX §7.5). Rendered on the server so the button
 * only appears when the same rule the endpoint enforces (`checkTwoFactorReset`) allows it and 2FA is on.
 */
export async function TwoFactorResetField({ req, id }: UIFieldServerProps) {
  const targetId = idOf(id)
  if (!targetId || !req.user) return null
  try {
    const target = (await req.payload.findByID({ collection: 'users', id: targetId, depth: 0, overrideAccess: true, req, disableErrors: true })) as User | null
    if (!target?.twoFactorEnabled) return null
    const ctx = await getAccess(req)
    if (!ctx) return null
    const decision = checkTwoFactorReset(ctx, {
      userId: target.id,
      isPlatformAdmin: isSuperAdmin(target),
      tenantIds: (target.tenants ?? []).map((t) => idOf(t.tenant)).filter((x): x is number => x !== null),
      memberships: await loadMembershipGrants(req, target.id),
    })
    if (!decision.ok) return decision.reason === 'other-academy' ? <p className="field-description">{OTHER_ACADEMY}</p> : null
    return <TwoFactorResetButton userId={target.id} name={target.name?.trim() || target.email} />
  } catch (err) {
    req.payload.logger.error({ err, msg: '2fa reset field failed' })
    return null
  }
}
