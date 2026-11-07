# ADR 015: Persian is the /admin language whatever the browser sends

Status: accepted (E-035, 2026-11-06)

## Context

Payload 3.93 picks the admin UI language in `getRequestLanguage`: the `payload-lng` cookie, then the browser's
`Accept-Language`, then `i18n.fallbackLanguage`. `fallbackLanguage: 'fa'` therefore only applies when the browser
asks for a language we do not ship. Farjad's English browser got `<html lang="en" dir="LTR">` on Railway, with
English group and collection labels. Payload has no config switch to ignore `Accept-Language`.

## Decision

A Next proxy (`apps/web/src/proxy.ts`, matcher `/admin`, `/admin/:path*`) adds `payload-lng=fa` to the request and
sets it on the response when the cookie is missing or holds an unsupported value. A cookie the person set (Account →
Language, Payload's own `switchLanguage` server function) is never changed. Pure logic in `lib/adminLanguage.ts`.

## Alternatives

- Drop `en` from `supportedLanguages`: no English for anyone, and English labels in code stop being reachable.
- Patch or wrap Payload's RootLayout: fragile across Payload upgrades.
- Strip `Accept-Language` in the proxy: also changes what the rest of Payload (API errors) sees, for no gain.

## Consequences

- One proxy hop on /admin requests only; public pages and the API are untouched. No tenant logic in the proxy.
- First /admin visit already renders fa/RTL (request header rewritten), no reload needed.
- e2e `admin-language.spec.ts` guards it; `collections/labels.test.ts` checks every visible label has Persian.
