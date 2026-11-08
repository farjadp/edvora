import { describe, expect, it } from 'vitest'
import { contrast, ensureContrast, isHex, readableInk, SURFACES, tenantPalette, tenantPaletteCss } from './color'

const IBA = { brand: '#1A56DB', accent: '#F59E0B' } as const
const DEMO = { brand: '#0F766E', accent: '#F97316' } as const

describe('contrast', () => {
  it('matches known WCAG values', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(contrast('#ffffff', '#1A56DB')).toBeCloseTo(6.18, 1)
  })
})

describe('isHex', () => {
  it('accepts #rrggbb only', () => {
    expect(isHex('#0F766E')).toBe(true)
    expect(isHex('#fff')).toBe(false)
    expect(isHex('red')).toBe(false)
    expect(isHex(null)).toBe(false)
  })
})

describe('readableInk', () => {
  it('keeps white on the current tenants (no visual change for IBA and demo)', () => {
    expect(readableInk(IBA.brand)).toBe('#ffffff')
    expect(readableInk(DEMO.brand)).toBe('#ffffff')
  })
  it('switches to dark ink on light brand colours', () => {
    expect(readableInk('#F59E0B')).toBe('#111827')
    expect(readableInk('#FDE68A')).toBe('#111827')
  })
})

describe('ensureContrast', () => {
  it('returns the colour unchanged when it already passes', () => {
    expect(ensureContrast('#1A56DB', SURFACES.light, '#000000')).toBe('#1A56DB')
  })
  it('lightens a dark brand until it passes on dark surfaces', () => {
    const out = ensureContrast('#1A56DB', SURFACES.dark, '#ffffff')
    for (const bg of SURFACES.dark) expect(contrast(out, bg)).toBeGreaterThanOrEqual(3)
  })
})

describe('tenantPalette', () => {
  const tenants = [IBA, DEMO, { brand: '#F59E0B', accent: '#1A56DB' }, { brand: '#FDE68A', accent: '#111111' }, { brand: '#000000', accent: '#ffffff' }] as const

  it.each(tenants)('meets contrast for brand $brand', ({ brand, accent }) => {
    const p = tenantPalette(brand, accent)
    expect(contrast(p.brandInk, p.brand)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(p.accentInk, p.accent)).toBeGreaterThanOrEqual(4.5)
    for (const bg of SURFACES.light) expect(contrast(p.focus, bg)).toBeGreaterThanOrEqual(3)
    for (const bg of SURFACES.dark) expect(contrast(p.focusDark, bg)).toBeGreaterThanOrEqual(3)
    for (const bg of SURFACES.dark) expect(contrast(p.brandTextDark, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('emits CSS that overrides both themes', () => {
    const css = tenantPaletteCss(tenantPalette(IBA.brand, IBA.accent))
    expect(css).toContain('html:root{--brand:#1A56DB;--brand-ink:#ffffff;')
    expect(css).toContain("html:root[data-theme='dark']{--focus:#")
  })
})

describe('colourChecks (E-047)', () => {
  it('a dark brand passes everything; a pale one fails text and the console chip', async () => {
    const { colourChecks } = await import('./color')
    expect(colourChecks('#123C55', '#C9A45C').every((c) => c.pass)).toBe(true)
    const pale = colourChecks('#A7F3D0', '#C9A45C')
    expect(pale.find((c) => c.key === 'brand-text')?.pass).toBe(false)
    expect(pale.find((c) => c.key === 'brand-console')?.pass).toBe(false)
  })

  it('suggestions always pass', async () => {
    const { colourChecks, suggestAccent, suggestBrand } = await import('./color')
    for (const c of ['#A7F3D0', '#FFFF00', '#40B5AD', '#1A56DB'] as const) {
      expect(colourChecks(suggestBrand(c), suggestAccent(c)).every((x) => x.pass), c).toBe(true)
    }
  })
})
