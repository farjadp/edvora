import { postgresAdapter } from '@payloadcms/db-postgres'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { en } from '@payloadcms/translations/languages/en'
import { fa } from '@payloadcms/translations/languages/fa'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { isSuperAdmin } from './access/roles'
import { Certificates } from './collections/Certificates'
import { Cohorts } from './collections/Cohorts'
import { OtpCodes, Posts, Testimonials } from './collections/Content'
import { Coupons } from './collections/Coupons'
import { Courses } from './collections/Courses'
import { Enrollments } from './collections/Enrollments'
import { Leads } from './collections/Leads'
import { Lessons } from './collections/Lessons'
import { Media } from './collections/Media'
import { Orders } from './collections/Orders'
import { Tenants } from './collections/Tenants'
import { Users } from './collections/Users'
import { migrations } from './migrations'
import type { Config } from './payload-types'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: { titleSuffix: ' · Edvora' },
  },
  i18n: {
    supportedLanguages: { fa, en },
    fallbackLanguage: 'fa',
  },
  collections: [
    Tenants,
    Users,
    Courses,
    Cohorts,
    Lessons,
    Enrollments,
    Certificates,
    Leads,
    Orders,
    Coupons,
    Testimonials,
    Posts,
    Media,
    OtpCodes,
  ],
  editor: lexicalEditor(),
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
      },
      userHasAccessToAllTenants: (user) => isSuperAdmin(user),
      i18n: {
        translations: {
          fa: { 'nav-tenantSelector-label': 'آکادمی' },
        },
      },
    }),
  ],
})
