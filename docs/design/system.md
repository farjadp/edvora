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
| `text-brand-ink` | `--brand-ink` | `#ffffff` | same | Text on `bg-brand` |
| `bg-accent` | `--accent` | tenant (default `#f59e0b`) | same | Small highlights only: notice dot, cover stripe, selection |
| `bg-bg` | `--bg` | `#f6f6f3` | `#0c0e12` | Page background; inputs inside surface cards |
| `bg-surface` | `--surface` | `#ffffff` | `#151820` | Cards; inputs on the page background |
| `bg-sunken` | `--sunken` | `#eeeee9` | `#1c2029` | Stat tiles, notice bar, hover on outline buttons |
| `text-ink` | `--ink` | `#111827` | `#eef0f4` | Body text; `bg-ink text-bg` for the secondary pill button |
| `text-muted` | `--muted` | `#5b6372` | `#9aa2b1` | Secondary text. Never on a coloured background |
| `border-line` | `--line` | `#e3e3dc` | `#262b36` | Borders and dividers |
| `text-ok` | `--ok` | `#0f7b4b` | `#3ccf8e` | Success |
| `text-danger` | `--danger` | `#b42318` | `#f97066` | Errors (`role="alert"`) |

- **Tenant colours:** the frontend layout injects `:root{--brand:…;--accent:…}` from the tenant record (validated as
  `#rrggbb`, falling back to the defaults above). Brand/accent do not change between light and dark, so pick tenant
  colours that hold AA contrast with white `brand-ink`. Test with both `iba` (blue) and `demo` (teal).
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
Fills its parent — the parent sets the aspect ratio (`aspect-video`, etc.).

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
Full-width announcement strip (`role="status"`) above the header, with an accent dot. Props: `text`.

### `ThemeToggle`
Client component. Round outline button that toggles `data-theme` on `<html>` and stores it in `localStorage`
(fails silently in private mode). Optional props `toDarkLabel` / `toLightLabel` (Persian defaults) for the
`aria-label`.

## Class helpers (`@edvora/ui/classes`)

For native elements that must stay in the app (forms bound to server actions, `next/link`). Extra classes go in
`className`.

| Helper | Output | Options |
| --- | --- | --- |
| `buttonClass()` | 48px brand button, `hover:opacity-90`, `disabled:opacity-60` | `block` (w-full), `className` |
| `inputClass()` | 48px input, `border-line`, `focus:border-brand` | `tone: 'surface' \| 'bg'`, `size: 'md' \| 'sm'`, `block`, `className` |
| `cx(...parts)` | Joins truthy class strings | — |

Rule of thumb for `tone`: input on the page background → `surface`; input inside a surface card → `bg`.

## Rules (from AGENTS.md, repeated because they bite)

- Tailwind classes only, no inline `style`. New CSS only as a token or keyframe in `packages/ui/src/styles.css`.
- RTL logical utilities: `ms-/me-/ps-/pe-/start-/end-`.
- Every responsive grid starts with `grid-cols-1`. Check 375px: `scrollWidth === clientWidth`.
- Visible focus, labels on inputs, AA contrast, respect reduced motion.
- No external fonts, icons, images or scripts.

## Not yet extracted

Other repeated patterns still inline in pages and candidates for the next pass: the secondary pill button
(`rounded-full bg-ink text-bg`), link-styled brand buttons with different paddings (`not-found`, `payments/result`,
`dashboard`, `learn`), the card container (`rounded-2xl border border-line bg-surface`), and `CourseCard` itself
(needs a plain-props version and a `next/link` slot).
