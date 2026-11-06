# ADR 008 — Staff desk routing: chrome split, real 403, server-rendered QR

**Status:** proposed (2026-11-06, tech-lead, E-022)

## Context
`/staff` needs its own shell (no public header/footer), a real HTTP 403 for students and for desks a person lacks,
and a QR code for 2FA enrolment without any external service. Another session is editing `/learn`, so moving the
public pages into a new route group would cause merge conflicts.

## Decision
1. **Chrome split without moving files.** The root `(frontend)/layout.tsx` stays the only root layout (theme script,
   tenant palette, fonts). It hands notice bar, header and footer to a small client component, `PublicChrome`, that
   skips them when `usePathname()` starts with `/staff`. Server components are passed as props, so nothing new
   runs on the client. Cost: the public `Header` still renders on the server for staff pages (one cached student
   cookie check) and is discarded.
2. **Real 403 via `forbidden()`** with `experimental.authInterrupts: true` and `staff/(desk)/forbidden.tsx`. Staff
   pages have no `loading.tsx`/Suspense above the guard, so the status is set before streaming. `forbidden.tsx`
   gets no props, so it re-reads the (request-cached) gate to pick variant A/B/C, and a client child reads the
   desk from the URL for the "کد دسترسی" line. Risk: the API is experimental; if it changes, the fallback is to run
   the gate in `proxy.ts` and rewrite with `status: 403`.
3. **Guards live in pages, not the shell layout.** A layout does not know its path (needed for `?next=`), so the
   `(desk)` layout only decides "shell or bare" and every page calls `requireStaff(path, desk?)`. `redirect()` here
   is from server components, which ADR 005 allows.
4. **QR: `qrcode-generator` (MIT, zero dependencies, ~60 KB, server-only).** Rendered to one SVG path in
   `lib/qr.ts` and returned by `POST /api/users/2fa/setup` as `qrSvg`. Writing our own encoder (Reed–Solomon,
   masking, versions) was not worth the risk.

## Consequences
- Adding a desk = one row in `STAFF_DESKS` (`packages/core/src/staff.ts`) + copy in `lib/staffDesks.ts`.
- `/admin` is still open to any staff (`isStaffRequest`); the «تنظیمات و راه‌اندازی» link filter is cosmetic (E-022 working answer 4).
