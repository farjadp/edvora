import { SUBMISSION_MIME } from '@edvora/core'
import path from 'path'
import type { CollectionConfig } from 'payload'
import { allow, anyOf, nobody, ownRecords } from '../access/permissions'

/** Outside any public/static path (ADR 008). Relative paths resolve from apps/web. */
export function privateUploadsDir(): string {
  const dir = process.env.PRIVATE_UPLOADS_DIR?.trim() || 'private-uploads/submission-files'
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir)
}

/**
 * Private student uploads (ADR 008). Created only by the submit action with a random file name; downloaded only
 * through GET /files/submissions/<id>, which checks the academy and owner-or-grader on every request.
 */
export const SubmissionFiles: CollectionConfig = {
  slug: 'submission-files',
  labels: { singular: { fa: 'فایل تکلیف', en: 'Submission file' }, plural: { fa: 'فایل‌های تکالیف', en: 'Submission files' } },
  admin: {
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'owner', 'course', 'filesize', 'createdAt'],
    group: { fa: 'آزمون و تکلیف', en: 'Quizzes & assignments' },
    description: 'Private. Open a file with the "download" link; it checks access on every request.',
  },
  access: {
    read: anyOf(ownRecords('owner'), allow('submissions.grade', { course: 'course', cohort: 'cohort' })),
    create: nobody,
    update: nobody,
    delete: nobody,
  },
  upload: {
    staticDir: privateUploadsDir(),
    mimeTypes: Object.values(SUBMISSION_MIME),
    // Payload's own file URL (/api/submission-files/file/...) never serves these files.
    handlers: [() => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'private, no-store' } })],
    hideFileInputOnCreate: true,
    hideRemoveFile: true,
    disableLocalStorage: false,
  },
  hooks: {
    afterRead: [
      ({ doc }) => {
        // Point every link (admin included) at the protected route.
        const id = (doc as { id?: number }).id
        if (id) (doc as { url?: string }).url = `/files/submissions/${id}`
        return doc
      },
    ],
  },
  fields: [
    { name: 'owner', type: 'relationship', relationTo: 'users', required: true, index: true, label: { fa: 'دانشجو', en: 'Student' } },
    { name: 'course', type: 'relationship', relationTo: 'courses', required: true, index: true },
    { name: 'cohort', type: 'relationship', relationTo: 'cohorts', index: true },
    { name: 'kind', type: 'select', options: ['pdf', 'docx', 'jpg', 'png'], required: true },
  ],
}
