# E-034 · Login in the Seal direction: three options

> **Status (2026-11-06): option B (Seal card) chosen and built.** The dev-only preview route
> (`/design-preview/e034`) and its capture script were removed once the real pages shipped; the screenshots below are a
> historical record of the three options. Real code: `apps/web/src/components/auth/*` (AuthFrame, kit, fields,
> StudentLoginForm), `packages/ui/src/seal.tsx` (seal, guilloche, star rule, icons), `components/staff/*` forms, and
> `components/admin/LoginSkin.tsx` + `custom.scss` for `/admin/login`. Sections «Run» and the PublicChrome note below
> describe the removed preview.

Dev-only preview (404 in production, `noindex`). Spec: `docs/ux/E-034-login.md`. All data is a neutral sample tenant («آکادمی نمونه»); nothing is saved, no auth code is touched.
No gold anywhere (reserved for milestones). Morabba for headings, Vazirmatn for text, tenant `--brand` drives fills, accents and focus.

## The options
- **A · Split screen** — tenant-colour panel at the visual start (girih lattice, big outlined star, academy name, welcome line, tagline, 3 stats) + form side. Below `md` the panel becomes a compact band (seal, name, welcome).
- **B · Seal card** — centred card on paper, banknote-style guilloche watermark (one static inline SVG), certificate double-hairline frame with corner stars, seal that straddles the card's top edge.
- **C · Ink page** — no card. Huge Morabba welcome line, one ink rule ending in a stamped outline seal, task title + form in two columns, hairline underline fields, square arrow button.

Same content, copy, alert regions, tab order and ids in all three (content is written once in `_components/screens.tsx`; shells differ in `_components/shells.tsx`, field/button styling in `_components/ui.ts`).

## Run
- Index: `/design-preview/e034`; screen: `/design-preview/e034/[a|b|c]/[screen]`.
- Query: `?brand=teal|wine|blue` (palette via `tenantPalette`) · `?chrome=0` hides the switcher · `?live=0` freezes timers · `?name=…` long academy name · `?welcome=default` fallback line. Theme via the toggle (localStorage `theme`).
- Capture (dev server up): `BASE=http://localhost:3340 node docs/design/e034/capture.mjs` (`ONLY=shots|contact|side|axe` for one step; note each run rewrites `report.json`).
- Output: `<option>-<screen>[-<brand>]-<desktop|mobile>-<light|dark>.png`, `contact-a|b|c.png`, `side-by-side.png`.

## Results
- Horizontal overflow: 0 on all 132 shots (375 and 1440).
- axe (wcag2a/aa/21aa + best-practice) on S1 and T1, each option, light + dark, desktop + mobile: 0 violations after wrapping C's top row in `<header>`.
- Interactive: working resend countdown (S11), lock countdowns that open the form at 0 with a polite status, password show/hide, code field (one real input over boxes, accepts Persian digits).

## Recommendation
**B (Seal card)** for the default, with A as the choice for academies that have real stats and imagery. B is the only option that looks right with zero tenant content (logo missing, no stats, no tagline): the seal, guilloche and frame carry the identity, it matches the certificate seal in the E-027 panel, it stays one calm centred column on a phone, and the watermark costs one small SVG. A is the most "brand" but depends on the stats and a good welcome line, and a tenant colour that is very light needs the computed `--brand-ink`. C is the most editorial and cheapest to build, but a long academy name or welcome line dominates the page and there is little to separate error banners from the page.

## Screen IDs → spec states
| Screen | Spec | Screen | Spec |
|---|---|---|---|
| s-phone | S1, S2 | t-empty | T1, T2 |
| s-phone-error | S3 | t-validation | T3 |
| s-submitting | S4 | t-wrong | T4 |
| s-code | S10, S11 | t-phone-hint | staff.phoneInEmail |
| s-code-new | S10 (name field) | t-suspended | T5 |
| s-code-wrong | S12 | t-locked | T6 (BACKEND countdown) |
| s-code-expired | S13 | t-submitting | T7 |
| s-locked | S14 | t-expired | T11 |
| s-ratelimit | S9 (BACKEND) | t-out | T12 |
| s-suspended | S15 | t-2fa / -wrong / -locked | V1 / V3 / V4 |
| s-session | S18 | t-enrol | N2, N5 (QR is a placeholder) |
| a-skin | A1 | a-error / a-suspended | A2, A8 / A4 |
| a-moved | A1 phase 2 doorway (copy is a placeholder) | forgot | T13, A7 |
| tenant-unknown | S20, T14 (BACKEND) | maintenance | S21, T14 (BACKEND) |
| error-server | S6, T9 | error-network | S7, T8 |

## Notes for tech-lead / Farjad
- `components/PublicChrome.tsx` got a 2-line bypass for `/design-preview/e034` so the preview has no site header/footer (the route 404s in production).
- Option C's big welcome line is a `<p>`; the H1 stays the task title (spec asked for Morabba on H1 only; here both are Morabba).
- a-moved copy and the Payload toast text (A2) are placeholders; Payload's real strings differ.
- Sample stats, phone and welcome line are fake and marked as sample; the real source is `tenants.loginWelcome` (proposed) → `tagline`.
