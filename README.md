# Edvora

**AshaVid's white-label Academy & Learning Business Platform** — Academy Builder + Learning Management + Business Platform.
One codebase runs many academies, each on its own domain with its own brand, payment gateway and data.

Customer #1: **Iran Brand Academy** (tenant `iba`).

## What works today

| Module (Notion page 01) | Status |
| --- | --- |
| 1 · Public site — "Stream" homepage, course pages, RTL, Vazirmatn, light/dark | ✅ |
| 2 · Admin (Payload, Persian UI, tenant selector) | ✅ base collections |
| 3 · Student area — dashboard, lesson player, progress | ✅ basic |
| 5 · Sales & payments — checkout, coupons, instalments, gateway callback | ✅ (Zarinpal + mock) |
| 6 · Lead CRM — lead form → advisor queue → pipeline rules → follow-up dates | ✅ data + rules, admin UI |
| 9 · Certificates — auto codes (`BA-MBA-182`), public `/verify` page | ✅ |
| 10 · Notifications — SMS on lead, login, enrollment | ✅ (Kavenegar + mock) |
| Multi-tenancy — tenant per domain, isolation, per-tenant branding/features/gateway | ✅ |
| 4 live classes · 7 consulting/B2B · 8 instructor panel · 11 community · 13 reports | ⏳ next phases |

## Stack

Next.js 16 · Payload CMS 3 · PostgreSQL 16 · TypeScript (strict) · Tailwind CSS 4 · pnpm + Turborepo.
Every outside service sits behind an adapter with a mock (`packages/integrations`). See `docs/adr/`.

```
apps/web/                 Next.js + Payload (site, student area, /admin)
packages/core/            Pure business logic + tests (money, instalments, certificates, leads, OTP, Jalali)
packages/integrations/    Payment (zarinpal, mock) and SMS (kavenegar, mock) adapters + tests
packages/config/          Shared tsconfig
infra/docker/             Local stack: Postgres, Redis, Mailpit, MinIO
docs/adr/                 Architecture decisions
```

## Run it locally

Requires Node ≥ 24.22 (`nvm use`), pnpm 10, Docker.

```bash
pnpm install
pnpm db:up                                   # Postgres on :5442 (plus Redis, Mailpit, MinIO)
cp apps/web/.env.example apps/web/.env       # then set PAYLOAD_SECRET, SESSION_SECRET, SEED_ADMIN_PASSWORD
pnpm seed                                    # tenants: iba (real content) + demo (test data)
pnpm dev                                     # http://localhost:3000
```

- **IBA site:** http://localhost:3000 (or http://iba.localhost:3000)
- **Demo academy:** http://demo.localhost:3000 — priced course, 4 instalments, coupon `TEST20`, certificate `ED-MGT-001`
- **Admin:** http://localhost:3000/admin — email/password from `SEED_ADMIN_*`
- **Student login:** any 09… number; with `SMS_PROVIDER=mock` the code is shown on screen and printed in the server log
- **Payments:** with `PAYMENT_PROVIDER=mock`, checkout goes to a fake bank page at `/pay/mock`

## Checks

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Rules that shape everything

1. **Runs inside Iran.** No runtime dependency on foreign services (fonts are self-hosted, no Google/CDN scripts).
2. **No US cloud for Iranian tenants** (Vercel, Stripe, Sentry SaaS etc. forbid it). Iranian providers behind adapters.
3. **Built for AI agents.** One language, strict types, clear folders, mocks for everything. Read `AGENTS.md`.

Money is stored as integer **rials**, shown as toman. Dates are stored in UTC, shown in Jalali.

> ⚖️ Before contracting with or taking payment from Iranian customers, get advice from a Canadian sanctions lawyer
> (see Notion page 07). GitHub's terms also restrict some Iran-related use; Notion lists self-hosted Gitea as the
> alternative for code hosting.
