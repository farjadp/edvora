import { collectLexicalRefs, crossTenantRefs, toLexical, type LexicalRef, type TenantId } from '@edvora/core/richtext'
import {
  AlignFeature,
  BlockquoteFeature,
  BoldFeature,
  ChecklistFeature,
  EXPERIMENTAL_TableFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  IndentFeature,
  InlineCodeFeature,
  InlineToolbarFeature,
  ItalicFeature,
  lexicalEditor,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  StrikethroughFeature,
  UnderlineFeature,
  UnorderedListFeature,
  UploadFeature,
} from '@payloadcms/richtext-lexical'
import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'
import type { CollectionSlug, FieldAccess, FieldHook, FilterOptionsProps, RichTextField } from 'payload'
import { idOf } from './ids'
import { throwFieldErrors } from './validation'

/**
 * E-031: the one rich-text editor used everywhere in /admin (Payload Lexical only; no CDN, no outside editor).
 *
 * Tenant isolation: uploads go to the tenant-scoped `media` collection and internal links point at tenant-scoped
 * `courses` / `lessons`. The upload and link drawers list only the selected academy's documents (the multi-tenant
 * plugin's `baseFilter`, which Payload's list drawer and Lexical's link field apply). That is UI only, so every
 * rich-text field built with `richTextField()` also checks on the server that each referenced document belongs to
 * the record's academy (`tenantGuard` below) — a REST/GraphQL write can't smuggle in another academy's media.
 */

/** Collections a rich-text value may reference that belong to one academy. */
export const RICH_TEXT_SCOPED_COLLECTIONS = ['media', 'courses', 'lessons'] as const satisfies readonly CollectionSlug[]
export const RICH_TEXT_LINK_COLLECTIONS: CollectionSlug[] = ['courses', 'lessons']

/**
 * Payload ships the Persian heading label as the literal "[SKIPPED]", so H2/H3/H4 would look identical in the picker.
 * A config-level translation can't override it (the feature's strings are merged last), so patch the feature's own.
 */
function headingFeature(props: Parameters<typeof HeadingFeature>[0]): ReturnType<typeof HeadingFeature> {
  const provider = HeadingFeature(props)
  const feature = provider.feature
  return {
    ...provider,
    feature: async (args) => {
      const resolved = typeof feature === 'function' ? await feature(args) : feature
      return { ...resolved, i18n: { ...resolved.i18n, fa: { label: 'عنوان {{headingLevel}}' } } }
    },
  }
}

export const richTextEditor = lexicalEditor({
  features: () => [
    ParagraphFeature(),
    headingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
    BoldFeature(),
    ItalicFeature(),
    UnderlineFeature(),
    StrikethroughFeature(),
    InlineCodeFeature(),
    LinkFeature({
      enabledCollections: RICH_TEXT_LINK_COLLECTIONS,
      maxDepth: 1,
      // The internal-link picker is not covered by the multi-tenant plugin's filter: scope it to the selected academy.
      fields: ({ defaultFields }) =>
        defaultFields.map((field) =>
          'name' in field && field.name === 'doc' && field.type === 'relationship'
            ? {
                ...field,
                filterOptions: ({ req }: FilterOptionsProps) => {
                  const tenant = getTenantFromCookie(req.headers, 'number')
                  if (typeof tenant !== 'number') return true
                  // courses and lessons both carry `tenant`.
                  return { tenant: { equals: tenant } }
                },
              }
            : field,
        ),
    }),
    UnorderedListFeature(),
    OrderedListFeature(),
    ChecklistFeature(),
    BlockquoteFeature(),
    HorizontalRuleFeature(),
    AlignFeature(),
    IndentFeature(),
    EXPERIMENTAL_TableFeature(),
    // Images go into Media; Media requires alt text, so every inserted image has one.
    UploadFeature({ enabledCollections: ['media'], maxDepth: 1 }),
    FixedToolbarFeature(),
    InlineToolbarFeature(),
  ],
})

type Doc = Record<string, unknown>

/** Which academies a record's rich text may reference. Default: the record's own `tenant`. */
export type TenantsOf = (doc: Doc) => TenantId[]

export const recordTenant: TenantsOf = (doc) => {
  const t = idOf(doc.tenant)
  return t === null ? [] : [t]
}

/** The tenant record itself (Tenants collection). */
export const tenantSelf: TenantsOf = (doc) => {
  const t = idOf(doc.id)
  return t === null ? [] : [t]
}

/** Users: any academy the person belongs to. */
export const userTenants: TenantsOf = (doc) =>
  (Array.isArray(doc.tenants) ? doc.tenants : []).map((row: unknown) => idOf((row as { tenant?: unknown } | null)?.tenant)).filter((x): x is number => x !== null)

const isScoped = (slug: string): slug is (typeof RICH_TEXT_SCOPED_COLLECTIONS)[number] => (RICH_TEXT_SCOPED_COLLECTIONS as readonly string[]).includes(slug)

/** Legacy plain text written through the API (or by an importer) becomes Lexical before validation. */
const normalise: FieldHook = ({ value }) => (value === undefined ? value : toLexical(value))

function tenantGuard(tenantsOf: TenantsOf): FieldHook {
  return async ({ value, data, originalDoc, req, path, collection }) => {
    const refs = collectLexicalRefs(value)
    if (refs.length === 0) return value
    const doc = { ...((originalDoc as Doc | undefined) ?? {}), ...((data as Doc | undefined) ?? {}) }
    const allowed = tenantsOf(doc)
    const owner = new Map<string, TenantId | null>()
    const bySlug = new Map<string, (string | number)[]>()
    for (const r of refs) if (isScoped(r.relationTo)) bySlug.set(r.relationTo, [...(bySlug.get(r.relationTo) ?? []), r.id])
    for (const [slug, ids] of bySlug) {
      if (!isScoped(slug)) continue
      const res = await req.payload.find({
        collection: slug,
        where: { id: { in: ids } },
        depth: 0,
        limit: ids.length,
        pagination: false,
        overrideAccess: true,
        req,
      })
      for (const d of res.docs) owner.set(`${slug}:${d.id}`, idOf((d as { tenant?: unknown }).tenant))
    }
    const key = (r: LexicalRef) => `${r.relationTo}:${r.id}`
    const bad = crossTenantRefs(refs, (r) => owner.get(key(r)) ?? null, allowed, RICH_TEXT_SCOPED_COLLECTIONS)
    if (bad.length > 0) {
      throwFieldErrors(collection?.slug ?? 'unknown', [
        {
          path: path.join('.'),
          message: `این متن به محتوایی از آکادمی دیگر ارجاع می‌دهد (${bad.map(key).join(', ')}). / References another academy's content.`,
        },
      ])
    }
    return value
  }
}

type RichTextOptions = {
  name: string
  label?: RichTextField['label']
  required?: boolean
  access?: { read?: FieldAccess; create?: FieldAccess; update?: FieldAccess }
  admin?: RichTextField['admin']
  tenantsOf?: TenantsOf
}

/** A rich-text field with the shared editor, plain-text normalisation and the server-side tenant check. */
export function richTextField({ name, label, required, access, admin, tenantsOf = recordTenant }: RichTextOptions): RichTextField {
  return {
    name,
    type: 'richText',
    ...(label ? { label } : {}),
    ...(required ? { required } : {}),
    ...(access ? { access } : {}),
    ...(admin ? { admin } : {}),
    editor: richTextEditor,
    hooks: { beforeValidate: [normalise], beforeChange: [tenantGuard(tenantsOf)] },
  }
}
