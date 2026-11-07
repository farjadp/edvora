import { describe, expect, it } from 'vitest'
import {
  collectLexicalRefs,
  crossTenantRefs,
  hasRichText,
  isLexicalDoc,
  lexicalExcerpt,
  lexicalToPlainText,
  plainTextToLexical,
  toLexical,
  type LexicalDoc,
  type LexicalNode,
} from './richtext'

const doc = (...children: LexicalNode[]): LexicalDoc => ({ root: { type: 'root', version: 1, children } })
const p = (...children: LexicalNode[]): LexicalNode => ({ type: 'paragraph', version: 1, children })
const t = (text: string): LexicalNode => ({ type: 'text', version: 1, text })

describe('plainTextToLexical', () => {
  it('makes one paragraph per blank-line block and keeps line breaks', () => {
    const d = plainTextToLexical('سطر یک\nسطر دو\n\nبند دوم')!
    expect(d.root.children).toHaveLength(2)
    const first = d.root.children[0]!
    expect(first.type).toBe('paragraph')
    expect(first.direction).toBe('rtl')
    expect(first.children!.map((c) => c.type)).toEqual(['text', 'linebreak', 'text'])
    expect(d.root.children[1]!.children![0]!.text).toBe('بند دوم')
  })
  it('normalises CRLF and collapses runs of blank lines', () => {
    const d = plainTextToLexical('a\r\n\r\n\r\n  \nb')!
    expect(d.root.children).toHaveLength(2)
  })
  it('returns null for empty text', () => {
    expect(plainTextToLexical('')).toBeNull()
    expect(plainTextToLexical(' \n\n ')).toBeNull()
  })
  it('treats a single blank line as a block break', () => {
    expect(plainTextToLexical('a\n\nb')!.root.children).toHaveLength(2)
  })
})

describe('round trip', () => {
  const samples = [
    'یک خط',
    'سطر اول\nسطر دوم',
    'بند اول\n\nبند دوم\nبا شکست خط\n\nبند سوم',
    'Mixed English و فارسی ۱۲۳ with 123',
    '  leading and trailing  ',
    'tabs\tinside',
  ]
  for (const s of samples) {
    it(`text → lexical → text: ${JSON.stringify(s)}`, () => {
      expect(lexicalToPlainText(plainTextToLexical(s))).toBe(s.trim())
    })
  }
  it('is idempotent on Lexical input', () => {
    const d = plainTextToLexical('x\n\ny')!
    expect(toLexical(d)).toBe(d)
    expect(toLexical(JSON.stringify(d))).toEqual(d)
  })
})

describe('toLexical', () => {
  it('handles null, strings, JSON strings and junk', () => {
    expect(toLexical(null)).toBeNull()
    expect(toLexical(undefined)).toBeNull()
    expect(isLexicalDoc(toLexical('hello'))).toBe(true)
    expect(toLexical(42)).toBeNull()
    expect(toLexical({ root: 'nope' })).toBeNull()
    // Text that merely looks like JSON stays text.
    expect(lexicalToPlainText(toLexical('{"root": broken'))).toBe('{"root": broken')
  })
})

describe('lexicalToPlainText', () => {
  it('flattens headings, lists, quotes, tables and uploads', () => {
    const d = doc(
      { type: 'heading', tag: 'h2', children: [t('عنوان')] },
      p(t('متن '), { type: 'text', text: 'پررنگ', format: 1 }),
      { type: 'list', listType: 'bullet', children: [{ type: 'listitem', children: [t('یک')] }, { type: 'listitem', children: [t('دو')] }] },
      { type: 'quote', children: [t('نقل')] },
      { type: 'horizontalrule' },
      {
        type: 'table',
        children: [{ type: 'tablerow', children: [{ type: 'tablecell', children: [p(t('a'))] }, { type: 'tablecell', children: [p(t('b'))] }] }],
      },
      { type: 'upload', relationTo: 'media', value: { id: 3, alt: 'نمودار' } },
    )
    expect(lexicalToPlainText(d)).toBe('عنوان\n\nمتن پررنگ\n\nیک\nدو\n\nنقل\n\na | b\n\nنمودار')
  })
  it('passes legacy plain text through and parses JSON strings', () => {
    expect(lexicalToPlainText('plain')).toBe('plain')
    expect(lexicalToPlainText(JSON.stringify(plainTextToLexical('json')))).toBe('json')
    expect(lexicalToPlainText({})).toBe('')
  })
  it('knows when there is nothing to show', () => {
    expect(hasRichText(null)).toBe(false)
    expect(hasRichText(doc(p()))).toBe(false)
    expect(hasRichText('x')).toBe(true)
    expect(hasRichText(doc({ type: 'upload', relationTo: 'media', value: 1 }))).toBe(true)
  })
  it('excerpts on one line', () => {
    expect(lexicalExcerpt(plainTextToLexical('a\nb\n\nc'))).toBe('a b c')
    expect(lexicalExcerpt('x'.repeat(200), 10)).toBe(`${'x'.repeat(9)}…`)
  })
})

describe('tenant isolation of references', () => {
  const d = doc(
    p(
      t('see '),
      { type: 'link', fields: { linkType: 'internal', doc: { relationTo: 'courses', value: 7 } }, children: [t('course')] },
      { type: 'link', fields: { linkType: 'custom', url: 'https://example.com' }, children: [t('ext')] },
    ),
    { type: 'upload', relationTo: 'media', value: 11 },
    { type: 'upload', relationTo: 'media', value: { id: 12, alt: 'x' } },
  )
  it('collects uploads and internal links, not external URLs', () => {
    expect(collectLexicalRefs(d)).toEqual([
      { kind: 'link', relationTo: 'courses', id: 7 },
      { kind: 'upload', relationTo: 'media', id: 11 },
      { kind: 'upload', relationTo: 'media', id: 12 },
    ])
    expect(collectLexicalRefs('plain text')).toEqual([])
  })
  it('flags references to another academy and missing targets', () => {
    const tenants: Record<string, number | null> = { 'courses:7': 1, 'media:11': 1, 'media:12': 2 }
    const bad = crossTenantRefs(collectLexicalRefs(d), (r) => tenants[`${r.relationTo}:${r.id}`], [1], ['courses', 'media'])
    expect(bad).toEqual([{ kind: 'upload', relationTo: 'media', id: 12 }])
    // Unknown target in a scoped collection is refused (fail closed).
    expect(crossTenantRefs([{ kind: 'upload', relationTo: 'media', id: 99 }], () => null, [1], ['media'])).toHaveLength(1)
    // Unscoped collections are not checked.
    expect(crossTenantRefs([{ kind: 'link', relationTo: 'users', id: 1 }], () => null, [1], ['media'])).toEqual([])
    // String vs number tenant ids compare equal.
    expect(crossTenantRefs([{ kind: 'upload', relationTo: 'media', id: 1 }], () => '1', [1], ['media'])).toEqual([])
  })
})
