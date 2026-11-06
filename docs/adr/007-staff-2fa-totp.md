# ADR 007 — Staff second factor: self-hosted TOTP, verified per session

**Status:** proposed (2026-11-06, E-021) — needs Farjad's review

## Context
ADR 006 requires a second factor for staff. SMS OTP costs money per login, depends on the SMS provider being up and
is weak against SIM swap. Payload's `/admin` login form cannot take an extra field, and Payload has no login-view
override, so the code cannot be asked for in the same request as the password.

## Decision
- **TOTP (RFC 6238)** implemented in `packages/core/src/totp.ts` with `node:crypto` only. Works offline with any
  authenticator app; nothing leaves our servers (works on Iran's national network). The secret is sealed with
  AES-256-GCM using a key derived from `PAYLOAD_SECRET`; replayed codes and brute force (5 tries → 15 min lock) are refused.
- **Verified per session, not per login request.** Password login creates a Payload session (`sid`). While a user
  with 2FA on has not verified that `sid` via `POST /api/users/2fa/verify`, permission resolution returns nothing:
  no admin panel, no API access beyond their own user record. Verification is stored on the user (hidden field).
- **Rollout flag** `STAFF_2FA_REQUIRED` (default `false`): when `true`, staff without 2FA also get no permissions
  until they enrol. Turn it on once E-022 ships the enrol/verify screens.

## Consequences
- Until E-022, 2FA is enrolled and verified through the API only; Payload `/admin` shows "unauthorized" for a
  pending session instead of a code prompt.
- Changing `PAYLOAD_SECRET` invalidates all TOTP secrets (staff re-enrol). Rotation needs a re-seal step.
- Lost phone = an admin reset flow (not built yet; today only a super-admin can clear it in the DB).
- SMS OTP stays the student login (unchanged).
