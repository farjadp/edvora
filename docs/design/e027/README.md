# E-027 · Visual direction for the student and staff panels (step 3 of 3)

Three options, each built as a static, dev-only preview (`/design-preview/e027`, 404 in production, `noindex`, not linked anywhere).
All sit ON TOP of the tenant brand (`--brand` / `--accent`); the only new token is `--milestone` (gold) plus a display face.
Copy is taken from `docs/ux/E-027-panel-soul.md`. Data is fake and hard-coded.

Open: `/design-preview/e027` (index), `/design-preview/e027/<seal|girih|block>/<dashboard|dashboard-off|lesson|quiz|advisor>`,
add `?brand=teal|wine|blue` for another tenant colour, `?chrome=0` to hide the preview toolbar. Dark: the header theme toggle.

## Decision (Farjad, 2026-11-06): A · Seal + girih star as certificate seal

Farjad's words: "A Seal". The girih star from B becomes the certificate seal / `--milestone` badge shape in A. B and C routes and screenshots stay for reference only. Build plan: `docs/specs/E-028-seal-gamification-build.md`.

**Font licence:** the Fontiran web licence for Morabba is **not yet confirmed by Farjad**. Morabba stays in the dev-only preview, but must not ship to a public page until he confirms. Peyda and Kalameh were removed after the decision; the B and C previews now fall back to Vazirmatn (their screenshots still show the original faces).

## Options side by side

| | A · مُهر (Seal) | B · گره (Girih) | C · پیشران (Drive) |
| --- | --- | --- | --- |
| Idea | Executive's notebook: paper, ink, hairlines; gold only for lasting moments | Iranian craft: eight-point girih star replaces the ring; warm ground | Bold colour blocks and huge numerals; progress readable at a glance |
| Accents on tenant | Brand only for ring/CTA; gold `--milestone` for badge/level/seal; no card fills, rules instead | Warm sand ground, brand-tinted surface (7%), gold for badges; pattern band only where no text | Solid brand block, solid accent block (week), gold block (level), `ok`/`ink` block for quiz result |
| Display face | Morabba (Fontiran) | Kalameh (removed after decision) | Peyda (removed after decision) |
| Icons / art | 1.5 stroke, round; scalloped seal; guilloche circles watermark | 1.9 stroke, mitred; 8-point star for ring (8 kites), week dots, path nodes, badge | 3 stroke, square; gold hexagon; weekly bars; 30 lesson tiles |
| Motion (all CSS, `motion-safe`, ease-out only) | Ring sweep 700 ms, seal "sets" 380 ms + one sheen, block fade 180 ms | Kites fill one by one (90 ms stagger), fade 180 ms | Block wipe 420 ms, bars grow 320 ms |
| Reduced motion | Final state shown at once (animations only inside `prefers-reduced-motion: no-preference`) | same | same |
| Best for | 45+ executives, formal premium brands (IBA) | Academies that want Iranian warmth and craft | Workshop-style, energetic academies, younger users |
| Risks | Can feel dry if content is thin; needs precise spacing | Pattern can get busy; icon set costs more to maintain; sand ground tints every tenant warm | Less formal; depends on tenant colours (ink is derived, but saturated tenants look loud); heaviest page |

Common rules honoured: one gold element family only; quiz not-yet has no red, no XP, primary action = review; celebrations inline with `role="status"`; no nested cards; OFF dashboard is a different composition (plain bar or tiles, week list, certificate checklist, no gold, no level) for all three options.

## Recommendation: A · مُهر (Seal)

1. IBA's audience is adult executives on a DBA/MBA; restraint reads as premium and as respect for their time. Gold appearing rarely makes the certificate seal and level feel earned.
2. Cheapest to keep consistent across tenants: it leans on whitespace and hairlines, so any brand colour works (checked on blue, teal, wine).
3. Lightest page (no pattern, no big colour blocks) for slow connections and mid-range Android.
4. Girih is the best "Iranian" differentiator; suggested follow-up: borrow its star as the certificate seal and the `--milestone` badge in A (Emblem shape is one component), instead of adopting the whole option.
Drive (C) is the pick only if Farjad wants a loud, youthful product feel; it can be offered as a per-tenant preset later.

## Tokens that would move to `packages/ui/src/styles.css` if chosen

`--milestone` (light `#8f6200` / dark `#e0b040`, ink `#fff` / `#1b1400`; contrast on surfaces 4.6-8.8:1), `--e-tint` and `--e-track` (brand mixed with surface/sunken), display font family variable, keyframes `e-sweep`, `e-rise`, `e-stamp`. Morabba is in `apps/web/public/fonts/morabba` (licence not yet confirmed by Farjad; dev-only preview until he confirms).

## Files

Route: `apps/web/src/app/(frontend)/design-preview/e027/` (`layout.tsx`, `page.tsx`, `[option]/[screen]/page.tsx`, `preview.css`, `_lib/`, `_components/`).
Tools: `capture.mjs` (66 screenshots), `overview.mjs` (3 contact sheets). Run from repo root with the dev server up: `BASE=http://localhost:3270 node docs/design/e027/capture.mjs && node docs/design/e027/overview.mjs`.

Screenshots (`<option>-<screen>-<mobile|desktop>-<light|dark>.png`): 3 options x 5 screens x 2 viewports x 2 themes = 60; plus `<option>-dashboard-<teal|wine>-desktop-light.png` = 6; plus `overview-<option>.png` = 3 (69 PNG, about 9.5 MB). 375px: no horizontal overflow in any capture (scrollWidth == clientWidth, checked by the script).

## Not done / caveats

- Dashboard sections 6/7 (certificates, orders table), the certificate finale (3.1), level-up/streak notes, empty states and the leaderboard are not drawn.
- Rings do not animate from 40% to 43% on the lesson block, only sweep from 0 (a CSS-only limit without per-value keyframes).
- Contrast checked by calculation for the gold token and ink/accent pairs, not with an automated audit (axe) on every page; do that in QA.
- Screenshots use emulated reduced motion, so they show end states; animations were not captured.
- Staff shell is not drawn around the advisor desk (the frontend Header is shown instead).
- Persian "+" sign needs an RLM prefix (`‏+`) in RTL text; keep that in the real component.
