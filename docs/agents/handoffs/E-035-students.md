# E-035 follow-up: Edvora palette for the student panel and student login

**Date:** 2026-11-07 · **Branch:** feature/ui-palette-students (from develop after #31, #17)

1. **Task:** Farjad decided "Students too". The student panel and the student login take the same turquoise/petrol
   palette as the console. This is done through tokens only. The girih seal, Morabba + Vazirmatn, and the XP/streak/badge
   shapes are unchanged; only the colours change.

2. **Output**
   - **Tokens:** a `[data-student]` scope in `packages/ui/src/console-tokens.css`. It re-maps the site tokens (`--bg`,
     `--brand`, `--milestone`, `--e-tint` ...) to the `--c-*` palette.
   - **Pages:** `components/PublicChrome.tsx` wraps `/login`, `/dashboard*` and `/learn*` in `data-student`. The route list
     is in `lib/studentRoutes.ts`, with a test in `studentRoutes.test.ts`. No component changed, and there are no
     hard-coded colours.
   - **Docs:** "Student panel palette" section in `docs/design/system.md`. The contrast script is
     `docs/design/students/contrast.mjs`.
   - **e2e:** `e2e/tests/student-palette.spec.ts`.
     - The public site has no `data-student` scope.
     - Login (demo + iba), dashboard and certificate: background token check plus axe wcag2a/aa in light and dark.
     - `SHOTS=1` writes screenshots.
   - **Screenshots:** `docs/design/students/after-{login-demo,login-iba,dashboard,certificate}-{light,dark}.png`.

3. **Decisions made**
   - **Light mode:** buttons, rings and the seal are petrol with warm-white text. Links are dark turquoise `#0b6a65`.
     Turquoise `#40b5ad` is the accent.
   - **Dark mode:** the base is petrol. Buttons are turquoise with petrol text.
   - **Gold (light):** milestone gold is `#745715`, because it is also used as text (`text-milestone`). Matte gold
     `#c9a45c` would fail as text on warm white.
   - **Gold (dark):** `#c9a45c`.
   - **Darker values than the console:** dark e-tint is `#113c51` and light line-strong is `#73848a`, so that every pair
     passes AA.
   - **Scope:** only the public site (home, courses, `/verify`, checkout) keeps the academy's colours.

4. **Open issues**
   - **Farjad decides (multi-tenant):** in these pages the academy colour no longer shows. That includes the header
     logo chip, which is now turquoise/petrol. A second academy may want its own colour here. The options are:
     - make it a tenant setting (`studentPalette: edvora | academy`);
     - show the tenant colour on the logo chip only, as the console does.
   - **Overscroll:** past the page edge, the body background is still the academy's neutral (`#f6f6f3` / `#0c0e12`).
     This is invisible in normal use.
   - **Not covered:** checkout and payment result pages (`/pay`, `/payments/*`) are not in scope and keep the academy
     palette.

5. **Next owner:** Farjad reviews the PR and the multi-tenant question, then approves the merge.

**Checks run:**
- `pnpm typecheck` ✅, `pnpm e2e:typecheck` ✅
- `pnpm test` ✅. The web suite now has 7 files.
- `pnpm build` ✅
- `pnpm e2e student-palette` ✅ 3/3 on a fresh scratch DB (`edvora_students`). axe found 0 serious or critical
  violations in light and dark on login, dashboard and certificate.
