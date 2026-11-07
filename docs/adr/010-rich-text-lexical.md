# ADR 010 — Rich text: one Lexical editor, jsonb storage, tenant-checked references

**Status:** accepted (2026-11-06, E-031)

## Context
Farjad asked for a full editor (with image upload) wherever the admin has long-form text. Constraints: Payload 3.93 with
`@payloadcms/richtext-lexical` only, no CDN or outside editor, strict tenant isolation, and existing plain-text data
(plus a parallel content import, E-030) that must survive.

## Decision
- **One editor config** (`apps/web/src/lib/richText.ts`), also the global `editor`: H2–H4, bold/italic/underline/strike,
  inline code, links (external + internal to `courses`/`lessons`), bullet/numbered/check lists, blockquote, horizontal
  rule, alignment, indent, tables, uploads into `media` (alt text required by Media), fixed + inline toolbars.
- **Tables use `EXPERIMENTAL_TableFeature`.** It loads, saves and renders correctly in 3.93 (smoke-tested in /admin
  and on the site). Risk: the API is marked experimental and may change on a Payload upgrade; our frontend renders
  tables with its own converter, so only the editor side is exposed.
- **Tenant isolation is enforced on the server, not only in the drawers.** The upload/link drawers are filtered by the
  multi-tenant plugin's `baseFilter` (selected academy), which is UI-only. Every field built with `richTextField()`
  runs a `beforeChange` hook that resolves every upload / internal link / relationship in the value and rejects the
  write if any target belongs to another academy or does not exist (fail closed). Pure logic + tests:
  `packages/core/src/richtext.ts`. The renderer (`components/RichText.tsx`) also resolves images and links only inside
  the current academy, so a bad row that predates the check renders nothing.
- **Storage is jsonb; conversion is TypeScript, not SQL.** The migration turns each varchar column into jsonb with
  `to_jsonb(text)` (lossless JSON string), then converts every JSON-string value with the tested `toLexical`
  (paragraph per blank-line block, line breaks kept, serialised Lexical text is parsed, not wrapped). Down flattens with
  `lexicalToPlainText`. Already-jsonb columns are only normalised, so the migration is safe to re-run after a merge.
- Plain text written through the API (importers, scripts) is converted to Lexical by a field `beforeValidate` hook.

## Consequences
- Down migration loses formatting (bold, lists, images), never the text. Runs of blank lines collapse to one.
- Short single-purpose text stays `textarea` (summary, excerpt, quote, lead message, role description, internal notes).
- Lexical parks hidden floaters at `translateX(-10000px)`; in RTL that created ~10 000px of sideways scroll on every
  edit page with a rich-text field. `custom.scss` clips `.rich-text-lexical__wrap` horizontally.
- Whoever merges after another migration-touching branch must re-run `payload migrate:create` and paste this migration
  body (it has no generated snapshot dependencies besides the column list).
