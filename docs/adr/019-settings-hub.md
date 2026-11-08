# ADR 019 — Settings hub: one place for everything configurable

**Status:** proposed (2026-11-08, E-047)

(ADR 017 is payment methods, E-045; ADR 018 is the AI assistant, E-046. This is 019.)

## Context
Settings were spread over the `tenants` edit screen (four tabs, one of them "technical"), env vars (SMS, payment,
storage, live classes, `STAFF_2FA_REQUIRED`) and nowhere at all (favicon, SEO defaults, login texts, legal pages,
message templates). Farjad wants one **Settings («تنظیمات»)** section where an academy admin finds everything, from the
logo to the API keys, and where the platform owner sets the platform-wide rules. Two modules built in parallel
(payment methods, E-045; AI assistant, E-046) bring their own tenant-scoped settings and must slot in without this
work rebuilding them.

## Decision

### 1. Where it lives
`/admin/settings` and `/admin/settings/<section>`: Payload custom admin views (`admin.components.views`), Seal console
look (`c-*` and `ed-set*` classes in `custom.scss`, like the roles-compare view of ADR 016 — Payload admin does not
load Tailwind). A left list of sections, one form per section, Persian labels and help text. `/staff` links to it
(an external link in the staff menu) for anyone who may see at least one section. In `consoleNav.ts` the hub
replaces the `tenants` entry of the "settings" group; roles, memberships, audit log and import stay where they are
and are also listed in the hub as link sections.

Forms are plain HTML forms posting `multipart/form-data` to `POST /api/settings/<section>` (a Next route handler,
not a server action, so no `redirect()` through an internal request — ADR 005). The handler answers 303 back to the
section with `?saved=1` or `?error=<code>`. Only the colour preview is a client component.

### 2. Two scopes
| Scope | Who | Stored in |
| --- | --- | --- |
| **Academy** (per tenant) | holders of the section's permission in that academy | `tenants` (non-secret fields), `integration-settings` (provider config + sealed keys) |
| **Platform** | Edvora super admins only (`isPlatformAdmin`) | `platform-settings` (Payload global) and the platform-only fields of `tenants` (`domains`, `plan`, `limits`, `features`) |

The academy edited is explicit: the `academy` query parameter, else the academy picked in the admin's academy
selector, else the person's only academy. Every read and write checks the permission **in that academy**
(`canIn`), so a cookie or a forged form field naming another academy gets `403`.

### 3. Sections and permissions (default deny)
Catalogue and rules: `packages/core/src/settings.ts` (unit-tested).

| Section | Permission |
| --- | --- |
| Identity · Appearance · Contact & social · SEO · Homepage blocks · Certificates · Login page · Features · Legal pages | `settings.edit` (exists) |
| Notifications (SMS and email templates) | `templates.edit` (exists) |
| Integrations (SMS, email, live classes) | `settings.integrations` (**new**, academy-grantable) |
| Payments (E-045) | `payments.settings` (defined by E-045) |
| AI assistant (E-046) | `ai.manage` (defined by E-046) |
| Platform: providers, 2FA policy, academies (domains, plan, limits, modules), storage | super admin only |

`settings.integrations` is separate from `settings.edit` because an API key spends the academy's money and can send
messages in its name; a marketing editor who changes the logo should not see or replace it. The academy-admin
template holds every academy key, so it gets the new one; the migration adds it to existing academy-admin roles.

### 4. Section registry (hook point for E-045, E-046 and later modules)
`apps/web/src/lib/settingsRegistry.ts` holds `SettingsSectionDef = { key, label, help, group, scope, permission,
href? }`. A section either renders a form inside the hub (no `href`) or links to its module's own screen (`href`).
A module registers itself with one entry; the hub filters by permission and by whether the module is installed
(the Payload collection named in `requiresCollection` exists), so "Payments" and "AI assistant" appear as soon as
E-045 / E-046 land and are hidden before. This work does not rebuild their settings.

### 5. Secrets: encrypted at rest, write-only
- One row per academy and provider kind in `integration-settings` (`sms`, `email`, `live`): `provider`, `enabled`,
  non-secret `config` (sender line, SMTP host/port/from, BBB URL), `secretSealed`, `secretSetAt`, `lastTest`.
- `secretSealed` is AES-256-GCM (`sealSecret`, the same primitive as TOTP secrets, ADR 007, E-045 and E-046), the key
  from `SETTINGS_SECRETS_KEY`, else derived from `PAYLOAD_SECRET`, **bound to the academy and kind**
  (`settings:<tenant>:<kind>:`), so a sealed value copied to another academy's row does not open.
- The field is `hidden` (Payload never returns it — REST, GraphQL, admin) and the collection's create/update/delete
  are closed to the API: only the settings route handler writes, after its own permission check. The form shows
  only "set on <date>" / "not set"; an empty password input keeps the stored value, a "remove" checkbox clears it.
- **Test connection** runs on the server with the stored (or just-typed) secret and returns only ok / a short error.
  SMS: Kavenegar `account/info`; mock always ok. Email: SMTP greeting + `EHLO` over TCP/TLS (no mail sent, no new
  dependency). Live classes: BigBlueButton `getMeetings` checksum call. Storage (platform): a `HEAD` on the bucket.
- **SSRF:** a staff-typed host (SMTP, BBB) must resolve to public addresses only; loopback, private, link-local and
  CGNAT ranges are refused in production (`hostAllowed`). Dev and CI may test against local servers.
- **Fallback:** env vars stay the platform default. At runtime `providers.ts` (`getSmsFor`) uses an academy's own
  SMS account only when it is enabled, has a key that opens, and the platform allows academy providers for SMS;
  otherwise the env provider. The OTP dev code is shown only when the provider actually used is the mock.
  Live classes and email are stored and tested but not used at runtime yet: BBB webhooks and recordings are verified
  with the instance secret (ADR 012) and need per-academy routing first; email has no sender in the codebase yet.

### 5b. Message templates
Per event (`MESSAGE_EVENTS`: OTP, lead received, payment received, instalment due, enrolment confirmed, live
reminder, certificate issued) and channel (SMS, email), with a fixed variable list per event; unknown variables are
refused on save. Wired today: lead received and enrolment confirmed (SMS). The OTP keeps using the provider's
approved verify template (its name is set per academy in Integrations). The other events are ready for the
notification module.

### 6. Audit
Every save writes one `audit-logs` row (`settings.<section>`, the changed field names with before/after for plain
fields). Secret inputs are logged as `[changed]` / `[removed]`, never the value; `secretSealed` is also in the audit
redaction list for the generic hooks.

### 7. Uploads
Logo (light/dark), favicon, OG image and signature image go to `media` (tenant-scoped) through the handler, which
checks type **by content** (PNG, JPEG, WebP; ICO for the favicon) and size (logo/signature 1 MB, favicon 256 KB,
OG 2 MB). SVG is refused (script in an SVG would run on the academy's origin). Nothing is loaded from outside.

### 8. Colours
Hex only. On save, the brand and accent colours must pass AA against the panel palettes: brand text on the site's
light surfaces ≥ 4.5:1, text on brand/accent fills ≥ 4.5:1, the brand chip on the console surfaces ≥ 3:1 (dark
theme colours are derived and always pass, `tenantPalette`). A failing colour is refused with the nearest passing
shade offered. The checks live in `@edvora/ui/color` (`colourChecks`) and run in the live preview too.

### 9. `zarinpalMerchantId`
E-045 (payment methods) landed while this was built; its checkout reads only `payment-methods` (or env), so the old
field was already unused. Migration `e047_zarinpal_to_payment_methods` moves each stored merchant id into a
**disabled** Zarinpal row in `payment-methods` (sealed by that collection's hook) and clears the old value; an
academy that already has a Zarinpal row is left as it is. The field is hidden and read-only; dropping the column is
deleting data and waits for Farjad's approval. The dead `getPayment(tenant)` helper is removed.

## Consequences
- New: `integration-settings` collection (tenant-scoped, in `multiTenantPlugin.collections`), `platform-settings`
  global, Tenant fields (identity, SEO, social, certificate signer, login texts, toggles, legal pages, message
  templates, limits), permission `settings.integrations`, env `SETTINGS_SECRETS_KEY` (optional), migration
  `e047_settings_hub`, `e047_admin_integrations_key`, `e047_zarinpal_to_payment_methods`.
- The old Tenants tabs keep working for super admins; academy staff are sent to the hub from the nav.
- Rotating `SETTINGS_SECRETS_KEY` makes stored keys unreadable (they show "could not be opened, enter again"); the
  env fallback keeps sending in the meantime.
