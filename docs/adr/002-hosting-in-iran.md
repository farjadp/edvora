# ADR 002 — Iranian tenants are hosted inside Iran

**Status:** accepted (2026-11-06)

## Context
During internet shutdowns only Iran's national network works. US cloud providers (Vercel, Supabase Cloud, Railway,
AWS, Stripe, Sentry SaaS) forbid serving Iranian customers. Docker Hub blocks Iranian IPs.

## Decision
- Iranian tenants run as a **dedicated instance** on ArvanCloud (backup: Liara/Hamravesh), Docker on VMs.
- No runtime dependency on foreign hosts: fonts via `@fontsource` (bundled), no Google Fonts/Analytics/reCAPTCHA.
- Self-hosted ops: GlitchTip, Umami, Uptime Kuma; private container registry; npm/Docker mirrors.
- The same codebase can run a **shared cloud** deployment for non-Iranian tenants.

## Consequences
Two deployment modes, one codebase. Provider choice is per environment/tenant through adapters (ADR 003).

## Exception — IBA sales preview on Railway (2026-11-06, approved by Farjad)
For one client demo (E-030), IBA's **public** website content (the same text and images already on
iranbrandacademy.com) is shown on the Railway demo project in a separate service, `web-iba`, so Farjad can present
it remotely. Limits: public marketing content only (no students, payments, SMS or any personal data beyond the
testimonials/faculty already public on their site); every host of that service is `noindex` and behind HTTP basic
auth; mock providers only. It is temporary: remove the `web-iba` service and the `iba` rows after the meeting
(runbook, *IBA client preview*). Risk accepted by Farjad: Railway's terms forbid serving Iranian customers, and
Iranian IPs may not reach it — test from where the client will be before relying on it.
