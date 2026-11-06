# E-022 — `/staff` desk shell + staff 2FA screens (tech spec)

UX: `docs/ux/E-022-staff-shell.md`. Decisions: ADR 005, 006, 007, 008.

## Data model
No new collections or fields. One enum value: `users.2fa.reset` in `enum_roles_permissions`
(migration `20261106_205400_users_2fa_reset_permission`, schema only). Academy-admin templates get the key from
`pnpm seed` (re-sync) and new academies from the Tenants hook. A UI field `twoFactorReset` on Users (no column).

## Rules (`packages/core`, unit-tested)
- `STAFF_DESKS`: one table — nav order, who may open each desk (`access`), landing condition and priority.
  `staffNav`, `landingDesk`, `canOpenDesk`, `deskForPath`, `requirementCode`, `safeStaffNext`.
- `staffGate`: `anonymous → inactive → needs-verify → needs-enrol → no-membership | student → ok`. 2FA is
  decided before any membership answer. Permissions = union of active memberships in the Host's academy only.
- `checkTwoFactorReset`: not on self; platform-admin targets only by platform admins; actor needs
  `users.2fa.reset` in every academy where the target is active staff (non-staff: every academy of the account),
  plus `checkGrant` on each of the target's memberships (no escalation). Returns the academies to audit in.

## Flows
| Route | Who | Behaviour |
| --- | --- | --- |
| `/staff` | staff | 307 to landing desk, else Start page |
| `/staff/{overview,leads,finance,students,teaching,support,content}` | desk permission | placeholder; 403 C otherwise |
| `/staff/security` | any staff | 2FA status, enrol, disable |
| `/staff/login` | anyone | Payload login (`/api/users/login`); settled sessions skip ahead |
| `/staff/2fa/verify`, `/staff/2fa/enrol` | pending sessions | bare layout, no permission lookups |
| `POST /staff/logout` | — | `logoutOperation` (removes `sid`), expired cookie, 303 `/staff/login` |
| `POST /api/users/2fa/reset {userId}` | `users.2fa.reset` | clear 2FA, revoke all sessions, audit — one transaction |

Endpoint statuses: 401 `{attemptsLeft}`, 429 `{lockedUntil}` (5th failure and while locked), 409 disable when
`STAFF_2FA_REQUIRED=true`, 409 setup/enable when already on, 409 reset when 2FA is off.

## Failure cases
Anonymous gets 307 to login for any `/staff/*` (no hint whether the path exists). Foreign/looping `next` → `/staff`.
Audit write failure rolls back the reset. Auth failure in the logout handler still clears the cookie.
