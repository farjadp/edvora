import { describe, expect, it } from 'vitest'
import { isPageSlugShape, isReservedPageSlug } from './pageSlugs'

describe('page slugs', () => {
  it('accept lowercase letters in any script, digits and dashes', () => {
    expect(isPageSlugShape('about')).toBe(true)
    expect(isPageSlugShape('درباره-ما')).toBe(true)
    expect(isPageSlugShape('faq-2')).toBe(true)
  })
  it('reject uppercase, spaces, slashes and dots', () => {
    for (const s of ['About', 'a b', 'a/b', 'a.b', '']) expect(isPageSlugShape(s)).toBe(false)
  })
  it('reserve the slugs real routes already use', () => {
    for (const s of ['dashboard', 'courses', 'login', 'journal', 'faculty', 'admin', 'api']) expect(isReservedPageSlug(s)).toBe(true)
    expect(isReservedPageSlug('about')).toBe(false)
  })
})
