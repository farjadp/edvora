import 'server-only'
import type { Where } from 'payload'
import type { Cohort, Course } from '../payload-types'
import { idOf } from './ids'
import { getPayloadClient } from './payload'

// Public reads always filter by tenant explicitly. Never rely on the open API for tenant isolation.
const inTenant = (tenantId: number, extra: Where[] = []): Where => ({ and: [{ tenant: { equals: tenantId } }, ...extra] })

export async function getPublishedCourses(tenantId: number): Promise<Course[]> {
  const payload = await getPayloadClient()
  const res = await payload.find({
    collection: 'courses',
    where: inTenant(tenantId, [{ status: { equals: 'published' } }]),
    sort: 'sortOrder',
    limit: 100,
    depth: 1,
    overrideAccess: true,
  })
  return res.docs
}

export async function getCourseBySlug(tenantId: number, slug: string): Promise<Course | null> {
  const payload = await getPayloadClient()
  const res = await payload.find({
    collection: 'courses',
    where: inTenant(tenantId, [{ slug: { equals: slug } }, { status: { equals: 'published' } }]),
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })
  return res.docs[0] ?? null
}

/** The next open cohort per course, keyed by course id. */
export async function getOpenCohorts(tenantId: number): Promise<Map<number, Cohort>> {
  const payload = await getPayloadClient()
  const res = await payload.find({
    collection: 'cohorts',
    where: inTenant(tenantId, [{ status: { in: ['open', 'preregistration'] } }]),
    sort: 'startDate',
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  const map = new Map<number, Cohort>()
  for (const c of res.docs) {
    const cid = idOf(c.course)
    if (cid && !map.has(cid)) map.set(cid, c)
  }
  return map
}

export async function getLessons(courseId: number) {
  const payload = await getPayloadClient()
  const res = await payload.find({
    collection: 'lessons',
    where: { course: { equals: courseId } },
    sort: 'order',
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  return res.docs
}

export async function getTestimonials(tenantId: number) {
  const payload = await getPayloadClient()
  const res = await payload.find({
    collection: 'testimonials',
    where: inTenant(tenantId, [{ approvedForUse: { equals: true } }]),
    limit: 20,
    depth: 1,
    overrideAccess: true,
  })
  return res.docs
}

export async function getPosts(tenantId: number, limit = 8) {
  const payload = await getPayloadClient()
  const res = await payload.find({
    collection: 'posts',
    where: inTenant(tenantId),
    sort: '-publishedAt',
    limit,
    depth: 1,
    overrideAccess: true,
  })
  return res.docs
}
