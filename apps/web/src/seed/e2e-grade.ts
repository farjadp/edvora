/**
 * E2E helper (demo tenant only): grade a student's submission as the seeded demo instructor through the Payload
 * local API with access control ON (overrideAccess: false), i.e. exactly the permission path /admin uses.
 *
 *   pnpm --filter @edvora/web exec tsx --env-file=.env src/seed/e2e-grade.ts <phone> <score> [feedback]
 *
 * Prints the updated submission as JSON. Refuses anything but the demo tenant.
 */
import { getPayload } from 'payload'
import config from '../payload.config'

const ASSIGNMENT_TITLE = 'تکلیف: تحلیل SWOT یک کسب‌وکار'
const INSTRUCTOR_EMAIL = 'instructor@demo.edvora.local'

async function main() {
  const [phone, scoreInput, feedback = ''] = process.argv.slice(2)
  if (!phone || !scoreInput) throw new Error('usage: e2e-grade.ts <phone> <score> [feedback]')
  const payload = await getPayload({ config })
  const one = async <T>(p: Promise<{ docs: T[] }>, what: string): Promise<T> => {
    const doc = (await p).docs[0]
    if (!doc) throw new Error(`Not found: ${what}`)
    return doc
  }
  const tenant = await one(payload.find({ collection: 'tenants', where: { slug: { equals: 'demo' } }, limit: 1, overrideAccess: true }), 'demo tenant')
  const student = await one(payload.find({ collection: 'users', where: { phone: { equals: phone } }, limit: 1, overrideAccess: true }), `student ${phone}`)
  const grader = await one(payload.find({ collection: 'users', where: { email: { equals: INSTRUCTOR_EMAIL } }, limit: 1, overrideAccess: true }), 'demo instructor')
  const assignment = await one(
    payload.find({ collection: 'assignments', where: { and: [{ tenant: { equals: tenant.id } }, { title: { equals: ASSIGNMENT_TITLE } }] }, limit: 1, overrideAccess: true }),
    'demo assignment',
  )
  const submission = await one(
    payload.find({ collection: 'submissions', where: { and: [{ assignment: { equals: assignment.id } }, { user: { equals: student.id } }] }, limit: 1, overrideAccess: true }),
    'submission',
  )
  const updated = await payload.update({
    collection: 'submissions',
    id: submission.id,
    data: { scoreInput, feedback },
    user: { ...grader, collection: 'users' },
    overrideAccess: false,
  })
  console.log(JSON.stringify({ id: updated.id, score: updated.score, status: updated.status, gradedBy: updated.gradedBy, feedback: updated.feedback }))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
