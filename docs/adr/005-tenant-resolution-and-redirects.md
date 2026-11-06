# ADR 005 — No same-site `redirect()` from server actions

**Status:** accepted (2026-11-06)

## Context
Found in testing: after login on `demo.localhost`, `redirect('/courses/…')` inside a server action rendered the target
for the **IBA** tenant (404). Next.js renders a same-origin action redirect through an internal request that does not
carry the original Host header, so host-based tenant resolution falls back to the default tenant.

## Decision
- Server actions return `{ redirectTo }`; the client hook `useRedirectTo` does a full navigation.
- Plain form posts that must redirect (logout, pay next instalment) are **route handlers** returning HTTP 303.
- Gateway callback URLs and the mock gateway use the request origin (`lib/origin.ts`), not a global site URL, so each
  academy's buyers return to their own domain.

## Consequences
One extra round trip after login/checkout. Anything new that redirects must follow this rule (see AGENTS.md).
