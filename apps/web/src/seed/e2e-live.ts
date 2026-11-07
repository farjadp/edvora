/**
 * E-033 local test data: turns on live classes for the demo academy and schedules one class for the demo cohort,
 * starting in 5 minutes (so the host can start it and the student can join right away). Re-run safe.
 * Run: pnpm --filter @edvora/web exec tsx --env-file=.env src/seed/e2e-live.ts
 */
import { getPayload } from 'payload'
import config from '../payload.config'

async function main() {
  const payload = await getPayload({ config })
  const demo = (await payload.find({ collection: 'tenants', where: { slug: { equals: 'demo' } }, limit: 1, overrideAccess: true })).docs[0]
  if (!demo) throw new Error('Run pnpm seed first')
  const features = new Set([...(demo.features ?? []), 'live' as const])
  await payload.update({ collection: 'tenants', id: demo.id, data: { features: [...features] }, overrideAccess: true })

  const course = (await payload.find({ collection: 'courses', where: { and: [{ tenant: { equals: demo.id } }, { slug: { equals: 'demo-program' } }] }, limit: 1, overrideAccess: true })).docs[0]
  const cohort = course && (await payload.find({ collection: 'cohorts', where: { course: { equals: course.id } }, limit: 1, overrideAccess: true })).docs[0]
  const instructor = (await payload.find({ collection: 'users', where: { email: { equals: 'instructor@demo.edvora.local' } }, limit: 1, overrideAccess: true })).docs[0]
  if (!course || !cohort) throw new Error('demo course/cohort missing')

  const startsAt = new Date(Date.now() + 5 * 60_000).toISOString()
  const existing = (await payload.find({ collection: 'live-sessions', where: { and: [{ tenant: { equals: demo.id } }, { title: { equals: 'کلاس زندهٔ آزمایشی' } }] }, limit: 1, overrideAccess: true })).docs[0]
  const data = { tenant: demo.id, title: 'کلاس زندهٔ آزمایشی', course: course.id, cohort: cohort.id, instructor: instructor?.id ?? null, startsAt, durationMin: 60, status: 'scheduled' as const }
  const s = existing
    ? await payload.update({ collection: 'live-sessions', id: existing.id, data, overrideAccess: true })
    : await payload.create({ collection: 'live-sessions', data, overrideAccess: true })
  console.info(`live session ${s.id} for ${course.slug} / cohort ${cohort.id}, starts ${startsAt}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
