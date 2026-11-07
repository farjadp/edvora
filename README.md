<div align="center">

# Edvora

**Run a whole academy (site, school and business) from one codebase.**

AshaVid's white-label **Academy & Learning Business Platform**: Academy Builder · Learning Management · Business Platform.
One deployment serves many academies, and each gets its own domain, brand, payment gateway, staff and data.

Persian-first · RTL · Jalali · Iranian payments and SMS · runs inside Iran

[Quick start](#quick-start) · [What's inside](#whats-inside) · [Architecture](#architecture) · [Docs map](#docs-map) · [AI team](#the-ai-team)

</div>

---

## Why Edvora

Most academies sell through a WordPress site, run classes on a separate tool, track leads in a spreadsheet and chase
instalments by hand. Edvora puts all of that in one place:

| Pillar | What it gives an academy |
| --- | --- |
| **Academy Builder** | A branded public site per academy: courses, faculty, journal, pages, certificate verification |
| **Learning Management** | Student panel, lessons, quizzes, assignments, drip schedules, live classes, certificates, gamification |
| **Business Platform** | Checkout with instalments and coupons, an advisor CRM, staff desks, per-academy roles, an audit log |

Customer #1 is **Iran Brand Academy** (tenant `iba`). A second tenant, **`demo`**, carries test data only.

---

## What's inside

Status reflects the `develop` branch. 🔍 means it's built and waiting in an open PR.

| Area | Status | Highlights |
| --- | --- | --- |
| **Multi-tenancy** | ✅ | Tenant per domain, strict isolation, per-tenant brand, features and gateway ([ADR 004](docs/adr/004-multi-tenancy.md)) |
| **Public site** | ✅ | Homepage, course pages, RTL, Vazirmatn, light/dark, public certificate check at `/verify` |
| **Sales & payments** | ✅ | Checkout, coupons, instalments, gateway callback: Zarinpal + mock. Money is integer rials |
| **Lead CRM** | ✅ | Lead form → advisor queue → pipeline rules → follow-up dates |
| **Permissions & roles** | ✅ | Permission catalog, per-academy roles and templates, memberships with scope + expiry, audit log, no hard delete |
| **Staff desks** | ✅ | `/staff` shell, a desk per role, real 403 pages, optional TOTP 2FA ([ADR 006](docs/adr/006-two-layer-admin.md), [007](docs/adr/007-staff-2fa-totp.md), [008](docs/adr/008-staff-desk-routing-and-403.md)) |
| **Learning** | ✅ | Lesson player, progress, quizzes (4 question types, bank, attempts, timer), assignments with private uploads, content drip |
| **Admin** | ✅ | Payload `/admin` in the Seal theme, full Lexical editor with image upload ([ADR 010](docs/adr/010-rich-text-lexical.md)) |
| **Login** | ✅ | Seal-card login for students (SMS OTP), staff (+2FA) and admin, with every state designed |
| **Notifications** | ✅ | SMS on lead, login and enrollment: Kavenegar + mock |
| **Live classes** | 🟡 contract on `develop` · 🔍 [#27](https://github.com/farjadp/edvora/pull/27) | Self-hosted BigBlueButton behind an adapter, join/host routes, attendance, recordings to private storage ([ADR 012](docs/adr/012-live-classes.md)) |
| **Object storage** | 🔍 [#27](https://github.com/farjadp/edvora/pull/27) | S3-compatible (ArvanCloud) adapter + mock, signed playback |
| **Gamification** | 🔍 [#21](https://github.com/farjadp/edvora/pull/21) | XP ledger, weekly rhythm, badges, levels, certificate finale, advisor daily goals, tenant switches |
| **WordPress migration** | 🔍 [#19](https://github.com/farjadp/edvora/pull/19) | One-click import from WooCommerce, LifterLMS and Tutor LMS: WP plugin, dry run, redirects |
| **IBA content import** | 🔍 [#17](https://github.com/farjadp/edvora/pull/17) | iranbrandacademy.com imported into the `iba` tenant, with images self-hosted |
| **Self-serve sandbox** | 🔄 in progress | "Try the demo": a throwaway academy with 3-hour credentials |
| Consulting / B2B · instructor panel · community · reports | ⏳ | Later phases |

---

## Quick start

**You need** Node **24.22+** (`nvm use`), **pnpm 10**, and **Docker**.

```bash
pnpm install
pnpm db:up                                  # Postgres :5442, Redis, Mailpit, MinIO
cp apps/web/.env.example apps/web/.env      # set PAYLOAD_SECRET, SESSION_SECRET, SEED_ADMIN_PASSWORD
pnpm seed                                   # tenants: iba + demo
pnpm dev                                    # http://localhost:3000
```

Generate secrets with `openssl rand -hex 32`.

### Where to click

| What | URL | How to get in |
| --- | --- | --- |
| IBA site | http://localhost:3000 · http://iba.localhost:3000 | n/a |
| Demo academy | http://demo.localhost:3000 | Course with 4 instalments, coupon `TEST20`, certificate `ED-MGT-001` |
| Student login | `/login` | Any `09…` number. With `SMS_PROVIDER=mock` the code shows on screen and in the server log |
| Student panel | `/dashboard`, `/learn/<course>` | After logging in |
| Staff desks | `/staff/login` → `/staff` | Staff accounts; 2FA is optional per person |
| Admin | `/admin` | `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` |
| Fake bank | `/pay/mock` | Used automatically with `PAYMENT_PROVIDER=mock` |
| Certificate check | `/verify` | Public |

### Environment

All config comes from env vars. Nothing is hard-coded. See [`apps/web/.env.example`](apps/web/.env.example).

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | Postgres connection | local Docker |
| `PAYLOAD_SECRET`, `SESSION_SECRET` | Signing secrets | **must set** |
| `NEXT_PUBLIC_SITE_URL` | Public base URL | `http://localhost:3000` |
| `DEFAULT_TENANT_SLUG` | Tenant when the host matches none | `iba` |
| `PAYMENT_PROVIDER` · `ZARINPAL_*` | `mock` or `zarinpal` | `mock` |
| `SMS_PROVIDER` · `KAVENEGAR_*` | `mock` or `kavenegar` | `mock` |
| `STAFF_2FA_REQUIRED` | Force 2FA for every staff member | `false` |
| `PRIVATE_UPLOADS_DIR` | Assignment files, never public ([ADR 009](docs/adr/009-private-uploads.md)) | `private-uploads/submission-files` |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | First super admin | **must set** |

Mocks need no accounts, so the full flow works offline.

---

## Architecture

```
edvora/
├─ apps/web/                  Next.js 16 + Payload 3: public site, student area, /staff, /admin
│  └─ src/
│     ├─ app/(frontend)/      Server components; actions.ts = Zod-validated server actions
│     ├─ app/(payload)/       Payload admin + its Seal theme (custom.scss)
│     ├─ collections/         21 collections (tenant-owned ones are in multiTenantPlugin)
│     ├─ access/              Permission resolution, default deny
│     └─ seed/                iba + demo seed
├─ packages/core/             Pure business rules + Vitest: money, instalments, quiz, drip, access, TOTP, Jalali…
├─ packages/integrations/     Outside services: interface + real adapter + mock + tests (payment, sms, live-class)
├─ packages/ui/               Design tokens and shared components (Seal), Tailwind 4
├─ packages/config/           Shared tsconfig
├─ e2e/                       Playwright: money path, tenant isolation, staff, login, learning, rich text, a11y
├─ infra/docker/              Local stack
└─ docs/                      ADRs, product, UX, specs, research, runbooks, agent board
```

**Stack:** Next.js 16 · Payload CMS 3 · PostgreSQL 16 · TypeScript (strict) · Tailwind CSS 4 · pnpm + Turborepo ·
Vitest · Playwright.

### Four ideas that shape the code

1. **One request, one tenant.** The tenant comes from the host name. Every public query filters by `tenant`
   explicitly, and every tenant-owned collection is registered with the multi-tenant plugin.
   ([ADR 004](docs/adr/004-multi-tenancy.md), [005](docs/adr/005-tenant-resolution-and-redirects.md))
2. **Two layers of admin.** Payload `/admin` is for setup and content. `/staff` desks are for daily work by role
   (advisor, finance, support, instructor). ([ADR 006](docs/adr/006-two-layer-admin.md))
3. **Permissions live in the database.** Roles are per academy and built from a code-defined catalog. Memberships
   carry scope and expiry. No one can grant what they don't hold. Every staff change is audit-logged.
4. **Every outside service sits behind an adapter with a mock.** You can swap Zarinpal, Kavenegar, BigBlueButton or
   ArvanCloud without touching business code, and run everything offline. ([ADR 003](docs/adr/003-adapters-and-mocks.md))

### Design: Seal (مُهر)

Paper, ink and hairlines. Gold appears only for milestones. Morabba for display, Vazirmatn for text, and each
academy's brand colour on top. It respects reduced motion, works in dark mode, and passes AA contrast. Tokens and
components are documented in [`docs/design/system.md`](docs/design/system.md).

---

## Checks

```bash
pnpm typecheck
pnpm test                  # Vitest across packages
pnpm build
```

End-to-end runs with Playwright, mock providers and both tenants. It needs a seeded DB and starts `next dev` itself:

```bash
pnpm db:up && pnpm seed
pnpm e2e                   # E2E_PORT=3100 pnpm e2e if :3000 is busy
```

CI runs `check` (typecheck + test + build) and `e2e` on every PR.

---

## Deploy

| Environment | Where | Data | Providers |
| --- | --- | --- | --- |
| **Demo** | Railway (US): [web-production-39ee1.up.railway.app](https://web-production-39ee1.up.railway.app) | `demo` tenant only | mock |
| **Staging / production** | Iranian host (ArvanCloud / Liara / Hamravesh), not provisioned yet | real | Zarinpal, Kavenegar, BBB, Arvan S3 |

The steps are in [`docs/runbooks/deploy-railway.md`](docs/runbooks/deploy-railway.md). Railway is for demos only:
no real students, no real keys, no client content ([ADR 002](docs/adr/002-hosting-in-iran.md)).

---

## House rules

The full list is in [`AGENTS.md`](AGENTS.md). These are the ones that bite:

- **Ask "would a second academy want this?"** If not, it's tenant config or content, not product.
- **Runs inside Iran:** no external runtime dependencies, so no Google Fonts, CDNs, analytics or reCAPTCHA. Self-host everything.
- **Money:** integer rials only (`rial()`, `tomanToRial()`), shown with `formatToman()`.
- **Dates:** stored in UTC, shown in Jalali.
- **Persian text:** half-spaces, Persian digits in the UI, Latin digits in codes. Normalise input with `toLatinDigits`.
- **Never `redirect()` to a same-site page from a server action.** Return `{ redirectTo }` instead.
- **Styling:** Tailwind classes only, design tokens, logical RTL utilities (`ms-`, `pe-`, `start-`).
- **No invented facts** in copy or seed data. Unknowns get `TODO(client)`.
- **Before handoff:** `pnpm typecheck && pnpm test && pnpm build`.

---

## Docs map

| Folder | What's there |
| --- | --- |
| [`docs/adr/`](docs/adr/) | Architecture decisions, listed below |
| [`docs/product/`](docs/product/) | Phase 2 stories, gamification PRD |
| [`docs/ux/`](docs/ux/) · [`docs/design/`](docs/design/) | Flows, wireframes, the design system, screenshots |
| [`docs/specs/`](docs/specs/) | Technical specs per task |
| [`docs/research/`](docs/research/) | Cited research (live classes; WordPress LMS and competitors in #19) |
| [`docs/runbooks/`](docs/runbooks/) | How to deploy and operate |
| [`docs/agents/`](docs/agents/) | The AI team: board, roster, handoffs, Farjad's inbox |

| ADR | Decision | Status |
| --- | --- | --- |
| [001](docs/adr/001-stack.md) | Custom build on Next.js + Payload 3 + Postgres | accepted |
| [002](docs/adr/002-hosting-in-iran.md) | Iranian tenants are hosted inside Iran | accepted |
| [003](docs/adr/003-adapters-and-mocks.md) | Every outside service behind an adapter with a mock | accepted |
| [004](docs/adr/004-multi-tenancy.md) | Multi-tenancy with Payload's multi-tenant plugin | accepted |
| [005](docs/adr/005-tenant-resolution-and-redirects.md) | No same-site `redirect()` from server actions | accepted |
| [006](docs/adr/006-two-layer-admin.md) | Two-layer admin: Payload for setup, desks for daily work | accepted |
| [007](docs/adr/007-staff-2fa-totp.md) | Staff 2FA: self-hosted TOTP, optional | accepted |
| [008](docs/adr/008-staff-desk-routing-and-403.md) | Staff desk routing, real 403, server-rendered QR | proposed |
| [009](docs/adr/009-private-uploads.md) | Private uploads for student submissions | proposed |
| [010](docs/adr/010-rich-text-lexical.md) | One Lexical editor, jsonb storage, tenant-checked references | accepted |
| 011 | WordPress migration: plugin bundle first, REST fallback | in [#19](https://github.com/farjadp/edvora/pull/19) |
| [012](docs/adr/012-live-classes.md) | Live classes on self-hosted BigBlueButton | accepted |
| 013 | Sandbox tenants | in progress (E-029) |
| 014 | Gamification ledger | in [#21](https://github.com/farjadp/edvora/pull/21) |

---

## The AI team

Edvora is built by a team of Claude Code agents, coordinated through files in the repo so the work survives across
sessions.

| Command / agent | Role |
| --- | --- |
| **`/product`** → `head-of-product` | Farjad's single contact: plans, briefs the team, checks the work, reports back |
| **`/inbox`** → `farjad-inbox` | Collects everything waiting on Farjad into one list and delivers his answers back |
| `product-manager` · `ux-architect` · `ui-designer` | Stories → flows → screens |
| `tech-lead` · `qa` · `devops` | Build → test and sign off → deploy |
| `market-researcher` · `knowledge-keeper` | Cited research · Notion and the decision log |

The board is [`docs/agents/board.md`](docs/agents/board.md), the roster is [`docs/agents/roster.md`](docs/agents/roster.md),
and handoffs are in [`docs/agents/handoffs/`](docs/agents/handoffs/). Every handoff ends with **Task · Output ·
Decisions made · Open issues · Next owner**.

Farjad's approval is required for releases, provider contracts, anything sent to the client, public claims, and
deleting data.

---

## Branches

`main` (production) ← `develop` (staging) ← `feature/<module>-<short-name>`. PRs go into `develop`, use
conventional commits (`feat:`, `fix:`, `chore:`), and CI must be green.

> ⚖️ **Legal.** Get advice from a Canadian sanctions lawyer before contracting with or taking payment from Iranian
> customers (Notion page 07). GitHub's terms also restrict some Iran-related use; self-hosted Gitea is the documented
> alternative.

<div align="center"><sub>Built by <b>AshaVid</b> · Edvora</sub></div>
