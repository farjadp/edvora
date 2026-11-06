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
