import { postgresAdapter } from '@payloadcms/db-postgres'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { s3Storage } from '@payloadcms/storage-s3'
import { en } from '@payloadcms/translations/languages/en'
import { fa } from '@payloadcms/translations/languages/fa'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { getAccess } from './access/permissions'
import { isSuperAdmin } from './access/roles'
import { tenantsWith } from '@edvora/core'
import { Assignments } from './collections/Assignments'
import { AuditLogs } from './collections/AuditLogs'
import { Certificates } from './collections/Certificates'
import { Cohorts } from './collections/Cohorts'
import { OtpCodes, Posts, Testimonials } from './collections/Content'
import { Coupons } from './collections/Coupons'
import { Courses } from './collections/Courses'
import { Enrollments } from './collections/Enrollments'
import { ImportConnections, ImportJobs, ImportNonces, ImportRefs, Redirects } from './collections/Import'
import { Leads } from './collections/Leads'
import { Lessons } from './collections/Lessons'
import { Attendance, LiveEvents, LiveSessions } from './collections/LiveSessions'
import { Media } from './collections/Media'
import { Memberships } from './collections/Memberships'
import { Orders } from './collections/Orders'
import { Questions } from './collections/Questions'
import { QuizAttempts } from './collections/QuizAttempts'
import { Quizzes } from './collections/Quizzes'
import { Roles } from './collections/Roles'
import { SubmissionFiles } from './collections/SubmissionFiles'
import { Submissions } from './collections/Submissions'
import { Tenants } from './collections/Tenants'
import { Users } from './collections/Users'
import { richTextEditor } from './lib/richText'
import { IMPORT_QUEUE, importTasks } from './lib/wpimport/tasks'
import { migrations } from './migrations'
import type { Config } from './payload-types'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: { titleSuffix: ' · Edvora' },
    // E-031 (Seal): brand marks, the selected academy's accent colour, a permission-aware landing block.
    // E-034: the login page wears the Seal card (academy seal as Logo, title before and the staff-door link after the form).
    components: {
      graphics: { Logo: '/components/admin/LoginSkin#LoginLogo', Icon: '/components/admin/Brand#Icon' },
      beforeLogin: ['/components/admin/LoginSkin#BeforeLogin'],
      afterLogin: ['/components/admin/LoginSkin#AfterLogin'],
      header: ['/components/admin/TenantAccent#TenantAccent'],
      beforeDashboard: ['/components/admin/DashboardHome#DashboardHome'],
    },
    // Dates with `timezone: true` (drip release, assignment deadline) are entered in Tehran time and stored UTC.
    timezones: { supportedTimezones: [{ label: 'تهران (Asia/Tehran)', value: 'Asia/Tehran' }], defaultTimezone: 'Asia/Tehran' },
  },
  i18n: {
    supportedLanguages: { fa, en },
    fallbackLanguage: 'fa',
  },
  collections: [
    Tenants,
    Users,
    Roles,
    Memberships,
    AuditLogs,
    Courses,
    Cohorts,
    Lessons,
    Enrollments,
    Questions,
    Quizzes,
    QuizAttempts,
    Assignments,
    Submissions,
    SubmissionFiles,
    LiveSessions,
    Attendance,
    LiveEvents,
    Certificates,
    Leads,
    Orders,
    Coupons,
    Testimonials,
    Posts,
    Media,
    OtpCodes,
    // E-032: WordPress import (ADR 011).
    ImportConnections,
    ImportNonces,
    ImportJobs,
    ImportRefs,
    Redirects,
  ],
  // E-032: first use of the Payload jobs queue (ADR 011 §Resumability). Each import task works ≤ 20 s, then re-queues
  // itself with its cursor. One app process runs the queue (IMPORT_QUEUE_AUTORUN=false on the others).
  jobs: {
    tasks: importTasks,
    autoRun: [{ cron: process.env.IMPORT_QUEUE_CRON || '* * * * *', queue: IMPORT_QUEUE, limit: 5 }],
    shouldAutoRun: () => process.env.IMPORT_QUEUE_AUTORUN !== 'false',
    deleteJobOnComplete: true,
    // Only server code queues or runs these tasks; nobody may through the REST API.
    access: { run: () => false, queue: () => false, cancel: () => false },
  },
  // E-031: one full-featured Lexical editor for every rich-text field (see lib/richText.ts).
  editor: richTextEditor,
  secret: process.env.PAYLOAD_SECRET ?? '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL ?? '' },
    // Dev pushes schema automatically. Staging/production apply committed migrations on boot.
    // After changing a collection: pnpm --filter @edvora/web payload migrate:create <name>
    push: process.env.NODE_ENV !== 'production',
    prodMigrations: migrations,
  }),
  sharp,
  plugins: [
    // E-017: Media files in the private S3 bucket (ArvanCloud in production) when S3_MEDIA=true; else local disk.
    // Payload keeps serving them through its own access-controlled URLs, so nothing becomes public.
    s3Storage({
      enabled: process.env.STORAGE_PROVIDER === 's3' && process.env.S3_MEDIA === 'true',
      collections: { media: { prefix: 'media' } },
      bucket: process.env.S3_BUCKET ?? '',
      config: {
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION || 'default',
        forcePathStyle: true,
        credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '', secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '' },
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      },
    }),
    multiTenantPlugin<Config>({
      tenantsSlug: 'tenants',
      // Every record below belongs to exactly one academy, with strict isolation.
      collections: {
        courses: {},
        cohorts: {},
        lessons: {},
        enrollments: {},
        certificates: {},
        leads: {},
        orders: {},
        coupons: {},
        testimonials: {},
        posts: {},
        media: {},
        // E-021: access is per academy.
        roles: {},
        memberships: {},
        'audit-logs': {},
        // E-026: quizzes, assignments, private submission files.
        questions: {},
        quizzes: {},
        'quiz-attempts': {},
        assignments: {},
        submissions: {},
        'submission-files': {},
        // E-033: live classes (ADR 012).
        'live-sessions': {},
        attendance: {},
        'live-events': {},
        // E-032: WordPress import.
        'import-connections': {},
        'import-nonces': {},
        'import-jobs': {},
        'import-refs': {},
        redirects: {},
      },
      // No hard delete: academies are never removed, so never cascade-delete their records.
      cleanupAfterTenantDelete: false,
      userHasAccessToAllTenants: (user) => isSuperAdmin(user),
      // Academy staff may set academies on users where they hold users.create / users.edit;
      // the Users beforeChange guard checks each added or removed academy.
      tenantsArrayField: {
        arrayFieldAccess: {
          create: async ({ req }) => {
            const ctx = await getAccess(req)
            const t = ctx ? tenantsWith(ctx, 'users.create') : []
            return t === 'all' || t.length > 0
          },
          update: async ({ req }) => {
            const ctx = await getAccess(req)
            const t = ctx ? tenantsWith(ctx, 'users.edit') : []
            return t === 'all' || t.length > 0
          },
        },
      },
      i18n: {
        translations: {
          fa: { 'nav-tenantSelector-label': 'آکادمی' },
        },
      },
    }),
  ],
})
