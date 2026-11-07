/** Hand-transcribed content from iranbrandacademy.com pages (curated.json), validated before import. */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const str = z.string()
const nstr = z.string().nullable().optional().transform((v) => v ?? null)
const list = <T extends z.ZodType>(t: T) => z.array(t).default([])

const course = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  sourceUrl: z.string().url(),
  title: str,
  subtitle: nstr,
  kind: z.enum(['program', 'short', 'video']),
  summary: z.string().default(''),
  durationLabel: nstr,
  audience: list(z.object({ title: str, text: nstr })),
  outcomes: list(z.object({ text: str })),
  syllabus: list(z.object({ title: str, description: nstr, hours: z.number().nullable().optional() })),
  faculty: list(str),
  faq: list(z.object({ question: str, answer: str })),
  heroImageUrl: nstr,
  statedPriceToman: z.number().int().nullable().optional(),
  statedPriceText: nstr,
  scheduleText: nstr,
  mode: z.enum(['online', 'in-person', 'hybrid']).nullable().optional(),
  admission: list(str),
  pendingClaims: list(z.object({ text: str, note: z.string().default('') })),
  isCurrent: z.boolean(),
  notes: z.string().default(''),
})

const page = z.object({
  slug: z.enum(['about', 'faq', 'contact', 'regulations', 'consulting', 'founder', 'careers']),
  title: str,
  intro: nstr,
  blocks: list(z.object({ type: z.enum(['h2', 'h3', 'p', 'li']), text: str })),
  faq: list(z.object({ question: str, answer: str })),
  images: list(str),
  sourceUrl: z.string().url(),
  notes: z.string().default(''),
})

export const curatedSchema = z.object({
  courses: z.array(course),
  faculty: z.array(z.object({ name: str, roleLines: list(str), photoUrl: nstr, sourceUrl: z.string().url() })),
  services: z.array(z.object({ title: str, text: z.string().default(''), sourceUrl: z.string().url() })),
  pages: z.array(page),
  contact: z.object({ phones: list(str), email: nstr, address: nstr, sourceUrl: z.string().url() }),
  gaps: list(str),
})

export type Curated = z.infer<typeof curatedSchema>
export type CuratedCourse = z.infer<typeof course>
export type CuratedPage = z.infer<typeof page>

export async function loadCurated(): Promise<Curated> {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'curated.json')
  const parsed = curatedSchema.safeParse(JSON.parse(await readFile(file, 'utf8')))
  if (!parsed.success) {
    throw new Error(`curated.json is invalid:\n${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')}`)
  }
  return parsed.data
}
