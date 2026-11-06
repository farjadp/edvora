# ADR 001 — Custom build on Next.js + Payload CMS 3 + PostgreSQL

**Status:** accepted (2026-11-06)

## Context
Build vs buy. WordPress + BuddyBoss + LMS plugin covers ~60% of the 13 modules and is weak on the lead CRM, cohorts,
defense scoring, company accounts and certificate verification. Edvora is now a white-label product, not one site.

## Decision
One TypeScript monorepo: Next.js (App Router) + Payload CMS 3 (admin, auth, access control, APIs generated from
collections) on PostgreSQL. pnpm workspaces + Turborepo. Business rules in `packages/core`, adapters in
`packages/integrations`.

## Consequences
+ 100% of scope reachable, typed end to end, friendly to AI agents.
+ Payload's admin removes most of module 2.
− Slower to first launch than a WordPress theme; we own maintenance.
