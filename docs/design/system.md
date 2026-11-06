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

## Seal components (E-028)

Direction A · Seal: thin rings, hairlines, one gold `milestone` colour, Morabba (`font-display`) for headings and
numbers, Vazirmatn for everything else. All in `@edvora/ui`, server-safe unless noted. Numbers are formatted by the page
(`toPersianDigits`) and passed in as strings; the package has no dependency on `@edvora/core`.

| Component | What | Notes |
| --- | --- | --- |
| `ProgressRing` | Thin SVG ring, `value` 0-100 (`stroke-dasharray` on a 100-long path). | `label` = accessible name; the number must also be visible beside it. `data-ring-value`, `testId`. Sweep is `motion-safe:animate-e-sweep`. |
| `Seal` | The certificate seal: eight-pointed girih star (option B), gold. `state="issued" \| "sealed"`, optional one-pass `sheen`. | The only gold seal on a page. Sealed = dashed outline + lock (not colour alone). |
| `Emblem` | Scalloped gold rosette for badges and level. `locked` = outline only. | Never used for the certificate. |
| `WeekRhythm` | One mark per Jalali week (met / in progress / frozen / missed / neutral), `data-week-state` on each. | A missed week is an empty circle, never red. |
| `CertificatePath`, `CertificateChecklist` | Stepper to the certificate (ON) and the plain checklist (gamification OFF: no gold, no lock). | A stepper, not a card in a card. |
| `GoalRing` | Staff goal: ring + `valueText` beside it; closes in `ok` when complete. | Counts only what the server confirms. |
| `Celebration` (client) | Inline `role="status"` live region. Budget: 1 per view, 3 per day (`celebrationBudget.ts`, localStorage in try/catch). | Visual is `aria-hidden`, `announce` is read instead; put links outside it. Never a modal, never steals focus. |
| `Guilloche`, `Icon` | Banknote hairline watermark (decorative, never over text); thin line icons. | |

Tokens used: `bg-milestone` / `text-milestone` / `text-milestone-ink` (gold; light `#8f6200`, dark `#e0b040`),
`bg-e-tint`, `bg-e-track` / `stroke-e-track`, `font-display`, keyframes `e-sweep`, `e-rise`, `e-stamp`, `e-sheen`
(all behind `motion-safe:`). Gold text only large/bold or with `milestone-ink` on gold.

Where they are used: `/dashboard` (`components/panel/dashboard.tsx`), lesson page (`LessonVideo` beacon +
`LessonStatus`), quiz result, certificate finale (`/dashboard/certificates/[id]`), `/staff/leads` and `/staff/finance`.
Gamification OFF is a separate composition (bar + checklist, no aside), not hidden pieces.

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
