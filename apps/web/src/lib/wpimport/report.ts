/**
 * The dry-run report stored on `import-jobs.report` (W6): everything the review screen needs, without the full
 * drafts (those go to the private plan file at confirm). Sizes are capped so a 50k-user site stays a small JSON.
 */
import {
  COLLECTION_ORDER,
  type DraftAction,
  type EdvoraCollection,
  type ImportPlan,
  type ImportWarning,
  type Manifest,
  type MapperId,
  type ProductCourseLink,
} from '@edvora/integrations/wordpress'
import type { Payload } from 'payload'
import { WRITABLE } from './docValues'

const CAP = { warnings: 1500, redirects: 1000, media: 500, conflicts: 500, held: 2000 }

export type ImportReport = {
  generatedAt: string
  site: { siteId: string; homeUrl: string; name: string | null; wpVersion: string | null; phpVersion: string | null; locale: string | null }
  plugins: { slug: string; version: string }[]
  currencies: { woo: string | null; lifterlms: string | null; tutor: string | null }
  hpos: boolean | null
  detected: MapperId[]
  mappers: MapperId[]
  blocking: boolean
  counts: Record<EdvoraCollection, Record<DraftAction, number>>
  sourceCounts: Record<string, number>
  warnings: ImportWarning[]
  warningTotal: number
  productCourseMap: ProductCourseLink[]
  courseOptions: { refKey: string; title: string }[]
  existingCourses: { id: number; title: string }[]
  heldUsers: ImportPlan['heldUsers']
  staffUsers: ImportPlan['staffUsers']
  redirects: ImportPlan['redirects']
  redirectTotal: number
  media: { total: number; hosts: { host: string; count: number; needsApproval: boolean }[] }
  missingKinds: ImportPlan['missingKinds']
  notImported: Record<string, number>
  /** Drafts for collections Edvora does not have yet (pages until E-030). */
  notWritable: Partial<Record<EdvoraCollection, number>>
  conflicts: { refKey: string; collection: EdvoraCollection; title: string; targetId: string | number | null; reason: string | null }[]
}

export const titleOf = (fields: Record<string, unknown>): string =>
  String(fields.title ?? fields.name ?? fields.code ?? fields.holderName ?? fields.from ?? fields.alt ?? fields.text ?? '').slice(0, 120)

export async function buildReport(payload: Payload, tenant: { id: number }, plan: ImportPlan, manifest: Manifest): Promise<ImportReport> {
  const hosts = new Map<string, { count: number; needsApproval: boolean }>()
  for (const m of plan.mediaToPull) {
    let host = ''
    try {
      host = new URL(m.url).host
    } catch {
      host = '?'
    }
    const h = hosts.get(host) ?? { count: 0, needsApproval: m.needsHostApproval }
    h.count++
    hosts.set(host, h)
  }
  const existing = await payload.find({
    collection: 'courses',
    where: { tenant: { equals: tenant.id } },
    limit: 300,
    depth: 0,
    sort: 'title',
    overrideAccess: true,
    select: { title: true },
  })
  const notWritable: Partial<Record<EdvoraCollection, number>> = {}
  for (const c of COLLECTION_ORDER) if (!WRITABLE.has(c) && plan.drafts[c].length) notWritable[c] = plan.drafts[c].length
  const conflicts = COLLECTION_ORDER.flatMap((c) =>
    plan.drafts[c].filter((d) => d.action === 'conflict').map((d) => ({ refKey: d.refKey, collection: c, title: titleOf(d.fields), targetId: d.targetId ?? null, reason: d.reason ?? null })),
  )
  // Redirects to collections Edvora does not have yet (pages until E-030) are not written: keep them out of the preview.
  const unwritable = new Set(COLLECTION_ORDER.filter((c) => !WRITABLE.has(c)).flatMap((c) => plan.drafts[c].map((d) => d.refKey)))
  const redirects = plan.redirects.filter((r) => !unwritable.has(r.targetRefKey))
  // What will really happen: drafts of collections Edvora lacks, and redirects to them, are skipped at commit.
  const counts = JSON.parse(JSON.stringify(plan.counts)) as ImportPlan['counts']
  for (const c of COLLECTION_ORDER) {
    if (WRITABLE.has(c)) continue
    const row = counts[c]
    row.skipped += row.create + row.update
    row.create = 0
    row.update = 0
  }
  for (const d of plan.drafts.redirects) {
    const target = (d.fields.target as { $ref?: string } | undefined)?.$ref
    if (target && unwritable.has(target) && (d.action === 'create' || d.action === 'update')) {
      counts.redirects[d.action]--
      counts.redirects.skipped++
    }
  }
  const order: Record<string, number> = { blocking: 0, warn: 1, info: 2 }
  const warnings = [...plan.warnings].sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3))
  return {
    generatedAt: new Date().toISOString(),
    site: {
      siteId: manifest.site.siteId,
      homeUrl: manifest.site.homeUrl,
      name: manifest.site.name ?? null,
      wpVersion: manifest.site.wpVersion ?? null,
      phpVersion: manifest.site.phpVersion ?? null,
      locale: manifest.site.locale ?? null,
    },
    plugins: manifest.plugins.filter((p) => p.active !== false).map((p) => ({ slug: p.slug, version: p.version })),
    currencies: { woo: manifest.woo?.currency ?? null, lifterlms: manifest.lifterlms?.currency ?? null, tutor: manifest.tutor?.currency ?? null },
    hpos: manifest.woo ? Boolean(manifest.woo.hpos) : null,
    detected: plan.detected,
    mappers: plan.mappers,
    blocking: plan.blocking,
    counts,
    sourceCounts: plan.sourceCounts,
    warnings: warnings.slice(0, CAP.warnings),
    warningTotal: plan.warnings.length,
    productCourseMap: plan.productCourseMap,
    courseOptions: plan.drafts.courses.map((d) => ({ refKey: d.refKey, title: titleOf(d.fields) })),
    existingCourses: existing.docs.map((c) => ({ id: c.id, title: c.title })),
    heldUsers: plan.heldUsers.slice(0, CAP.held),
    staffUsers: plan.staffUsers,
    redirects: redirects.slice(0, CAP.redirects),
    redirectTotal: redirects.length,
    media: { total: plan.mediaToPull.length, hosts: [...hosts].map(([host, v]) => ({ host, ...v })) },
    missingKinds: plan.missingKinds,
    notImported: plan.notImported,
    notWritable,
    conflicts: conflicts.slice(0, CAP.conflicts),
  }
}
