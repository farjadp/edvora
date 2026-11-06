# Edvora task board

Owned by the **head-of-product**. Every agent reads it; only the head-of-product changes status (separate chats write a
handoff in `handoffs/` instead). Statuses: `todo · doing · review · blocked · done`. `chat: <agent>` = run in a
separate session.

_Last updated: 2026-11-06 — seeded from Notion pages 04, 05, 07 after the first build._

## Waiting for Farjad / the client
| ID | Item | Who |
| --- | --- | --- |
| E-001 | Real MBA/DBA fees, instalment terms, next cohort dates | Client (IBA) |
| E-002 | Proof and exact wording for the DBA "Ministry of Science" claim (or remove it) | Client (IBA) |
| E-003 | Faculty portraits, class photos, testimonial consent | Client (IBA) |
| E-004 | Zarinpal + Kavenegar sandbox accounts / merchant IDs | Farjad |
| E-005 | ArvanCloud (or Liara/Hamravesh) server for staging | Farjad |
| E-006 | Sanctions/structure advice before contracting; GitHub vs self-hosted Gitea | Farjad + lawyer |
| E-007 | Skyroom vs BigBlueButton for live classes | Farjad (Tech Lead recommends) |

## Backlog
| ID | Task | Owner | Depends on | Definition of done | Status |
| --- | --- | --- | --- | --- | --- |
| E-010 | Playwright E2E for the money path on the demo tenant (+ tenant-isolation checks) and add it to CI | qa | — | `pnpm e2e` passes locally and in CI | todo |
| E-011 | Lint + format (ESLint, Prettier) in CI | tech-lead | — | `pnpm lint` in CI, zero errors | todo |
| E-012 | Move design tokens + shared components to `packages/ui`; document in `docs/design/system.md` | ui-designer | — | web app imports from `@edvora/ui`, no visual change | todo |
| E-013 | Phase 2 stories: live classes, protected video + watermark, assignments, certificate issuing flow | product-manager | — | `docs/product/phase-2.md` with acceptance criteria | todo |
| E-014 | UX flows + wireframes for Phase 2 (student week view, live class join, assignment upload, defense scoring) | ux-architect | E-013 | `docs/ux/phase-2.md` | todo |
| E-015 | Advisor CRM screens: lead queue, today's follow-ups, call log (beyond default Payload lists) | ux-architect → ui-designer → tech-lead | — | advisors can work a day's queue in ≤3 clicks per lead | todo |
| E-016 | SMS reminders worker (BullMQ + Redis): instalment due, follow-up due, class reminder | tech-lead | E-004 for real sends | jobs run with mock SMS, tested | todo |
| E-017 | S3 storage adapter (MinIO local / ArvanCloud prod) for Media | tech-lead | E-005 for prod | uploads go to MinIO locally | todo |
| E-018 | Staging deploy: Dockerfile, Caddy, compose.staging, nightly backup, GlitchTip, Uptime Kuma | tech-lead (`chat: tech-lead`) | E-005 | staging URL live, restore tested | todo |
| E-019 | Certificate PDF with QR to `/verify` | tech-lead | — | PDF generated on issue, attached to certificate | todo |
| E-020 | Update Notion after each milestone (decision log, build status) | knowledge-keeper | any | Notion matches repo | ongoing |
| E-025 | Demo deploy on Railway: app + Railway Postgres, mock providers, seed, runbook incl. DB move-out | devops (`chat: devops`) | — | public Railway URL serves the demo tenant + /admin; `docs/runbooks/deploy-railway.md` | review |

## Done
| ID | Task | Owner | Date |
| --- | --- | --- | --- |
| E-000 | Sprint 0 + Phase 1 slice: multi-tenant site, admin, OTP login, checkout + instalments, CRM data, certificates, LMS basics, CI | (built before the agent team) | 2026-11-06 |
