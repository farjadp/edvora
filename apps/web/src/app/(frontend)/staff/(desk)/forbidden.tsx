import { DeskPermissionLine } from '../../../../components/staff/DeskPermissionLine'
import { ForbiddenPage } from '../../../../components/staff/ForbiddenPage'
import { STAFF_LOGOUT, getStaffSession, landingHref } from '../../../../lib/staff'

/**
 * HTTP 403 for the desk area (`forbidden()`, experimental.authInterrupts). Variant from the gate state:
 * A not a member here · B student account · C staff without this desk's permission (inside the shell).
 */
export default async function StaffForbidden() {
  const s = await getStaffSession()
  if (s.state === 'ok') return <ForbiddenPage variant="C" logoutHref={STAFF_LOGOUT} landingHref={landingHref(s)} detail={<DeskPermissionLine />} />
  return <ForbiddenPage variant={s.state === 'student' ? 'B' : 'A'} logoutHref={STAFF_LOGOUT} />
}
