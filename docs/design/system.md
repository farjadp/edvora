# Edvora design system (`@edvora/ui`)

One visual language for every academy. Tenant identity comes from two colours (`--brand`, `--accent`) and a logo;
everything else is shared. Source: `packages/ui/`.

## Using it in an app

```css
/* apps/web/src/app/(frontend)/styles.css */
@import 'tailwindcss';
@import '@edvora/ui/styles.css'; /* tokens, dark variant, base layer, keyframes; registers @source for packages/ui */
@source '../../';                /* the app's own sources */
```

- `apps/web/next.config.ts` lists `@edvora/ui` in `transpilePackages` (the package ships TypeScript source).
- Components: `import { CoverArt, NoticeBar, Row, ThemeToggle } from '@edvora/ui'`.
- Class helpers in client components: `import { buttonClass, inputClass } from '@edvora/ui/classes'`.
- A new class used only inside `packages/ui` is generated because `styles.css` carries `@source './'`. If you add a
  folder outside `packages/ui/src`, add an `@source` for it.

## What belongs here

| In `@edvora/ui` | Stays in the app |
| --- | --- |
| Tokens, keyframes, base styles | Anything that fetches data (`Header` reads the session) |
| Presentational components with plain props | Anything bound to a server action (`LeadForm`, `LoginForm`, `EnrollCard`) |
| Class helpers for native elements | Adapters from Payload types to plain props (`CourseArt` → `CoverArt`) |

`@edvora/ui` must not import Payload types, `next/*`, `@edvora/core` root, or app code.

## Tokens

All colours are CSS variables mapped to Tailwind colours with `@theme inline`, so `bg-brand/20`, `border-line` etc. work.

| Utility | Variable | Light | Dark | Use |
| --- | --- | --- | --- | --- |
| `bg-brand`, `text-brand` | `--brand` | tenant (default `#1a56db`) | same | Primary actions, generated cover art, focus borders |
| `text-brand-ink` | `--brand-ink` | derived: `#ffffff` or `#111827` | same | Text on `bg-brand` (whichever reads better) |
| `bg-accent` | `--accent` | tenant (default `#f59e0b`) | same | Small highlights only: notice dot, cover stripe, selection |
| `text-accent-ink` | `--accent-ink` | derived (default `#111827`) | same | Text on `bg-accent` (selection) |
| `border-focus`, `ring-focus`, `outline-focus` | `--focus` | derived from brand, ≥3:1 on light surfaces | brand lightened until ≥3:1 on dark surfaces | Focus indicators only |
| `bg-bg` | `--bg` | `#f6f6f3` | `#0c0e12` | Page background; inputs inside surface cards |
| `bg-surface` | `--surface` | `#ffffff` | `#151820` | Cards; inputs on the page background |
| `bg-sunken` | `--sunken` | `#eeeee9` | `#1c2029` | Stat tiles, notice bar, hover on outline buttons |
| `text-ink` | `--ink` | `#111827` | `#eef0f4` | Body text; `bg-ink text-bg` for the secondary pill button |
| `text-muted` | `--muted` | `#5b6372` | `#9aa2b1` | Secondary text. Never on a coloured background |
| `border-line` | `--line` | `#e3e3dc` | `#262b36` | Dividers and card edges (decorative, ~1.3:1) |
| `border-line-strong` | `--line-strong` | `#888884` | `#676b72` | Borders that identify a control: inputs, choice chips (≥3:1, WCAG 1.4.11) |
| `text-ok` | `--ok` | `#0f7b4b` | `#3ccf8e` | Success |
| `text-danger` | `--danger` | `#b42318` | `#f97066` | Errors (`role="alert"`) |

- **Tenant colours:** the layout validates the tenant's `#rrggbb` colours (falling back to the defaults above) and
  injects `tenantPaletteCss(tenantPalette(brand, accent))` from `@edvora/ui/color`. That derives `--brand-ink` and
  `--accent-ink` (white or near-black, whichever has more contrast) and `--focus` for each theme (brand nudged toward
  black/white until ≥3:1 on every surface). So **any** tenant colour stays readable; a yellow brand gets dark button
  text automatically. Test with both `iba` (blue) and `demo` (teal).
- **Dark mode:** `data-theme="dark"` on `<html>`; use the `dark:` variant. The layout sets the tenant's default theme
  before paint; `ThemeToggle` flips and remembers it.
- **Fonts:** `font-sans` = Vazirmatn (Persian UI). `font-latin` = Space Grotesk, for codes, phone numbers, IDs. Both
  self-hosted with `@fontsource` (imported in the app layout, not in this package).
- **Utilities:** `scrollbar-none` (hide scrollbars on horizontal strips), `animate-marquee` (40s loop, only when the
  user has not asked for reduced motion).

## Components

### `CoverArt`
Course (or any titled item) cover. Shows `imageSrc` if given, otherwise generated art: brand background, faded
Latin watermark (`mark`, defaults to first two letters of `title`), accent stripe at the bottom, title on top.
Fills its parent — the parent sets the aspect ratio (`aspect-video`, etc.). Images load lazily at `size="card"` and
eagerly at `size="hero"`.

```tsx
<CoverArt title="MBA برند" mark="MBA" size="hero" />
```

| Prop | Type | Default |
| --- | --- | --- |
| `title` | `string` | — |
| `mark` | `string \| null` | `title.slice(0, 2)` |
| `imageSrc`, `imageAlt` | `string \| null` | — (alt falls back to `title`) |
| `size` | `'card' \| 'hero'` | `'card'` |

In the app, `CourseArt({ course, size })` (`apps/web/src/components/CourseCard.tsx`) maps a `Course` onto it.

### `Row`
Section with an `h2` and a horizontally scrolling, snap-aligned strip. Children should be `shrink-0 snap-start`
with a fixed width (see `CourseCard`). The strip bleeds to the screen edge on mobile (`-mx-4`) without causing page
overflow.

### `NoticeBar`
Full-width announcement strip above the header, with an accent dot. Rendered as `<aside aria-label>` (not a live
region, so screen readers don't re-announce it on every page). Props: `text`, optional `label` (default «اطلاعیه»).

### `ThemeToggle`
Client component. 44px round outline button with `focusRing` that toggles `data-theme` on `<html>` and stores it in `localStorage`
(fails silently in private mode). Optional props `toDarkLabel` / `toLightLabel` (Persian defaults) for the
`aria-label`.

## Class helpers (`@edvora/ui/classes`)

For native elements that must stay in the app (forms bound to server actions, `next/link`). Extra classes go in
`className`.

| Helper | Output | Options |
| --- | --- | --- |
| `buttonClass()` | 48px brand button, `hover:opacity-90`, `disabled:opacity-60` | `block` (w-full), `className` |
| `inputClass()` | 48px input, `border-line`, `focus:border-brand` | `tone: 'surface' \| 'bg'`, `size: 'md' \| 'sm'`, `block`, `className` |
| `focusRing` | `focus-visible` 2px outline in `--focus`, offset 2px | — (string constant) |
| `cx(...parts)` | Joins truthy class strings | — |

Inputs show focus as a 2px edge (1px `border-focus` + 1px `ring-focus`); buttons and links use `focusRing`. Never
`outline-none` without a replacement. Custom controls that hide the native input (`sr-only` radios in choice chips) put
`has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus` on the visible label.

## Colour helpers (`@edvora/ui/color`)

Pure functions, server- or client-safe: `contrast(a, b)`, `readableInk(bg)`, `ensureContrast(color, backgrounds,
toward, min)`, `mix(a, b, t)`, `isHex(v)`, `tenantPalette(brand, accent)`, `tenantPaletteCss(palette)`, `SURFACES`
(keep in sync with `--bg/--surface/--sunken`).

Rule of thumb for `tone`: input on the page background → `surface`; input inside a surface card → `bg`.

## Rules (from AGENTS.md, repeated because they bite)

- Tailwind classes only, no inline `style`. New CSS only as a token or keyframe in `packages/ui/src/styles.css`.
- RTL logical utilities: `ms-/me-/ps-/pe-/start-/end-`.
- Every responsive grid starts with `grid-cols-1`. Check 375px: `scrollWidth === clientWidth`.
- Visible focus, labels on inputs, AA contrast, respect reduced motion (`motion-safe:` on hover lifts and transitions).
- No external fonts, icons, images or scripts.

## Not yet extracted

Other repeated patterns still inline in pages and candidates for the next pass: the secondary pill button
(`rounded-full bg-ink text-bg`), link-styled brand buttons with different paddings (`not-found`, `payments/result`,
`dashboard`, `learn`), the card container (`rounded-2xl border border-line bg-surface`), and `CourseCard` itself
(needs a plain-props version and a `next/link` slot).

## Payload `/admin` theme (E-031, Seal)

The admin does not load Tailwind (its preflight fights Payload's reset), so it is themed with CSS variables in
`apps/web/src/app/(payload)/custom.scss` (unlayered, so it beats Payload's `@layer payload-default`). Same paper / ink /
hairline values as the site tokens above, in light and `data-theme='dark'`. Screenshots: `docs/design/e031/`.

- **Payload variables overridden:** the `--color-base-*` ramp (warm neutrals; light theme), `--theme-elevation-*` (dark,
  set directly because Payload reads the ramp backwards), `--theme-bg/-input-bg/-text/-border-color`, `--color-success-*`
  (green instead of Payload's blue), `--color-error-500..600`, `--font-body`, `--base-body-size: 14`,
  `--style-radius-s/m/l: 4/6/10px`, `--accessibility-outline` (2px focus colour).
- **Own tokens (`--ed-*`):** `--ed-paper/surface/sunken/ink/muted/line/line-strong/ok/danger` (= site values),
  `--ed-display` (Morabba, then Vazirmatn). Accent: `--ed-brand` (button fill), `--ed-brand-ink`, `--ed-brand-text` (links,
  numerals, active nav; >=4.5:1 on that theme's surfaces), `--ed-brand-wash` (active nav tint), `--ed-focus`.
- **Tenant accent:** `components/admin/TenantAccent` (`admin.components.header`) reads the academy selected in the nav
  (cookie `payload-tenant`, only if the user may read it) and emits `--brand-solid`, `--brand-solid-ink`, `--brand-text`,
  `--brand-wash`, `--focus` in a `<style>` element (no inline `style` attribute), derived with `@edvora/ui/color`. No academy
  selected = Edvora default blue. Fallbacks live in `custom.scss`, so nothing breaks if the component is absent.
- **Fonts:** Vazirmatn 400/500/700/900 and Space Grotesk 500/700 via `@fontsource` (imported in `(payload)/layout.tsx`);
  Morabba 400/700/900 from `apps/web/public/fonts/morabba` through `@font-face` in `custom.scss`. Morabba only for page
  titles, the wordmark and dashboard numerals. Gold (`--milestone`) is not used in the admin.
- **Components (`components/admin/`):** `Brand` (`Logo` for login/nav, `Icon` for the breadcrumb: girih star + ring, `currentColor`),
  `TenantAccent`, `DashboardHome` (`beforeDashboard`: greeting, up to four counts, quick links; each item only when Payload's
  permission data allows `read` / `create`, counts run with `overrideAccess: false` and filter by the selected academy).
  Classes: `ed-logo*`, `ed-seal`, `ed-dash*`. After adding admin components run `pnpm --filter @edvora/web generate:importmap`.
- **Checks:** 375px list view had a 32px horizontal overflow (Payload's mobile table bleed); fixed with `min-inline-size: 0` on
  `.table-wrap` / `.table`. `scrollWidth === clientWidth` on login, dashboard, list and edit at 375px, both themes.
