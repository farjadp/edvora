/**
 * Contrast maths for tenant colours (WCAG 2.x relative luminance). Pure functions, safe on server and client.
 * The frontend layout feeds the tenant's brand/accent hex in and injects the result as CSS variables, so a tenant
 * can pick any colour and text/focus colours still meet contrast.
 */

export type Hex = `#${string}`

const HEX = /^#[0-9a-fA-F]{6}$/

export function isHex(value: string | null | undefined): value is Hex {
  return typeof value === 'string' && HEX.test(value)
}

type Rgb = [number, number, number]

function toRgb(hex: Hex): Rgb {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex([r, g, b]: Rgb): Hex {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

function luminance(hex: Hex): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as Rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio, 1–21. */
export function contrast(a: Hex, b: Hex): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** Linear mix in sRGB; `amount` 0 = `from`, 1 = `to`. */
export function mix(from: Hex, to: Hex, amount: number): Hex {
  const a = toRgb(from)
  const b = toRgb(to)
  return toHex([0, 1, 2].map((i) => a[i]! + (b[i]! - a[i]!) * amount) as Rgb)
}

/** Whichever of `light` / `dark` text reads better on `bg`. */
export function readableInk(bg: Hex, light: Hex = '#ffffff', dark: Hex = '#111827'): Hex {
  return contrast(light, bg) >= contrast(dark, bg) ? light : dark
}

/**
 * Nudges `color` toward `toward` in 5% steps until it reaches `min` contrast against every background.
 * Returns `color` unchanged when it already passes.
 */
export function ensureContrast(color: Hex, backgrounds: readonly Hex[], toward: Hex, min = 3): Hex {
  for (let step = 0; step <= 20; step++) {
    const candidate = step === 0 ? color : mix(color, toward, step / 20)
    if (backgrounds.every((bg) => contrast(candidate, bg) >= min)) return candidate
  }
  return toward
}

/** Page backgrounds per theme. Keep in sync with `styles.css` (`--bg`, `--surface`, `--sunken`). */
export const SURFACES = {
  light: ['#f6f6f3', '#ffffff', '#eeeee9'],
  dark: ['#0c0e12', '#151820', '#1c2029'],
} as const satisfies Record<'light' | 'dark', readonly Hex[]>

export type TenantPalette = {
  brand: Hex
  brandInk: Hex
  accent: Hex
  accentInk: Hex
  /** Focus ring/border colour, ≥3:1 against every light-theme surface. */
  focus: Hex
  /** Focus colour for dark theme, ≥3:1 against every dark-theme surface. */
  focusDark: Hex
  /** Brand-coloured TEXT in dark theme: ≥4.5:1 against every dark-theme surface (light theme uses `--brand` as is). */
  brandTextDark: Hex
}

/** Derives every colour the UI needs from a tenant's two brand colours. */
export function tenantPalette(brand: Hex, accent: Hex): TenantPalette {
  return {
    brand,
    brandInk: readableInk(brand),
    accent,
    accentInk: readableInk(accent),
    focus: ensureContrast(brand, SURFACES.light, '#000000'),
    focusDark: ensureContrast(brand, SURFACES.dark, '#ffffff'),
    brandTextDark: ensureContrast(brand, SURFACES.dark, '#ffffff', 4.5),
  }
}

/** CSS that applies a palette. Selectors outrank the defaults in `styles.css`. */
export function tenantPaletteCss(p: TenantPalette): string {
  return (
    `html:root{--brand:${p.brand};--brand-ink:${p.brandInk};--accent:${p.accent};--accent-ink:${p.accentInk};--focus:${p.focus}}` +
    `html:root[data-theme='dark']{--focus:${p.focusDark};--brand-text:${p.brandTextDark}}`
  )
}
