# ADR 004 — Multi-tenancy with Payload's multi-tenant plugin

**Status:** accepted (2026-11-06)

## Decision
- `tenants` collection = an academy: domains, plan, enabled modules (`features`), branding (colors, logo, default
  theme), site content (notice bar, manifesto, stats, client logos, services), certificate prefix, gateway credentials.
- `@payloadcms/plugin-multi-tenant` adds a `tenant` field and access scoping to every tenant-owned collection and a
  `tenants` array on users. `super-admin` (AshaVid) sees all tenants.
- The public site resolves the tenant from the **Host header** (`lib/tenant.ts`), falling back to
  `DEFAULT_TENANT_SLUG` for localhost. Public reads always add an explicit `tenant` filter.
- Student sessions are bound to the tenant that issued them.
- Media: local disk in dev; ArvanCloud Object Storage (S3 adapter) in production — to add with the staging server.

## Open
Schema-per-tenant for high-value dedicated clients; plan-based feature gating in the UI; custom-domain SSL automation
(Caddy on-demand TLS).
