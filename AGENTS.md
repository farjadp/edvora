# AGENTS.md — rules for AI agents (and humans) working in this repo

Edvora is a **multi-tenant** academy platform. Iran Brand Academy (`iba`) is tenant #1, not the product.
Before adding anything IBA asks for, ask: *would a second academy want this?* If not, it's tenant config or content.

## Where things go

| You are changing… | Put it in… |
| --- | --- |
| A business rule (price, instalments, certificate code, lead pipeline, progress) | `packages/core` + a Vitest test |
| A call to an outside service | `packages/integrations/<area>/` — interface + real adapter + **mock** + test |
| Data model / admin | `apps/web/src/collections/*` then `pnpm --filter @edvora/web generate:types` and `payload migrate:create <name>` |
| Who can do what | `apps/web/src/access/roles.ts` and the collection's `access` (default **deny**) |
| Public pages | `apps/web/src/app/(frontend)/` (server components; client components only for interaction) |
| Server mutations | `apps/web/src/app/(frontend)/actions.ts` (Zod-validate every input) |
| A decision with trade-offs | `docs/adr/NNN-title.md` |

## Non-negotiables

- **Tenant isolation.** Every public query filters by `tenant` explicitly (`lib/queries.ts`). Every new tenant-owned
  collection must be added to `multiTenantPlugin.collections` in `payload.config.ts`. Use `overrideAccess: true` only
  in server code that already checked tenant and user.
- **Never `redirect()` to a same-site page from a server action.** Next renders it through an internal request that
  loses the Host header → wrong tenant. Return `{ redirectTo }` and use `useRedirectTo`, or use a route handler with a
  303 (see ADR 005).
- **Money:** integer rials only (`rial()`, `tomanToRial()`), shown with `formatToman()`. No floats.
- **Dates:** store UTC, show with `formatJalali()`.
- **Persian text:** half-spaces (نیم‌فاصله), Persian digits in UI (`toPersianDigits`), Latin digits in codes/IDs.
  Normalise user input with `toLatinDigits` / `normalizeIranMobile`.
- **No external runtime dependencies.** No Google Fonts, analytics, reCAPTCHA or CDN scripts. Self-host everything.
- **Styling:** Tailwind classes only, design tokens from `styles.css` (`bg-brand`, `text-muted`, …). No inline styles.
  RTL: use logical utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`).
- **No invented facts** in seed data or copy. Unknown fees/dates stay empty with a `TODO(client)` note.
  Never publish the DBA "Ministry of Science" claim until verified (Notion page 04).
- TypeScript strict, no `any`. Errors in notifications are logged, never thrown into the main flow.
- Client components must not import `@edvora/core` root (it pulls `node:crypto`); use subpaths like `@edvora/core/digits`.

## Before you hand off

```bash
pnpm typecheck && pnpm test && pnpm build
```

Then use the handoff format (Notion page 06): **Task · Output · Decisions made · Open issues · Next owner**.
Human approval (Farjad) is required for: releases, provider contracts, anything sent to the client, public claims,
deleting data.

## Branches & commits

`main` (production) · `develop` (staging) · `feature/<module>-<short-name>`. Conventional commits (`feat:`, `fix:`, `chore:`).
