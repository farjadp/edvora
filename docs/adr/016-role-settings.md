# ADR 016 — Role settings: security, experience and three new templates

**Status:** proposed (2026-11-08, E-039)

(The brief said `015`; 015 is already `admin-language-default`, so this is 016.)

## Context
Until now a role (ADR 006) was a name and a list of permissions. Farjad wants a role to also say how its holders
must sign in, what they see first and which menus and dashboard blocks they get, plus three more templates.
The rules must hold on every request (API, `/admin`, `/staff`), not only in the UI.

## Decision

### Fields on `roles` (all optional, default = today's behaviour)
| Group | Field | Type | Meaning |
| --- | --- | --- | --- |
| `security` | `require2fa` | checkbox | This role grants nothing in a session that has not passed TOTP. |
| | `maxSessionHours` | number 1–720 | This role grants nothing once the Payload session (`sid`) is older than this. |
| | `loginHours.enabled`, `.from`, `.to` | checkbox + 2 × integer 0–23 | This role grants nothing outside `[from, to)` Tehran time. `from > to` wraps midnight (e.g. 22→6). |
| `experience` | `landing` | select | `auto` (default: the desk priority of ADR 008) · a desk key · `admin` (`/admin`). |
| | `menuSections` | select hasMany | Console menu groups shown (`CONSOLE_GROUPS` keys). Empty = all. |
| | `dashboardWidgets` | select hasMany | Overview / `/admin` dashboard blocks (`kpis`, `alerts`, `activity`, `donut`, `bars`, `quick`, `summary`). Empty = all. |

Validation and the catalogues live in `packages/core/src/roleSettings.ts` (unit-tested); the collection only wires them.

### Enforcement points
1. **Security is a filter on grants, per role.** `loadMembershipGrants` (`apps/web/src/access/permissions.ts`)
   checks each role's policy against the session (`rolePolicyBlock` in core) before adding its permissions. A role
   whose rule fails contributes nothing and is listed in `MembershipGrant.withheld` with a reason
   (`needs-2fa`, `session-too-old`, `outside-hours`). Because every access function, `isStaffRequest` (`/admin`
   access) and the staff gate read these grants, the rule holds for the REST API, `/admin` and `/staff` alike.
   Other roles of the same person keep working (least surprise: an instructor role limited to work hours does not
   switch off the person's unrestricted support role).
2. **Session facts come from the database:** `sid` from the JWT, the session's `createdAt` from `users.sessions`,
   2FA verification from `twoFactor.verifiedSessions` (ADR 007). The user record is only re-read when some role of
   the person has a security rule or 2FA is on.
3. **Login flow (`/staff`):** `staffGate` gets the withheld reasons for this academy. When nothing is granted here
   and a role was withheld for `needs-2fa`, the gate answers `needs-enrol` (or `needs-verify`) exactly like the
   global `STAFF_2FA_REQUIRED` flag; `session-too-old` → back to `/staff/login?error=session` (the logout route
   ends the old session); `outside-hours` → `/staff/login?error=hours`. Payload `/admin` shows its normal
   "unauthorized" for those sessions.
4. **Experience is UX only.** Landing, menus and widgets are merged across the person's active roles in the
   academy (`mergeExperience`: any role with an empty list means "all"; landing = the first role's non-`auto`
   choice the person can actually open). Menus and widgets are filtered after the permission filter, so they can
   only hide things. Every page and API call still checks permissions.

### New templates (`ROLE_TEMPLATES`)
- **`teaching-assistant` — دستیار آموزشی:** `courses.view`, `enrollments.view`, `assignments.grade`,
  `submissions.grade`, `qa.answer`. No lesson editing, live hosting, certificates or money. Scope to the
  instructor's courses/cohorts on the membership.
- **`reporting` — گزارش‌گیر (فقط خواندن):** `reports.*`, `courses.view`, `enrollments.view`, `orders.view`,
  `users.view`, `certificates.view`, `audit.view`. Every key is a read key (test). **Leads are left out on
  purpose:** `leads.view` also allows updating a lead (advisors edit their own leads), so a reporting role with it
  could change data. When a separate `leads.edit` exists, add `leads.view.all` here.
- **`sales-manager` — سرپرست فروش:** the advisor set + `leads.view.all`, `leads.assign`, `reports.sales`. "Team"
  = the advisors of the academy (no team model yet); narrow it with the membership scope.

Template default experience: landing on the matching desk (advisor/sales-manager → leads, instructor/TA → teaching,
finance → finance, support → support, content-editor → content, reporting → overview). No template turns on a
security rule by default: 2FA stays optional (ADR 007, Farjad 2026-11-06) until an admin ticks it per role.

### Roles screen
- The permission field is a custom admin field: the catalogue grouped by area, a Persian description for every
  permission (`PERMISSION_DESCRIPTIONS`, typed so a new key without text fails the build).
- `/admin/roles-compare`: a who-can-do-what table across the selected academy's roles (rows = permissions, grouped;
  columns = roles), read with the viewer's own access (`overrideAccess: false`).

## Consequences
- A per-role security rule is stricter than the global flag but never looser: `STAFF_2FA_REQUIRED=true` still
  applies to every staff role.
- Session length is measured from login (`createdAt`), not from the last refresh.
- Login hours use Tehran wall-clock time (Iran has no DST since 2022, so a fixed +03:30 offset).
- Changing a role's rules takes effect on the next request for everyone holding it.
- Roles can still not be deleted (archive), and editing security or experience needs `roles.manage` plus the
  no-escalation rule for the permission list (unchanged).
