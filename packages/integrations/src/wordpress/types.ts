/**
 * Draft/plan types shared by the mappers, the planner and apps/web. Pure types, no runtime imports.
 */
import type { PickedPhone } from '@edvora/core/wpimport'
import type { Manifest, SourceRecord } from './format'

export type MapperId = 'wp-core' | 'woocommerce' | 'lifterlms' | 'tutor'

/** Edvora collections a WordPress import writes to (`pages` arrives with E-030). */
export type EdvoraCollection =
  | 'users'
  | 'media'
  | 'courses'
  | 'lessons'
  | 'questions'
  | 'quizzes'
  | 'coupons'
  | 'orders'
  | 'enrollments'
  | 'certificates'
  | 'posts'
  | 'pages'
  | 'redirects'

/** Commit order: a draft may only hard-depend on drafts of an earlier collection. */
export const COLLECTION_ORDER: readonly EdvoraCollection[] = [
  'users',
  'media',
  'courses',
  'lessons',
  'questions',
  'quizzes',
  'coupons',
  'orders',
  'enrollments',
  'certificates',
  'posts',
  'pages',
  'redirects',
]

/** Relation to another draft (or a doc imported in an earlier run) by refKey; resolved via `import-refs`. */
export type DraftRef = { $ref: string }
/** Relation to an existing Edvora doc chosen by the admin (product→course override). */
export type DraftId = { $id: string | number }
export type DraftRelation = DraftRef | DraftId

export type Severity = 'blocking' | 'warn' | 'info'

export type WarningCode =
  | 'tenant_mismatch'
  | 'site_mismatch'
  | 'lms_conflict'
  | 'unknown_kind'
  | 'count_mismatch'
  | 'missing_kind'
  | 'no_phone'
  | 'invalid_phone'
  | 'duplicate_phone'
  | 'existing_user'
  | 'staff_role'
  | 'invalid_national_code'
  | 'invalid_email'
  | 'price_missing'
  | 'price_invalid'
  | 'price_suspicious'
  | 'recurring_plan'
  | 'sale_price_ignored'
  | 'unmapped_product'
  | 'ambiguous_product'
  | 'currency_invalid'
  | 'order_status_skipped'
  | 'orphan_order'
  | 'order_partial_refund'
  | 'order_fees_dropped'
  | 'coupon_invalid'
  | 'coupon_restrictions_dropped'
  | 'coupon_code_exists'
  | 'video_needs_action'
  | 'video_external'
  | 'shortcodes_removed'
  | 'page_builder'
  | 'question_type_unsupported'
  | 'question_invalid'
  | 'quiz_incomplete'
  | 'quiz_empty'
  | 'quiz_defaults'
  | 'quiz_attempts_not_imported'
  | 'enrollment_unresolved'
  | 'progress_dropped'
  | 'certificate_unresolved'
  | 'certificate_no_date'
  | 'course_empty'
  | 'duplicate_slug'
  | 'redirect_dropped'
  | 'media_video'
  | 'media_external_host'
  | 'not_imported'
  | 'membership_status'

export type ImportWarning = {
  code: WarningCode
  severity: Severity
  /** Source kind, or `plan` for site-level warnings. */
  kind: string
  wpId: string | null
  /** Persian, for the admin dry-run screen. */
  message: string
  detail?: Record<string, unknown>
}

export type HoldReason = 'no_phone' | 'duplicate_phone' | 'unmapped_product' | 'depends_on_held'

export type EdvoraDraft = {
  collection: EdvoraCollection
  /** `<siteId>:<kind>:<wpId>`; `kind` may be synthetic (`edvora.enrollment`, `edvora.redirect`). */
  refKey: string
  kind: string
  wpId: string
  mapper: MapperId
  /** Edvora field values. Relations are `DraftRef`/`DraftId` objects (or arrays of them). Money in rials. */
  fields: Record<string, unknown>
  /** refKeys this draft cannot exist without (held/skipped propagate). Other `$ref`s are soft and pruned. */
  dependsOn: string[]
  /** Higher wins per field when several drafts share a refKey (Woo product price 20 > LMS plan 10). */
  precedence: number
  /** Only contributes fields to a draft another mapper creates; dropped when that draft does not exist. */
  patchOnly?: boolean
  hold?: { reason: HoldReason; detail?: Record<string, unknown> }
  skip?: { reason: string }
  /** Fields merged as a set union on update (progress never decreases), excluded from the conflict check. */
  unionFields?: string[]
  /** Admin-facing notes kept with the draft (e.g. original WP status). */
  notes?: string[]
}

export type DraftAction = 'create' | 'update' | 'unchanged' | 'conflict' | 'held' | 'skipped'

export type PlannedDraft = EdvoraDraft & {
  action: DraftAction
  reason?: string
  /** Edvora doc id for update/unchanged/conflict (from `import-refs`) or for an existing user matched by phone. */
  targetId?: string | number
  /** Existing user found by phone: only add the tenant membership, never overwrite the profile. */
  attachTenantOnly?: boolean
  /** sha256 of canonical JSON of `{ mappingVersion, fields }`; store as `import-refs.sourceChecksum`. */
  sourceChecksum: string
  /** Fields whose written values form `import-refs.writtenChecksum` (use `fieldsChecksum`). */
  checksumFields: string[]
}

/** Lookups the planner needs from Edvora (apps/web implements them; all tenant-scoped). */
export type ImportRef = {
  targetId: string | number | null
  status: 'linked' | 'held' | 'conflict' | 'skipped'
  sourceChecksum: string | null
  writtenChecksum: string | null
}

export type ProductCourseOverride =
  /** Map to a course draft (refKey from the plan's productCourseMap candidates). */
  | { course: string }
  /** Map to an existing Edvora course. */
  | { courseId: string | number }
  /** Import the product itself as a course. */
  | 'standalone'
  /** Not a course: its order lines are skipped. */
  | 'skip'

export type PlanContext = {
  tenantSlug: string
  siteId: string
  productCourseOverrides?: Record<string, ProductCourseOverride>
  /** Restrict mappers (resolves the LifterLMS + Tutor conflict). `wp-core` always runs. */
  enabledMappers?: MapperId[]
  findRef: (kind: string, wpId: string) => Promise<ImportRef | null>
  /** Any tenant: phone is global and unique. */
  findUserByPhone: (phone: string) => Promise<{ id: string | number } | null>
  /** `fieldsChecksum` of the doc's current values for `fields`, or null when the doc no longer exists. */
  currentChecksum: (collection: EdvoraCollection, id: string | number, fields: string[]) => Promise<string | null>
  /** Optional: an Edvora coupon with this code already exists in the tenant (not from this import). */
  findCouponByCode?: (code: string) => Promise<{ id: string | number } | null>
  /** Edvora public paths for redirect targets. */
  paths?: Partial<EdvoraPaths>
  now?: Date
}

export type EdvoraPaths = {
  course: (slug: string) => string
  post: (slug: string) => string
  page: (slug: string) => string
}

export type ProductCourseMethod = 'override' | 'tutor-meta' | 'link-meta' | 'title' | 'standalone' | 'skip' | 'unmapped'

export type ProductCourseLink = {
  productWpId: string
  productTitle: string
  method: ProductCourseMethod
  /** refKey of the course draft, when mapped to one. */
  courseRefKey: string | null
  /** Existing Edvora course id (override). */
  courseId: string | number | null
  courseTitle: string | null
  /** Courses the admin may pick: several exact title matches (`ambiguous`) or similar titles (`similar`). */
  candidates: { refKey: string; title: string }[]
  hint: 'ambiguous' | 'similar' | null
  /** Order lines + memberships that need this product mapped. */
  usage: number
}

/** Read-only view of every source record (built by the planner). */
export type SourceIndex = {
  manifest: Manifest
  all(kind: string): readonly SourceRecord[]
  get(kind: string, wpId: string): SourceRecord | undefined
  kinds(): string[]
}

export type UserPhoneInfo = PickedPhone & { duplicateOf: string[] }

export type MapContext = {
  siteId: string
  tenantSlug: string
  index: SourceIndex
  manifest: Manifest
  now: Date
  paths: EdvoraPaths
  /** Mappers that run in this plan. */
  mappers: readonly MapperId[]
  /** True when LifterLMS or Tutor runs (Woo products then are not courses by themselves). */
  lmsActive: boolean
  refKey(kind: string, wpId: string): string
  ref(kind: string, wpId: string): DraftRef
  warn(w: ImportWarning): void
  /** Counts something that is reported but not imported (`plan.notImported`). */
  notImported(what: string, n?: number): void
  /** Picked phone per WP user id (`pickPhone` + duplicate detection). */
  userPhone(userWpId: string): UserPhoneInfo | undefined
  /** WP user id whose picked phone equals `phone` (guest orders), when unique. */
  userByPhone(phone: string): string | undefined
  product(productWpId: string): ProductCourseLink | undefined
}

export type StackMapper = {
  id: MapperId
  /** Record kinds it consumes. */
  kinds: readonly string[]
  /** Plugin detection by canonical slug (FORMAT.md §3). */
  detect(m: Manifest): boolean
  /** Pure: all drafts for this stack. Warnings go to `ctx.warn`. */
  map(ctx: MapContext): EdvoraDraft[]
}

export type HeldUser = {
  refKey: string
  wpId: string
  reason: 'no_phone' | 'duplicate_phone'
  name: string | null
  contactEmail: string | null
  /** Normalised phone shared with `duplicateOf` (duplicate_phone only). */
  phone: string | null
  duplicateOf: string[]
  invalidCandidates: { source: string; value: string }[]
}

export type MediaPull = {
  refKey: string
  wpId: string
  url: string
  mimeType: string | null
  /** Host differs from the site's home/uploads host: the admin must approve it (SSRF rule, ADR 011). */
  needsHostApproval: boolean
}

export type RedirectDraft = { from: string; to: string; code: 301; targetRefKey: string }

export type MissingKind = { kind: string; reason: string }

export type ImportPlan = {
  siteId: string
  tenantSlug: string
  mappingVersion: number
  mappers: MapperId[]
  detected: MapperId[]
  drafts: Record<EdvoraCollection, PlannedDraft[]>
  counts: Record<EdvoraCollection, Record<DraftAction, number>>
  sourceCounts: Record<string, number>
  warnings: ImportWarning[]
  /** True when any blocking warning exists: commit must not start. */
  blocking: boolean
  productCourseMap: ProductCourseLink[]
  heldUsers: HeldUser[]
  /** WP staff imported as plain users, for manual role assignment. */
  staffUsers: { refKey: string; wpId: string; name: string | null; wpRoles: string[] }[]
  redirects: RedirectDraft[]
  mediaToPull: MediaPull[]
  missingKinds: MissingKind[]
  /** Counted, not imported (quiz attempts, LifterLMS orders, events …). */
  notImported: Record<string, number>
}
