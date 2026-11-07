/**
 * Dry-run planner (ADR 011 §Pipeline 3–5): reads every record, runs the detected mappers, merges drafts,
 * decides create/update/unchanged/conflict/held/skipped against Edvora via injected lookups. Never writes,
 * never produces a delete.
 */
import { toPersianDigits as fa } from '@edvora/core/digits'
import { checksum, MAPPING_VERSION } from './checksum'
import type { Manifest, SourceRecord } from './format'
import { lifterlmsMapper } from './mappers/lifterlms'
import { tutorMapper } from './mappers/tutor'
import { parseRefKey, refsIn } from './mappers/util'
import { proposeProductCourseMap, woocommerceMapper } from './mappers/woocommerce'
import { computeUserPhones, wpCoreMapper } from './mappers/wp-core'
import type { WordPressSource } from './sources'
import {
  COLLECTION_ORDER,
  type DraftAction,
  type EdvoraCollection,
  type EdvoraDraft,
  type EdvoraPaths,
  type HeldUser,
  type ImportPlan,
  type ImportRef,
  type ImportWarning,
  type MapContext,
  type MapperId,
  type MediaPull,
  type PlanContext,
  type PlannedDraft,
  type RedirectDraft,
  type SourceIndex,
  type StackMapper,
} from './types'

export const DEFAULT_MAPPERS: readonly StackMapper[] = [wpCoreMapper, woocommerceMapper, lifterlmsMapper, tutorMapper]

export const DEFAULT_PATHS: EdvoraPaths = {
  course: (slug) => `/courses/${slug}`,
  post: (slug) => `/blog/${slug}`,
  page: (slug) => `/${slug}`,
}

const READ_PAGE = 500
const LOOKUP_CONCURRENCY = 16
const ACTIONS: readonly DraftAction[] = ['create', 'update', 'unchanged', 'conflict', 'held', 'skipped']

function buildIndex(manifest: Manifest, byKind: Map<string, SourceRecord[]>): SourceIndex {
  const byId = new Map<string, Map<string, SourceRecord>>()
  for (const [kind, list] of byKind) byId.set(kind, new Map(list.map((r) => [r.wpId, r])))
  return {
    manifest,
    all: (kind) => byKind.get(kind) ?? [],
    get: (kind, wpId) => byId.get(kind)?.get(wpId),
    kinds: () => [...byKind.keys()],
  }
}

async function readAll(source: WordPressSource, kind: string): Promise<SourceRecord[]> {
  const out: SourceRecord[] = []
  let cursor: string | null = null
  for (let guard = 0; guard < 1_000_000; guard++) {
    const page: { records: SourceRecord[]; next: string | null } = await source.read(kind, cursor, READ_PAGE)
    out.push(...page.records.filter((r) => r.kind === kind))
    if (!page.next || page.next === cursor) break
    cursor = page.next
  }
  return out
}

async function pool<T>(items: readonly T[], fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0
  const workers = Array.from({ length: Math.min(LOOKUP_CONCURRENCY, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++]
      if (item !== undefined) await fn(item)
    }
  })
  await Promise.all(workers)
}

/** Merges drafts sharing a refKey: fields by ascending precedence (undefined never overwrites). */
function mergeDrafts(drafts: EdvoraDraft[]): EdvoraDraft[] {
  const groups = new Map<string, EdvoraDraft[]>()
  for (const d of drafts) groups.set(d.refKey, [...(groups.get(d.refKey) ?? []), d])
  const out: EdvoraDraft[] = []
  for (const group of groups.values()) {
    const bases = group.filter((d) => !d.patchOnly)
    if (!bases.length) continue
    const sorted = [...group].sort((a, b) => a.precedence - b.precedence)
    const base = [...bases].sort((a, b) => b.precedence - a.precedence)[0] as EdvoraDraft
    const fields: Record<string, unknown> = {}
    for (const d of sorted) for (const [k, v] of Object.entries(d.fields)) if (v !== undefined) fields[k] = v
    const merged: EdvoraDraft = {
      ...base,
      fields,
      dependsOn: [...new Set(group.flatMap((d) => d.dependsOn))],
      precedence: base.precedence,
      patchOnly: undefined,
      notes: [...new Set(group.flatMap((d) => d.notes ?? []))],
    }
    const unionFields = [...new Set(group.flatMap((d) => d.unionFields ?? []))]
    if (unionFields.length) merged.unionFields = unionFields
    delete merged.patchOnly
    if (!merged.notes?.length) delete merged.notes
    out.push(merged)
  }
  return out
}

function dedupeSlugs(drafts: EdvoraDraft[], warn: (w: ImportWarning) => void): void {
  for (const collection of ['courses', 'posts', 'pages'] as const) {
    const seen = new Set<string>()
    for (const d of drafts) {
      if (d.collection !== collection || typeof d.fields.slug !== 'string') continue
      const original = d.fields.slug
      let slug = original
      for (let n = 2; seen.has(slug); n++) slug = `${original}-${n}`
      seen.add(slug)
      if (slug !== original) {
        d.fields.slug = slug
        warn({ code: 'duplicate_slug', severity: 'warn', kind: d.kind, wpId: d.wpId, message: `نشانی «${original}» تکراری بود و به «${slug}» تغییر کرد.`, detail: { original, slug } })
      }
    }
  }
}

/** Final public path of each redirect target (lessons → their course). Redirects without one are dropped. */
function resolveRedirects(drafts: EdvoraDraft[], paths: EdvoraPaths, warn: (w: ImportWarning) => void): EdvoraDraft[] {
  const byRef = new Map(drafts.map((d) => [d.refKey, d]))
  const pathOf = (refKey: string, depth = 0): string | null => {
    const d = byRef.get(refKey)
    if (!d || depth > 2) return null
    const slug = typeof d.fields.slug === 'string' ? d.fields.slug : null
    if (d.collection === 'courses' && slug) return paths.course(slug)
    if (d.collection === 'posts' && slug) return paths.post(slug)
    if (d.collection === 'pages' && slug) return paths.page(slug)
    const course = d.fields.course as { $ref?: unknown } | undefined
    if (d.collection === 'lessons' && typeof course?.$ref === 'string') return pathOf(course.$ref, depth + 1)
    return null
  }
  return drafts.filter((d) => {
    if (d.collection !== 'redirects') return true
    const target = (d.fields.target as { $ref: string }).$ref
    const to = pathOf(target)
    const from = String(d.fields.from)
    const toNorm = to ? decodeURIComponent(to).toLowerCase().replace(/\/+$/, '') : null
    if (to && toNorm === from) return false // same path in Edvora: nothing to redirect
    if (!to || from === '/') {
      warn({ code: 'redirect_dropped', severity: 'info', kind: 'edvora.redirect', wpId: from, message: `تغییر مسیر ${from} ساخته نمی‌شود (مقصد ندارد یا با مبدأ یکی است).` })
      return false
    }
    d.fields.to = to
    return true
  })
}

/**
 * The pure mapping context (index, phones, product → course map). Exported for mapper unit tests and for
 * apps/web tools that want to preview one stack without the Edvora lookups.
 */
export function buildMapContext(i: {
  manifest: Manifest
  records: Map<string, SourceRecord[]> | readonly SourceRecord[]
  siteId: string
  tenantSlug: string
  mappers: readonly MapperId[]
  overrides?: PlanContext['productCourseOverrides']
  now?: Date
  paths?: Partial<EdvoraPaths>
  warn?: (w: ImportWarning) => void
  notImported?: Record<string, number>
}) {
  let byKind: Map<string, SourceRecord[]>
  if (i.records instanceof Map) byKind = i.records
  else {
    byKind = new Map()
    for (const r of i.records as readonly SourceRecord[]) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r])
  }
  const index = buildIndex(i.manifest, byKind)
  const phones = computeUserPhones(index)
  const phoneOwner = new Map<string, string>()
  for (const [wpId, info] of phones) if (info.phone && !info.duplicateOf.length) phoneOwner.set(info.phone, wpId)
  const productCourseMap = proposeProductCourseMap(index, { siteId: i.siteId, mappers: i.mappers, overrides: i.overrides })
  const products = new Map(productCourseMap.map((l) => [l.productWpId, l]))
  const paths: EdvoraPaths = { ...DEFAULT_PATHS, ...i.paths }
  const refKey = (kind: string, wpId: string) => `${i.siteId}:${kind}:${wpId}`
  const counter = i.notImported ?? {}
  const warn = i.warn ?? (() => undefined)
  const mapCtx: MapContext = {
    siteId: i.siteId,
    tenantSlug: i.tenantSlug,
    index,
    manifest: i.manifest,
    now: i.now ?? new Date(),
    paths,
    mappers: i.mappers,
    lmsActive: i.mappers.includes('lifterlms') || i.mappers.includes('tutor'),
    refKey,
    ref: (kind, wpId) => ({ $ref: refKey(kind, wpId) }),
    warn,
    notImported: (what, n = 1) => {
      counter[what] = (counter[what] ?? 0) + n
    },
    userPhone: (wpId) => phones.get(wpId),
    userByPhone: (phone) => phoneOwner.get(phone),
    product: (wpId) => products.get(wpId),
  }
  return { mapCtx, phones, productCourseMap, paths, index }
}

/** Builds the dry-run plan. Pure apart from the injected lookups and the source reads. */
export async function planImport(input: { source: WordPressSource; mappers?: readonly StackMapper[]; ctx: PlanContext }): Promise<ImportPlan> {
  const { source, ctx } = input
  const allMappers = input.mappers ?? DEFAULT_MAPPERS
  const warnings: ImportWarning[] = []
  const warn = (w: ImportWarning) => warnings.push(w)
  const notImported: Record<string, number> = {}
  const manifest = await source.manifest()

  if (manifest.tenantSlug !== ctx.tenantSlug) {
    warn({ code: 'tenant_mismatch', severity: 'blocking', kind: 'plan', wpId: null, message: `این خروجی برای آکادمی «${manifest.tenantSlug}» ساخته شده و در آکادمی «${ctx.tenantSlug}» قابل ورود نیست.` })
  }
  if (manifest.site.siteId !== ctx.siteId) {
    warn({ code: 'site_mismatch', severity: 'blocking', kind: 'plan', wpId: null, message: 'این خروجی از سایت دیگری است؛ برای سایت جدید یک مهاجرت تازه بسازید.', detail: { expected: ctx.siteId, got: manifest.site.siteId } })
  }

  const detected = allMappers.filter((m) => m.detect(manifest)).map((m) => m.id)
  const enabled = allMappers.filter((m) => m.id === 'wp-core' || (detected.includes(m.id) && (!ctx.enabledMappers || ctx.enabledMappers.includes(m.id))))
  const ids = enabled.map((m) => m.id)
  if (ids.includes('lifterlms') && ids.includes('tutor')) {
    warn({ code: 'lms_conflict', severity: 'blocking', kind: 'plan', wpId: null, message: 'هم LifterLMS و هم Tutor روی سایت فعال‌اند؛ یکی را برای انتقال انتخاب کنید.' })
  }

  // Read every kind the enabled mappers consume.
  const byKind = new Map<string, SourceRecord[]>()
  const sourceCounts: Record<string, number> = {}
  for (const kind of [...new Set(enabled.flatMap((m) => m.kinds))]) {
    const records = await readAll(source, kind)
    if (records.length) byKind.set(kind, records)
    sourceCounts[kind] = records.length
    const expected = manifest.counts[kind]
    if (expected !== undefined && expected !== records.length) {
      warn({ code: 'count_mismatch', severity: 'blocking', kind, wpId: null, message: `تعداد رکوردهای ${kind} با فهرست خروجی نمی‌خواند (${fa(records.length)} از ${fa(expected)})؛ خروجی ناقص است.`, detail: { expected, got: records.length } })
    }
  }
  const consumed = new Set(enabled.flatMap((m) => m.kinds))
  for (const [kind, n] of Object.entries(manifest.counts)) {
    if (!consumed.has(kind) && n > 0) {
      notImported[kind] = (notImported[kind] ?? 0) + n
      warn({ code: 'unknown_kind', severity: 'info', kind, wpId: null, message: `${fa(n)} رکورد ${kind} وارد نمی‌شود (برای این نوع داده مبدّلی فعال نیست).` })
    }
  }
  const missingKinds = (await source.missingKinds?.()) ?? []
  for (const m of missingKinds) warn({ code: 'missing_kind', severity: 'warn', kind: m.kind, wpId: null, message: m.reason })

  const { mapCtx, phones, productCourseMap, paths } = buildMapContext({
    manifest,
    records: byKind,
    siteId: ctx.siteId,
    tenantSlug: ctx.tenantSlug,
    mappers: ids,
    overrides: ctx.productCourseOverrides,
    now: ctx.now,
    paths: ctx.paths,
    warn,
    notImported,
  })

  let drafts = mergeDrafts(enabled.flatMap((m) => m.map(mapCtx)))
  dedupeSlugs(drafts, warn)
  drafts = resolveRedirects(drafts, paths, warn)

  // ---- actions
  const refCache = new Map<string, Promise<ImportRef | null>>()
  const findRef = (kind: string, wpId: string) => {
    const k = `${kind}\u0000${wpId}`
    let p = refCache.get(k)
    if (!p) {
      p = ctx.findRef(kind, wpId)
      refCache.set(k, p)
    }
    return p
  }
  const planned = new Map<string, PlannedDraft>()
  const byCollection = new Map<EdvoraCollection, EdvoraDraft[]>()
  for (const d of drafts) byCollection.set(d.collection, [...(byCollection.get(d.collection) ?? []), d])

  const linkedOutside = async (dep: string): Promise<boolean> => {
    const parsed = parseRefKey(dep)
    if (!parsed) return false
    const ref = await findRef(parsed.kind, parsed.wpId)
    return Boolean(ref && ref.status === 'linked' && ref.targetId !== null)
  }

  for (const collection of COLLECTION_ORDER) {
    const list = byCollection.get(collection) ?? []
    await pool(list, async (d) => {
      const checksumFields = Object.keys(d.fields)
        .filter((k) => d.fields[k] !== undefined && !(d.unionFields ?? []).includes(k))
        .sort()
      const p: PlannedDraft = { ...d, action: 'create', sourceChecksum: checksum({ v: MAPPING_VERSION, collection: d.collection, fields: d.fields }), checksumFields }

      // Hard dependencies first (they were decided in an earlier collection).
      for (const dep of d.dependsOn) {
        const depDraft = planned.get(dep)
        if (depDraft) {
          if (depDraft.action === 'held') {
            p.action = 'held'
            p.reason = 'depends_on_held'
          } else if (depDraft.action === 'skipped') {
            p.action = 'skipped'
            p.reason = 'depends_on_skipped'
          }
        } else if (!(await linkedOutside(dep))) {
          p.action = 'skipped'
          p.reason = 'missing_dependency'
        }
        if (p.action !== 'create') break
      }
      if (p.action === 'create' && d.skip) {
        p.action = 'skipped'
        p.reason = d.skip.reason
      } else if (p.action === 'create' && d.hold) {
        p.action = 'held'
        p.reason = d.hold.reason
      }
      if (p.action === 'create') {
        const ref = await findRef(d.kind, d.wpId)
        if (ref && ref.targetId !== null && ref.status !== 'held' && ref.status !== 'skipped') {
          p.targetId = ref.targetId
          if (ref.sourceChecksum === p.sourceChecksum) p.action = 'unchanged'
          else {
            const current = await ctx.currentChecksum(d.collection, ref.targetId, checksumFields)
            if (current === null) {
              p.action = 'conflict'
              p.reason = 'target_missing'
            } else if (ref.writtenChecksum !== null && current === ref.writtenChecksum) p.action = 'update'
            else {
              p.action = 'conflict'
              p.reason = 'edited_in_edvora'
            }
          }
        } else if (collection === 'users' && typeof d.fields.phone === 'string') {
          const existing = await ctx.findUserByPhone(d.fields.phone)
          if (existing) {
            p.action = 'update'
            p.targetId = existing.id
            p.attachTenantOnly = true
            p.checksumFields = []
            warn({ code: 'existing_user', severity: 'info', kind: d.kind, wpId: d.wpId, message: `کاربری با همین شماره در ادوورا هست؛ فقط عضویت این آکادمی به او اضافه می‌شود و نمایه‌اش تغییر نمی‌کند.` })
          }
        } else if (collection === 'coupons' && typeof d.fields.code === 'string' && ctx.findCouponByCode) {
          const existing = await ctx.findCouponByCode(d.fields.code)
          if (existing) {
            p.action = 'conflict'
            p.reason = 'coupon_code_exists'
            p.targetId = existing.id
            warn({ code: 'coupon_code_exists', severity: 'warn', kind: d.kind, wpId: d.wpId, message: `کد تخفیف ${d.fields.code} از قبل در ادوورا هست و بازنویسی نمی‌شود.` })
          }
        }
      }
      planned.set(d.refKey, p)
    })
  }

  // ---- prune soft references to drafts that will not exist
  const softOk = new Map<string, boolean>()
  const softTargets = new Set<string>()
  for (const p of planned.values()) for (const r of refsIn(p.fields)) if (!p.dependsOn.includes(r)) softTargets.add(r)
  await pool([...softTargets], async (r) => {
    const target = planned.get(r)
    softOk.set(r, target ? target.action !== 'held' && target.action !== 'skipped' : await linkedOutside(r))
  })
  const prune = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(prune).filter((v) => v !== undefined)
    if (value && typeof value === 'object') {
      const ref = (value as { $ref?: unknown }).$ref
      if (typeof ref === 'string') return softOk.get(ref) === false ? undefined : value
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value)) out[k] = prune(v)
      return out
    }
    return value
  }
  for (const p of planned.values()) {
    const keep = new Set(p.dependsOn)
    for (const [k, v] of Object.entries(p.fields)) {
      if (refsIn(v).every((r) => keep.has(r))) continue
      p.fields[k] = prune(v)
    }
  }

  // ---- outputs
  const empty = () => Object.fromEntries(ACTIONS.map((a) => [a, 0])) as Record<DraftAction, number>
  const out = Object.fromEntries(COLLECTION_ORDER.map((c) => [c, [] as PlannedDraft[]])) as Record<EdvoraCollection, PlannedDraft[]>
  const counts = Object.fromEntries(COLLECTION_ORDER.map((c) => [c, empty()])) as Record<EdvoraCollection, Record<DraftAction, number>>
  const order = new Map(drafts.map((d, i) => [d.refKey, i]))
  for (const p of [...planned.values()].sort((a, b) => (order.get(a.refKey) ?? 0) - (order.get(b.refKey) ?? 0))) {
    out[p.collection].push(p)
    counts[p.collection][p.action]++
  }

  const heldUsers: HeldUser[] = out.users
    .filter((u) => u.action === 'held' && (u.reason === 'no_phone' || u.reason === 'duplicate_phone'))
    .map((u) => {
      const info = phones.get(u.wpId)
      return {
        refKey: u.refKey,
        wpId: u.wpId,
        reason: u.reason as HeldUser['reason'],
        name: typeof u.fields.name === 'string' ? u.fields.name : null,
        contactEmail: typeof u.fields.contactEmail === 'string' ? u.fields.contactEmail : null,
        phone: u.reason === 'duplicate_phone' ? (info?.phone ?? null) : null,
        duplicateOf: info?.duplicateOf ?? [],
        invalidCandidates: info?.invalidCandidates ?? [],
      }
    })
  const staffUsers = out.users
    .map((u) => ({ u, roles: (u.notes ?? []).find((n) => n.startsWith('wpRoles:'))?.slice(8).split(',') ?? [] }))
    .filter((x) => x.roles.length)
    .map(({ u, roles }) => ({ refKey: u.refKey, wpId: u.wpId, name: typeof u.fields.name === 'string' ? u.fields.name : null, wpRoles: roles }))

  const siteHosts = new Set([manifest.site.homeUrl, manifest.site.uploadsBaseUrl, manifest.site.siteUrl].flatMap((u) => {
    try {
      return u ? [new URL(u).host] : []
    } catch {
      return []
    }
  }))
  const mediaToPull: MediaPull[] = out.media
    .filter((m) => (m.action === 'create' || m.action === 'update') && typeof m.fields.sourceUrl === 'string')
    .map((m) => {
      const url = String(m.fields.sourceUrl)
      let host = ''
      try {
        host = new URL(url).host
      } catch {
        host = ''
      }
      return { refKey: m.refKey, wpId: m.wpId, url, mimeType: typeof m.fields.mimeType === 'string' ? m.fields.mimeType : null, needsHostApproval: !siteHosts.has(host) }
    })
  for (const m of mediaToPull.filter((x) => x.needsHostApproval)) {
    warn({ code: 'media_external_host', severity: 'warn', kind: 'wp.attachment', wpId: m.wpId, message: `فایل ${m.url} روی دامنهٔ دیگری است؛ پیش از دریافت، آن دامنه را تأیید کنید.` })
  }
  const redirects: RedirectDraft[] = out.redirects
    .filter((r) => r.action !== 'skipped' && r.action !== 'held')
    .map((r) => ({ from: String(r.fields.from), to: String(r.fields.to), code: 301, targetRefKey: (r.fields.target as { $ref: string }).$ref }))

  return {
    siteId: ctx.siteId,
    tenantSlug: ctx.tenantSlug,
    mappingVersion: MAPPING_VERSION,
    mappers: ids as MapperId[],
    detected,
    drafts: out,
    counts,
    sourceCounts,
    warnings,
    blocking: warnings.some((w) => w.severity === 'blocking'),
    productCourseMap,
    heldUsers,
    staffUsers,
    redirects,
    mediaToPull,
    missingKinds,
    notImported,
  }
}
