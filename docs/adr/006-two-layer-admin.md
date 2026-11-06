# ADR 006 — Two-layer admin: Payload for configuration, role desks for daily work

**Status:** accepted (2026-11-06, approved by Farjad)

## Context
The admin is Payload CMS at `/admin`. Its generated list and edit screens are good for editing records
(courses, tenant settings, posts) but slow for people who repeat the same task all day: an advisor working
~60 leads, finance approving receipts, an instructor grading. The full spec is Notion page 11 · Admin panel.

The current roles (`super-admin`, `admin`, `advisor`, `instructor`, `company-manager`, `student`) cannot express
four-eyes approval for money: the person who records a manual payment or a refund must not be the one who approves it.

## Decision
1. **Two UIs, one data model.**
   - **Payload `/admin`** — configuration and content: academies, catalog, website content, settings, staff and roles.
     Used by `super-admin` and `admin`.
   - **Role desks** — our own Next.js pages under `/staff/...` for daily work: advisor Today queue, finance desk,
     teaching desk, support inbox, academy home. Server components that read through the Payload local API.
2. **Same rules in both.** Access stays in `apps/web/src/access/roles.ts` and collection `access` (default deny).
   Desks never use `overrideAccess: true` without checking tenant and role first. Every desk query filters by
   `tenant` explicitly (`lib/queries.ts`).
3. **Business rules live in `packages/core`** (lead outcome → status, approval checks, overdue states), so both UIs
   behave the same.
4. **Two new roles:** `finance` (payments, instalments, manual receipts, refunds, exports) and `support`
   (tickets, student lookup, no money actions). Labels: «مالی» and «پشتیبانی».

## Consequences
- More UI to build and test than using Payload only; in return the high-volume screens can be fast and RTL-first.
- Desk pages follow ADR 005 (no same-site `redirect()` from server actions).
- Adding roles needs a migration and access updates in every collection; tests must cover that `finance` and
  `support` cannot reach other tenants or each other's actions.
- Staff (all roles except `student`) need password + OTP as second factor.
