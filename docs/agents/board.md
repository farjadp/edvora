# Edvora task board

Owned by the **head-of-product**. Every agent reads it; only the head-of-product changes status (separate chats write a
handoff in `handoffs/` instead). Statuses: `todo · doing · review · blocked · done`. `chat: <agent>` = run in a
separate session.

_Last updated: 2026-11-06 — E-010, E-012 done; E-013 and E-021 in review._

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
| E-011 | Lint + format (ESLint, Prettier) in CI | tech-lead | — | `pnpm lint` in CI, zero errors | todo |
| E-013 | Phase 2 stories: live classes, protected video + watermark, assignments, certificate issuing flow | product-manager | — | `docs/product/phase-2.md` with acceptance criteria | review (branch `myca/cool-cerf-d7d065`) |
| E-014 | UX flows + wireframes for Phase 2 (student week view, live class join, assignment upload, defense scoring) | ux-architect | E-013 | `docs/ux/phase-2.md` | todo |
| E-015 | Advisor CRM screens: lead queue, today's follow-ups, call log (beyond default Payload lists) — first desk under `/staff` (ADR 006) | ux-architect → ui-designer → tech-lead | E-022 | advisors can work a day's queue in ≤3 clicks per lead | todo |
| E-016 | SMS reminders worker (BullMQ + Redis): instalment due, follow-up due, class reminder | tech-lead | E-004 for real sends | jobs run with mock SMS, tested | todo |
| E-017 | S3 storage adapter (MinIO local / ArvanCloud prod) for Media | tech-lead | E-005 for prod | uploads go to MinIO locally | todo |
| E-018 | Staging deploy: Dockerfile, Caddy, compose.staging, nightly backup, GlitchTip, Uptime Kuma | tech-lead (`chat: tech-lead`) | E-005 | staging URL live, restore tested | todo |
| E-019 | Certificate PDF with QR to `/verify` | tech-lead | — | PDF generated on issue, attached to certificate | todo |
| E-020 | Update Notion after each milestone (decision log, build status) | knowledge-keeper | any | Notion matches repo | ongoing |
| E-021 | Admin foundation: permission catalog, per-academy roles (templates incl. finance + support, custom roles), memberships with scope + expiry, user create/edit with full profile, account status, audit log, staff 2FA, no hard delete (ADR 006, Notion 11 §3) | tech-lead | — | admin creates a user with roles + scope; access checks read permissions from DB; tests for tenant isolation, scope, no escalation, four-eyes | review (branch `feature/admin-foundation`, handoff `handoffs/E-021.md`) |
| E-022 | `/staff` desk shell: layout, role-based landing, tenant shown, access checks | ux-architect → ui-designer → tech-lead | E-021 | each staff role lands on its own desk; students get 403 | todo |
| E-023 | Finance desk: overdue instalments, manual payment with four-eyes approval, refund flow, Excel export | product-manager → tech-lead | E-021, E-022, client Q9–Q11 | approval by a second person enforced in core + tested | todo |
| E-024 | Student 360 page + manual enrollment + support tickets | ux-architect → tech-lead | E-022 | one screen shows orders, enrollments, leads, tickets, SMS | todo |

## Done
| ID | Task | Owner | Date |
| --- | --- | --- | --- |
| E-000 | Sprint 0 + Phase 1 slice: multi-tenant site, admin, OTP login, checkout + instalments, CRM data, certificates, LMS basics, CI | (built before the agent team) | 2026-11-06 |
| E-010 | Playwright E2E money path + tenant isolation in CI (PR #1) | qa | 2026-11-06 |
| E-012 | Design tokens + shared components in `@edvora/ui`, a11y fixes (PR #2, #3, #5) | ui-designer | 2026-11-06 |
