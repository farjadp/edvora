# E-028 — Build the Seal direction + gamification (plan)

Builds what E-027 designed. **Plan only; nothing is built yet.**
Sources: `docs/product/gamification.md` (stories G1–G11), `docs/ux/E-027-panel-soul.md`, `docs/design/e027/README.md`.
Decision (Farjad, 2026-11-06): **A · Seal**, with B's girih star as the certificate seal.

## Depends on (both merged)

- **PR #12 (E-026)** quizzes, assignments, content drip: quiz/assignment events and "content released this week" for
  drip-aware streaks.
- **PR #13 (E-022)** `/staff` desk shell + 2FA: the advisor and finance desks sit inside it.

Both are merged into `develop` (#12 `929b03e`, #13 `27ccbd2`). Start E-028 on a fresh branch from `develop`.

## Questions (from E-027 handoff)

- ~~Morabba licence~~ — Morabba web licence confirmed by Farjad, 2026-11-06. Morabba is the display face (`apps/web/public/fonts/morabba`).
- ~~Gamification default~~ — **On** for new academies (Farjad, 2026-11-06).
- Week start (Saturday?), streak default (2 days/week), leaderboard at all, refund → XP rules. Use the PRD defaults
  marked `[ ]` until answered; they are tenant config, not code.

## Tasks

### tech-lead (`packages/core` + `apps/web/src/collections`)

| # | Task | Notes | Story |
| --- | --- | --- | --- |
| T1 | **Tenant flags.** `tenants.gamification` group: master switch + per-mechanic toggles (xp, streak, badges, leaderboard, celebrations, staffGoals) + weekly target, leaderboard minimum. | Master switch default **on** for new tenants (Farjad, 2026-11-06). `pnpm generate:types` + migration. Read through one helper `gamificationFor(tenant)`. | G1 |
| T2 | **Events ledger.** New tenant-owned collection `learning-events` (append-only: user, enrollment, type, sourceId, xp, occurredAt UTC, idempotency key unique per tenant). Add it to `multiTenantPlugin.collections`; access is create-from-server only, no update/delete. | Derived totals (xp, level, streak, badges) are computed in `packages/core/src/gamification.ts` (pure, Vitest), cached on the enrollment and recomputable. | G2–G4 |
| T3 | **Completion trigger.** A lesson awards XP only on a server-confirmed completion. The manual "mark complete" button records progress, not XP; XP needs watched ≥ 90 % (player beacon) or the quiz/assignment outcome from E-026. | One XP per source (idempotency key), 150 XP/day cap, retake rules: all in core with tests. | G2, anti-abuse |
| T4 | **Streak engine.** Weekly rhythm in Jalali weeks, auto freezes, neutral weeks when E-026 drip released nothing or a cohort break is set. | Pure function over ledger + release calendar; Vitest table tests incl. Nowruz. | G3 |
| T5 | **Badges + certificate path.** Starter catalogue as code constants (super-admin edits later, G11). Certificate path = lessons, assignments, quizzes, final defence → existing certificate flow. XP never unlocks a certificate. | No "Ministry of Science" wording anywhere. | G4, G5 |
| T6 | **Lead follow-up date.** Add `nextFollowUpAt` (UTC) + `lastOutcome` to `leads`. The advisor goal counts only follow-ups with a recorded outcome. | Migration. Coordinate with E-015 (advisor CRM). | G8 |
| T7 | **Staff counters.** Advisor daily goal + follow-up streak, team goal (no individual ranking), finance inbox zero (pending payments to verify). Read-only queries, tenant-filtered. | Uses E-022 desk access checks. | G8–G10 |

### ui-designer (`packages/ui` + pages)

| # | Task | Notes |
| --- | --- | --- |
| U1 | **Tokens.** Move `--milestone` / `--milestone-ink` (light `#8f6200`/`#fff`, dark `#e0b040`/`#1b1400`), `--e-tint`, `--e-track`, `--font-display` and keyframes `e-sweep`, `e-rise`, `e-stamp` from `design-preview/e027/preview.css` into `packages/ui/src/styles.css`. Everything under `motion-safe` / `prefers-reduced-motion`. | Display face Morabba (Morabba web licence confirmed by Farjad, 2026-11-06). |
| U2 | **Components in `packages/ui`:** `ProgressRing`, `Seal` (girih-star certificate seal from option B), `Emblem` (badge), `WeekRhythm`, `CertificatePath`, `Celebration` (inline, `role="status"`, 1 per view / 3 per day), `GoalRing` (staff). | Port from `design-preview/e027/_components` (Seal variants only). Server-safe; client only where motion state needs it. |
| U3 | **`/dashboard`:** Seal layout per UX §2.1 with gamification on, and the separate OFF layout. | After T1–T5. |
| U4 | **`/learn`:** lesson-complete block (UX §2.2), quiz result pass / not-yet (§2.3, no red, no XP on fail). | After E-026 is merged + T3. |
| U5 | **`/staff`:** advisor desk daily goal + outcome chips (§2.4), team goal line, finance inbox zero. | After E-022 is merged + T6–T7. |
| U6 | Empty states E1–E8 and the certificate finale page (UX §3.1, §4); not drawn in E-027. | Draw in the preview first, then build. |

### qa

Acceptance criteria G1–G10 from the PRD. Both tenants, 375/1440 px, light/dark, reduced motion, gamification off,
axe audit on the four screens.

## Order

T1 → T2 → T3/T4/T5 (parallel) → U1/U2 → U3/U4 → T6/T7 → U5 → U6 → qa. Delete `design-preview/e027` once U3–U5 ship.

## Out of scope

Leaderboard UI (G7) and tenant-editable badges/XP (G11) wait for answers to the PRD open questions.
