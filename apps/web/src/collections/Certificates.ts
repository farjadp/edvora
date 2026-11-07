import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { buildCertificateCode, parseCertificateCode } from '@edvora/core'
import { allow, allowCreate, anyOf, guard, isSystemWrite, nobody, requireForFields } from '../access/permissions'
import { auditChange } from '../hooks/audit'
import { idOf as relId } from '../lib/ids'
import { findEnrollment, loadCourseState } from '../lib/learning'

/** Certificates with a public verification page at /verify. */
const SCOPE = { course: 'course', cohort: 'cohort' }

export const Certificates: CollectionConfig = {
  slug: 'certificates',
  labels: { singular: { fa: 'گواهی', en: 'Certificate' }, plural: { fa: 'گواهی‌ها', en: 'Certificates' } },
  admin: { useAsTitle: 'code', defaultColumns: ['code', 'holderName', 'course', 'status', 'issuedAt'], group: { fa: 'آموزش', en: 'Learning' } },
  access: {
    // The public verify page reads through the server and shows only safe fields.
    read: anyOf(allow('certificates.view', SCOPE), allow('certificates.issue', SCOPE), allow('certificates.revoke', SCOPE)),
    create: allowCreate('certificates.issue'),
    update: anyOf(allow('certificates.issue', SCOPE), allow('certificates.revoke', SCOPE)),
    delete: nobody,
  },
  hooks: {
    afterChange: [auditChange('certificates')],
    beforeChange: [
      guard({ create: ['certificates.issue'], update: ['certificates.issue', 'certificates.revoke'], fields: SCOPE }),
      requireForFields(['status'], 'certificates.revoke', (a, b) => (a ?? 'valid') !== (b ?? 'valid')),
      // E-026: a certificate for an enrolled student needs every required quiz and assignment passed (Q8, C6).
      // Progress/defense are not enforced here yet (imported historic certificates); the issuing flow (E) will.
      async ({ data, req, operation }) => {
        // Historic certificates written by the WordPress import (server code) are not re-checked.
        if (operation !== 'create' || !data || isSystemWrite(req)) return data
        const tenantId = relId(data.tenant)
        const userId = relId(data.user)
        const courseId = relId(data.course)
        if (!tenantId || !userId || !courseId) return data
        const enrollment = await findEnrollment({ payload: req.payload, req }, tenantId, userId, courseId)
        if (!enrollment) return data
        const course = await req.payload.findByID({ collection: 'courses', id: courseId, depth: 0, overrideAccess: true, req })
        const state = await loadCourseState({ payload: req.payload, req }, { tenantId, course, enrollment })
        const missing = state.eligibility.eligible ? [] : state.eligibility.missing.filter((m) => m === 'quiz' || m === 'assignment')
        if (missing.length) {
          const open = state.requirements.filter((r) => r.state !== 'done').map((r) => r.title)
          throw new APIError(`Certificate blocked (${missing.join(', ')}): ${open.join(' · ')}`, 400)
        }
        return data
      },
      async ({ data, req, operation }) => {
        if (operation !== 'create' || !data || data.code) return data
        const idOf = (v: unknown) => (v && typeof v === 'object' && 'id' in v ? (v as { id: number }).id : (v as number))
        const tenantId = idOf(data.tenant)
        const courseId = idOf(data.course)
        if (!tenantId || !courseId) throw new APIError('Tenant and course are required to issue a certificate', 400)
        const [tenant, course] = await Promise.all([
          req.payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, req }),
          req.payload.findByID({ collection: 'courses', id: courseId, depth: 0, req }),
        ])
        if (!course.programCode) throw new APIError('Set a program code on the course before issuing certificates', 400)
        const prefix = `${tenant.certificatePrefix}-${course.programCode}-`
        const existing = await req.payload.find({
          collection: 'certificates',
          where: { code: { like: prefix } },
          limit: 1000,
          depth: 0,
          pagination: false,
          overrideAccess: true,
          req,
        })
        const maxSerial = existing.docs.reduce((m, d) => Math.max(m, parseCertificateCode(d.code ?? "")?.serial ?? 0), 0)
        data.code = buildCertificateCode({ prefix: tenant.certificatePrefix, program: course.programCode, serial: maxSerial + 1 })
        return data
      },
    ],
  },
  fields: [
    {
      name: 'code',
      type: 'text',
      unique: true,
      index: true,
      admin: { description: 'Leave empty to auto-generate (e.g. BA-MBA-182).' },
    },
    {
      type: 'row',
      fields: [
        { name: 'holderName', type: 'text', required: true, label: { fa: 'نام دارنده', en: 'Holder name' } },
        { name: 'user', type: 'relationship', relationTo: 'users' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'course', type: 'relationship', relationTo: 'courses', required: true },
        { name: 'cohort', type: 'relationship', relationTo: 'cohorts' },
      ],
    },
    { name: 'finalProject', type: 'text', label: { fa: 'پروژه نهایی', en: 'Final project' } },
    {
      type: 'row',
      fields: [
        { name: 'issuedAt', type: 'date', required: true, defaultValue: () => new Date().toISOString() },
        {
          name: 'status',
          type: 'select',
          defaultValue: 'valid',
          options: [
            { value: 'valid', label: { fa: 'معتبر', en: 'Valid' } },
            { value: 'revoked', label: { fa: 'باطل شده', en: 'Revoked' } },
          ],
        },
      ],
    },
    { name: 'pdf', type: 'upload', relationTo: 'media' },
    {
      // E-032 (W13): a certificate brought in from WordPress keeps its old id/number/URL so /verify can resolve it.
      type: 'collapsible',
      label: { fa: 'گواهی منتقل‌شده', en: 'Imported certificate' },
      admin: { initCollapsed: true },
      fields: [
        { name: 'legacyId', type: 'text', index: true, admin: { readOnly: true } },
        { name: 'legacyCode', type: 'text', index: true, admin: { readOnly: true } },
        { name: 'legacyUrl', type: 'text', admin: { readOnly: true } },
      ],
    },
  ],
}
