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
4. **Permissions, not fixed roles** (Farjad, 2026-11-06: the academy admin must be able to create users with full
   details and exactly the access they need):
   - A **permission catalog** (`module.action[.scope]`) is defined in code and is the only thing access checks read.
   - **Roles** are editable, named sets of permissions **per academy**. Each academy is seeded with templates:
     academy admin, advisor, instructor, `finance` «مالی», `support` «پشتیبانی», content editor, student.
     Admins can copy templates and create custom roles.
   - **Membership** (user × academy) holds roles, scope (courses / cohorts / own vs all leads and tickets), status
     and optional expiry. One account per mobile across Edvora; access is per academy.
   - Nobody grants what they do not have; platform permissions are never grantable inside an academy; the last
     role manager cannot be removed; nobody edits their own roles; four-eyes is checked on the action.
   - Permissions are resolved server-side per request from the database, not from the JWT, so revoking works at once.

## Consequences
- More UI to build and test than using Payload only; in return the high-volume screens can be fast and RTL-first.
- Desk pages follow ADR 005 (no same-site `redirect()` from server actions).
- `access/roles.ts` is replaced by permission checks (`can(user, tenant, 'payments.manual.approve', scope)`) in
  `packages/core` with tests; every collection's `access` moves to it. Migration: today's global `roles` become
  memberships with the matching template role.
- Fixes current gaps: roles are global on the user, advisors/instructors can read all users, admins can hard-delete
  users, and removed roles stay valid until the 8 h token expires.
- Tests must cover tenant isolation, scope (own leads, own cohorts), no privilege escalation and four-eyes.
- Staff (all roles except `student`) need password + OTP as second factor.
