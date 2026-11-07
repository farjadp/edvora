import 'server-only'
import { collectLexicalRefs, toLexical, type LexicalRef } from '@edvora/core/richtext'
import type {
  SerializedHeadingNode,
  SerializedLinkNode,
  SerializedAutoLinkNode,
  SerializedListItemNode,
  SerializedListNode,
  SerializedParagraphNode,
  SerializedQuoteNode,
  SerializedTableCellNode,
  SerializedTableNode,
  SerializedTableRowNode,
  SerializedUploadNode,
} from '@payloadcms/richtext-lexical'
import { RichText as LexicalRichText, type JSXConverterArgs, type JSXConvertersFunction } from '@payloadcms/richtext-lexical/react'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import Image from 'next/image'
import type { Where } from 'payload'
import type { ReactNode } from 'react'
import { idOf } from '../lib/ids'
import { getPayloadClient } from '../lib/payload'
import type { Media } from '../payload-types'

/**
 * E-031: renders a Lexical rich-text value (or legacy plain text) with Edvora prose styles.
 *
 * Server component. Images and internal links are resolved here, **inside the current academy only**: a reference to
 * another academy's media/course/lesson renders as nothing / plain text, even if it somehow got stored.
 * Alignment and indent are mapped to logical Tailwind classes (start/end follow RTL), never inline styles.
 */

type Props = {
  data: unknown
  tenantId: number
  className?: string
}

type Targets = {
  media: Map<number, Media>
  hrefs: Map<string, string>
}

const ALIGN: Record<string, string> = {
  start: 'text-start',
  end: 'text-end',
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
  justify: 'text-justify',
}
const INDENT = ['', 'ps-10', 'ps-20', 'ps-30', 'ps-40', 'ps-50', 'ps-60']

function blockClass(node: { format?: unknown; indent?: unknown }, base = ''): string {
  const align = typeof node.format === 'string' ? (ALIGN[node.format] ?? '') : ''
  const level = typeof node.indent === 'number' ? Math.min(Math.max(node.indent, 0), INDENT.length - 1) : 0
  return [base, align, INDENT[level]].filter(Boolean).join(' ')
}

const refKey = (relationTo: string, id: unknown) => `${relationTo}:${idOf(id) ?? ''}`

async function resolveTargets(refs: LexicalRef[], tenantId: number): Promise<Targets> {
  const ids = (slug: string) => [...new Set(refs.filter((r) => r.relationTo === slug).map((r) => idOf(r.id)).filter((x): x is number => x !== null))]
  const mediaIds = ids('media')
  const courseIds = ids('courses')
  const lessonIds = ids('lessons')
  const targets: Targets = { media: new Map(), hrefs: new Map() }
  if (mediaIds.length + courseIds.length + lessonIds.length === 0) return targets
  const payload = await getPayloadClient()
  const inTenant = (list: number[]): Where => ({ and: [{ id: { in: list } }, { tenant: { equals: tenantId } }] })
  const [media, lessons] = await Promise.all([
    mediaIds.length ? payload.find({ collection: 'media', where: inTenant(mediaIds), depth: 0, limit: mediaIds.length, pagination: false, overrideAccess: true }) : null,
    lessonIds.length ? payload.find({ collection: 'lessons', where: inTenant(lessonIds), depth: 0, limit: lessonIds.length, pagination: false, overrideAccess: true }) : null,
  ])
  for (const m of media?.docs ?? []) targets.media.set(m.id, m)
  const allCourseIds = [...new Set([...courseIds, ...(lessons?.docs ?? []).map((l) => idOf(l.course)).filter((x): x is number => x !== null)])]
  const courses = allCourseIds.length
    ? await payload.find({
        collection: 'courses',
        where: { and: [{ id: { in: allCourseIds } }, { tenant: { equals: tenantId } }, { status: { equals: 'published' } }] },
        depth: 0,
        limit: allCourseIds.length,
        pagination: false,
        overrideAccess: true,
      })
    : null
  const slugOf = new Map((courses?.docs ?? []).map((c) => [c.id, c.slug]))
  for (const [id, slug] of slugOf) targets.hrefs.set(refKey('courses', id), `/courses/${encodeURIComponent(slug)}`)
  for (const l of lessons?.docs ?? []) {
    const slug = slugOf.get(idOf(l.course) ?? -1)
    if (slug) targets.hrefs.set(refKey('lessons', l.id), `/learn/${encodeURIComponent(slug)}/${l.id}`)
  }
  return targets
}

const LINK = 'font-medium text-brand underline decoration-line-strong underline-offset-4 hover:decoration-brand'

function converters(targets: Targets): JSXConvertersFunction {
  const linkHref = (node: SerializedLinkNode | SerializedAutoLinkNode): string | null => {
    const f = node.fields
    if (f.linkType === 'internal') {
      const doc = f.doc
      return doc ? (targets.hrefs.get(refKey(doc.relationTo, doc.value)) ?? null) : null
    }
    const url = typeof f.url === 'string' ? f.url.trim() : ''
    // Only web, mail and phone links; never javascript: or data: URLs.
    return /^(https?:|mailto:|tel:|\/|#)/i.test(url) ? url : null
  }
  const link = ({ node, nodesToJSX }: JSXConverterArgs<SerializedLinkNode | SerializedAutoLinkNode>): ReactNode => {
    const children = nodesToJSX({ nodes: node.children })
    const href = linkHref(node)
    if (!href) return <span>{children}</span>
    const external = /^https?:/i.test(href)
    const newTab = Boolean(node.fields.newTab) || external
    return (
      <a href={href} className={LINK} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {children}
      </a>
    )
  }

  return ({ defaultConverters }) => ({
    ...defaultConverters,
    paragraph: ({ node, nodesToJSX }: JSXConverterArgs<SerializedParagraphNode>) => {
      const children = nodesToJSX({ nodes: node.children })
      return <p className={blockClass(node)}>{children.length ? children : <br />}</p>
    },
    heading: ({ node, nodesToJSX }: JSXConverterArgs<SerializedHeadingNode>) => {
      const children = nodesToJSX({ nodes: node.children })
      const cls = { h1: 'text-2xl', h2: 'text-xl', h3: 'text-lg', h4: 'text-base', h5: 'text-base', h6: 'text-base' }[node.tag]
      const Tag = node.tag === 'h1' ? 'h2' : node.tag
      return <Tag className={blockClass(node, `${cls} font-bold leading-snug text-ink`)}>{children}</Tag>
    },
    quote: ({ node, nodesToJSX }: JSXConverterArgs<SerializedQuoteNode>) => (
      <blockquote className={blockClass(node, 'border-s-4 border-brand ps-4 text-muted')}>{nodesToJSX({ nodes: node.children })}</blockquote>
    ),
    horizontalrule: () => <hr className="border-line" />,
    list: ({ node, nodesToJSX }: JSXConverterArgs<SerializedListNode>) => {
      const children = nodesToJSX({ nodes: node.children })
      if (node.listType === 'check') return <ul className="space-y-1">{children}</ul>
      if (node.listType === 'number') return <ol className="list-[persian] space-y-1 ps-6 marker:text-muted">{children}</ol>
      return <ul className="list-disc space-y-1 ps-6 marker:text-muted">{children}</ul>
    },
    listitem: ({ node, nodesToJSX, parent }: JSXConverterArgs<SerializedListItemNode>) => {
      const children = nodesToJSX({ nodes: node.children })
      const nested = node.children.some((c) => c.type === 'list')
      if ('listType' in parent && parent.listType === 'check' && !nested) {
        return (
          <li className="flex items-start gap-2" aria-checked={node.checked ? 'true' : 'false'} role="checkbox">
            <span
              aria-hidden
              className={`mt-1.5 inline-flex size-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none ${node.checked ? 'border-brand bg-brand text-brand-ink' : 'border-line-strong'}`}
            >
              {node.checked ? '✓' : ''}
            </span>
            <span className={node.checked ? 'text-muted line-through' : ''}>{children}</span>
          </li>
        )
      }
      return <li className={nested ? 'list-none' : ''}>{children}</li>
    },
    table: ({ node, nodesToJSX }: JSXConverterArgs<SerializedTableNode>) => (
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full border-collapse text-sm">
          <tbody>{nodesToJSX({ nodes: node.children })}</tbody>
        </table>
      </div>
    ),
    tablerow: ({ node, nodesToJSX }: JSXConverterArgs<SerializedTableRowNode>) => (
      <tr className="border-b border-line last:border-b-0">{nodesToJSX({ nodes: node.children })}</tr>
    ),
    tablecell: ({ node, nodesToJSX }: JSXConverterArgs<SerializedTableCellNode>) => {
      const children = nodesToJSX({ nodes: node.children })
      const span = {
        ...(node.colSpan && node.colSpan > 1 ? { colSpan: node.colSpan } : {}),
        ...(node.rowSpan && node.rowSpan > 1 ? { rowSpan: node.rowSpan } : {}),
      }
      const cell = 'border-e border-line px-3 py-2 text-start align-top last:border-e-0'
      return (node.headerState ?? 0) > 0 ? (
        <th {...span} className={`${cell} bg-sunken font-bold`}>
          {children}
        </th>
      ) : (
        <td {...span} className={cell}>
          {children}
        </td>
      )
    },
    link,
    autolink: link,
    upload: ({ node }: JSXConverterArgs<SerializedUploadNode>) => {
      if (node.relationTo !== 'media') return null
      const media = targets.media.get(idOf(node.value) ?? -1)
      if (!media?.url) return null
      const alt = media.alt ?? ''
      if (!media.mimeType?.startsWith('image/')) {
        return (
          <a href={media.url} className={LINK} rel="noopener noreferrer">
            {media.filename ?? alt}
          </a>
        )
      }
      return (
        <figure>
          {media.width && media.height ? (
            <Image src={media.url} alt={alt} width={media.width} height={media.height} sizes="(max-width: 768px) 100vw, 720px" className="h-auto w-full rounded-xl border border-line" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.url} alt={alt} className="h-auto w-full rounded-xl border border-line" />
          )}
        </figure>
      )
    },
  })
}

/** Prose rhythm for blocks; text size/colour come from `className`. */
const PROSE = 'space-y-4 break-words [&_code]:rounded [&_code]:bg-sunken [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em] [&_strong]:font-bold'

export async function RichText({ data, tenantId, className }: Props) {
  const doc = toLexical(data)
  if (!doc || doc.root.children.length === 0) return null
  const targets = await resolveTargets(collectLexicalRefs(doc), tenantId)
  return (
    <LexicalRichText
      data={doc as unknown as SerializedEditorState}
      converters={converters(targets)}
      disableTextAlign
      disableIndent
      className={[PROSE, className].filter(Boolean).join(' ')}
    />
  )
}

