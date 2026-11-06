import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { privateUploadsDir } from '../../../../../collections/SubmissionFiles'
import { idOf } from '../../../../../lib/ids'
import { getPayloadClient } from '../../../../../lib/payload'
import { getCurrentUser } from '../../../../../lib/session'
import { getStaff } from '../../../../../lib/staff'
import { getCurrentTenant } from '../../../../../lib/tenant'

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
const notFound = () => new Response('Not found', { status: 404, headers: NO_STORE })

/**
 * The only way to download a submission file (ADR 008, C3f). Checked on every request:
 * the owner student (session of this academy's host) or staff with `submissions.grade` in the file's academy
 * and course/cohort scope. Everyone else gets 404 (401 when not signed in at all); nothing is cached.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) return notFound()

  const [student, staff, tenant] = await Promise.all([getCurrentUser(), getStaff(), getCurrentTenant()])
  if (!student && !staff) return new Response('Sign in required', { status: 401, headers: NO_STORE })

  const payload = await getPayloadClient()
  const file = await payload.findByID({ collection: 'submission-files', id, depth: 0, overrideAccess: true, disableErrors: true })
  if (!file?.filename) return notFound()
  const fileTenant = idOf(file.tenant)

  const ownerOk = Boolean(student && fileTenant === tenant.id && idOf(file.owner) === student.id)
  const graderOk =
    !ownerOk && staff && fileTenant !== null ? await staff.can(fileTenant, 'submissions.grade', { courseId: idOf(file.course), cohortId: idOf(file.cohort) }) : false
  if (!ownerOk && !graderOk) return notFound()

  const dir = privateUploadsDir()
  const full = path.resolve(dir, path.basename(file.filename))
  if (!full.startsWith(dir + path.sep)) return notFound()
  let data: Buffer
  try {
    data = await readFile(full)
  } catch (err) {
    console.error('[submission file] missing on disk', id, err)
    return notFound()
  }
  const ext = path.extname(file.filename).replace('.', '') || 'bin'
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      ...NO_STORE,
      'Content-Type': file.mimeType ?? 'application/octet-stream',
      'Content-Length': String(data.length),
      'Content-Disposition': `attachment; filename="submission-${file.id}.${ext}"`,
    },
  })
}
