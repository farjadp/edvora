import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { buildCertificateCode, parseCertificateCode } from '@edvora/core'
import { admins, adminsOrInstructors } from '../access/roles'

/** Certificates with a public verification page at /verify. */
export const Certificates: CollectionConfig = {
  slug: 'certificates',
  labels: { singular: { fa: 'گواهی', en: 'Certificate' }, plural: { fa: 'گواهی‌ها', en: 'Certificates' } },
  admin: { useAsTitle: 'code', defaultColumns: ['code', 'holderName', 'course', 'status', 'issuedAt'], group: { fa: 'آموزش', en: 'Learning' } },
  access: {
    // The public verify page reads through the server and shows only safe fields.
    read: adminsOrInstructors,
    create: admins,
    update: admins,
    delete: () => false,
  },
  hooks: {
    beforeChange: [
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
  ],
}
