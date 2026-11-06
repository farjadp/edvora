# E-021 — Admin foundation (spec)

Implements ADR 006 §4 and Notion page 11 §3. One page, decisions only.

## Data model
| Collection | Tenant-owned | Key fields | Delete |
| --- | --- | --- | --- |
| `roles` | yes | `name`, `key` (unique per tenant), `description`, `permissions[]` (catalog keys), `template` (read-only origin), `archived` | denied |
| `memberships` | yes | `user`, `roles[]`, `scope { courses[], cohorts[], ownRecordsOnly }`, `status` (active / suspended), `expiresAt`, `note`, `createdBy` | denied |
| `audit-logs` | yes | `actor`, `actorEmail`, `action`, `collection`, `docId`, `changes` (json before/after, secrets redacted), `ip` | denied; update denied; create only from server hooks |
| `users` (changed) | no (plugin `tenants[]`) | profile (fa/latin names, email, birth date, city, job title, company, education, LinkedIn, public profile, tags, source, internal notes, national code), `status` (active / suspended / archived) + `statusReason`, `twoFactor` (hidden) | denied |

A user may hold several memberships in one academy (e.g. advisor for all leads + instructor for one cohort); grants add up.
The legacy `users.roles` select stays only as the **platform flag** (`super-admin`) and the student marker. Staff access no
longer reads it. Creating a membership adds the tenant to `users.tenants` so the multi-tenant plugin keeps working.

## Permission catalog (`packages/core/src/permissions.ts`)
Keys are `module.action[.own|.all]`, from Notion 11 §3.1, plus `leads.create`, `orders.edit`, `enrollments.view`
(needed to map today's access). `X.all` implies `X.own`. Platform keys (`tenants.manage`, `tenants.credentials`,
`impersonate`) are never grantable inside an academy; only the platform `super-admin` flag carries them.

## Role templates (seeded per academy, editable copies)
academy-admin (everything except platform) · advisor · instructor · finance «مالی» · support «پشتیبانی» ·
content-editor · student (empty). Lists exactly as Notion 11 §3.2, plus the read permissions each needs to use Payload.

## How access reads permissions
1. `getAccess(req)` (web) loads the user's memberships + roles from the DB once per request (cached on `req.context`),
   never from the JWT. Suspended/archived users, suspended/expired memberships and archived roles grant nothing.
2. `packages/core/src/access.ts` (pure): `can()`, `tenantsWith()`, `accessWhere()` (turns grants + scope into a
   query filter: tenant, owner field for `.own`, course/cohort for scoped memberships; unknown field → deny),
   `checkGrant()` (no escalation, incl. scope), `canEditRole()`, `managersRemaining()` (last `roles.manage`),
   `checkFourEyes()`.
3. Collection `access` functions call these; default deny; `delete` is denied everywhere.
4. Staff 2FA: TOTP (RFC 6238, `node:crypto`, secret sealed with AES-GCM). If a user has 2FA on, the session (`sid`)
   must be verified via `POST /api/users/2fa/verify` before any permission applies. `STAFF_2FA_REQUIRED=true` makes
   enrolment mandatory for staff (off by default until E-022 ships the enrol/verify screens).

## Failure cases
Escalation, self-edit of own memberships, removing the last `roles.manage`, cross-tenant role/user references,
unknown/platform permission in a role → `APIError 403/400`, nothing written. Audit writes share the request
transaction: if the audit row fails, the change rolls back.

## Migration plan
`20261106_xxxxxx_admin_foundation`: schema for the new collections/fields, then a data step: for each tenant create
the template roles; for each user with legacy `admin/advisor/instructor` roles create a membership per tenant they
belong to with the matching template. `company-manager` has no template (B2B portal, later). Seed upserts templates
for iba and demo.
