/**
 * E2E helper (demo tenant only, E-028): simulate time for gamification by writing a learning event in the past for a
 * student's demo-program enrollment, then rebuild the cache. Same write path as the app (idempotency key, daily cap).
 *
 *   pnpm --filter @edvora/web exec tsx --env-file=.env src/seed/e2e-ledger.ts <phone> <daysAgo> [type] [sourceId]
 *
 * type defaults to `lesson.completed`; sourceId defaults to a unique `e2e-<daysAgo>-<time>` (so each call is a
 * new row). Prints the refreshed summary (xp, rhythm weeks) as JSON. Refuses anything but the demo tenant.
 */
import { LEARNING_EVENT_TYPES, XP, type LearningEventType } from '@edvora/core/gamification'
import { getPayload } from 'payload'
import { flushGamification, recordLearningEvent, refreshEnrollmentGamification } from '../lib/gamification'
import config from '../payload.config'

const XP_BY_TYPE: Partial<Record<LearningEventType, number>> = {
  'lesson.completed': XP.lessonCompleted,
  'quiz.passed': XP.quizFirstPassBase,
  'assignment.submitted': XP.assignmentOnTime,
}

async function main() {
  const [phone, daysAgoRaw, typeRaw = 'lesson.completed', sourceRaw] = process.argv.slice(2)
  const daysAgo = Number(daysAgoRaw)
  if (!phone || !Number.isFinite(daysAgo) || daysAgo < 0) throw new Error('usage: e2e-ledger.ts <phone> <daysAgo> [type] [sourceId]')
  if (!(LEARNING_EVENT_TYPES as readonly string[]).includes(typeRaw)) throw new Error(`Unknown type ${typeRaw}`)
  const type = typeRaw as LearningEventType
  const payload = await getPayload({ config })
  const tenant = (await payload.find({ collection: 'tenants', where: { slug: { equals: 'demo' } }, limit: 1, overrideAccess: true })).docs[0]
  const user = (await payload.find({ collection: 'users', where: { phone: { equals: phone } }, limit: 1, overrideAccess: true })).docs[0]
  if (!tenant || !user) throw new Error('demo tenant or student not found')
  const course = (await payload.find({ collection: 'courses', where: { and: [{ tenant: { equals: tenant.id } }, { slug: { equals: 'demo-program' } }] }, limit: 1, overrideAccess: true })).docs[0]
  const enrollment = course && (await payload.find({ collection: 'enrollments', where: { and: [{ tenant: { equals: tenant.id } }, { user: { equals: user.id } }, { course: { equals: course.id } }] }, limit: 1, overrideAccess: true })).docs[0]
  if (!course || !enrollment) throw new Error('enrollment not found')
  const occurredAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
  const sourceId = sourceRaw ?? `e2e-${daysAgo}-${Date.now()}`
  const r = await recordLearningEvent(
    { payload },
    {
      tenantId: tenant.id,
      userId: user.id,
      enrollmentId: enrollment.id,
      courseId: course.id,
      cohortId: typeof enrollment.cohort === 'number' ? enrollment.cohort : (enrollment.cohort?.id ?? null),
      type,
      sourceId,
      xp: XP_BY_TYPE[type] ?? 0,
      idempotencyKey: `e2e:${enrollment.id}:${type}:${sourceId}`,
      occurredAt,
      meta: { e2e: true },
    },
  )
  const view = await refreshEnrollmentGamification({ payload }, enrollment.id, { wait: true })
  await flushGamification()
  console.info(JSON.stringify({ created: r.created, xp: view?.xp, streak: view?.rhythm && { current: view.rhythm.current, weeks: view.rhythm.weeks.map((w) => [w.key, w.state, w.learningDays, w.goal]) } }, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
