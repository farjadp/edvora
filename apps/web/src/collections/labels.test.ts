import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONSOLE_GROUPS } from '../lib/consoleNav'

/**
 * E-035: nothing English in the Persian admin. Static check on the sources (no Payload boot): every visible
 * collection has fa singular + plural labels, every `admin.group` is a { fa, en } object, console groups are Persian.
 */
const dir = __dirname
const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
const persian = /[؀-ۿ]/

describe('collection labels', () => {
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8')
    // One CollectionConfig per `slug: '…'` at the top level of a config object.
    const configs = src.split(/\n(?=export const \w+: CollectionConfig)/).filter((c) => c.includes(': CollectionConfig'))
    for (const c of configs) {
      const slug = /slug: '([^']+)'/.exec(c)?.[1] ?? '?'
      const hidden = /admin: \{[^}]*hidden: true/.test(c)
      it(`${f} / ${slug}`, () => {
        if (hidden) return
        expect(c, 'labels.singular.fa').toMatch(/labels: \{ singular: \{ fa: '[^']*[؀-ۿ]/)
        expect(c, 'labels.plural.fa').toMatch(/plural: \{ fa: '[^']*[؀-ۿ]/)
        for (const g of c.matchAll(/\bgroup: ([^,}]+)/g)) expect(g[1], 'admin.group must be { fa, en }').toMatch(/^\{ fa: '/)
      })
    }
  }
})

describe('console nav', () => {
  it('every group and module label is Persian', () => {
    for (const g of CONSOLE_GROUPS) {
      expect(g.label).toMatch(persian)
      for (const m of g.items) expect(m.label, m.key).toMatch(persian)
    }
  })
})
