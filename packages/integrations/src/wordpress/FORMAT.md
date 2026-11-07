# Edvora WordPress export — format v1 (contract)

Shared contract between the PHP plugin (`integrations/wordpress-plugin/`) and the TypeScript importer
(`packages/integrations/src/wordpress/`). ADR 011 is the rationale; this file is the spec. Change it only with a
`formatVersion` bump or a backwards-compatible addition, and update both sides plus the fixtures in the same PR.

## 1. Bundle file (download mode)

`<site>-<yyyymmdd-hhmm>.edvora-bundle` = **gzip** of UTF-8 **NDJSON** (one JSON object per line, `\n` endings).
Chosen over zip (ADR 011 amended): PHP `ZipArchive` is often missing on Iranian shared hosts, while `zlib`
(`gzencode`/`gzopen`) is near-universal; Node reads it with built-in `node:zlib` — no extra dependency on either side.

| Line | Content |
| --- | --- |
| 1 | `{"type":"manifest", ...Manifest}` |
| 2..n-1 | `{"type":"record", ...SourceRecord}` grouped by kind in the order of §4 |
| n | `{"type":"signature","alg":"HMAC-SHA256","value":"<hex>"}` |

`value = hex(HMAC-SHA256(secret, bytes of lines 1..n-1 including their trailing "\n"))` over the
**uncompressed** content. The importer refuses a bundle whose signature line is missing, malformed or wrong, before
parsing any record.

## 2. Push mode (plugin → `<edvora-url>/api/import/push/*`)

All requests are signed (see §5). Bodies are uncompressed JSON / NDJSON (`Content-Type: application/x-ndjson`).

| Request | Body | Response |
| --- | --- | --- |
| `GET /api/import/push/ping` | — | `200 {"ok":true,"tenant":"iba","job":"<id>","status":"…"}` |
| `POST /api/import/push/manifest` | Manifest JSON | `200 {"ok":true}`; job → `ingesting`; replaces an earlier manifest only while still `ingesting` |
| `POST /api/import/push/records?kind=<kind>&seq=<n>` | NDJSON, ≤ 500 records of one kind | `200 {"ok":true,"stored":<count>}`; same `(kind, seq)` again = overwrite (idempotent retry) |
| `POST /api/import/push/finish` | `{"chunks":{"<kind>":<chunkCount>}, "counts":{"<kind>":<recordCount>}}` | `200 {"ok":true}`; job → `ready` once counts match, else `409` with the missing chunks |

Errors: `401` bad/expired/revoked connection or signature, `409` state conflict, `413` chunk too large (> 8 MB),
`422` invalid record envelope, `429` rate limit. Body always `{"ok":false,"code":"…","message":"…"}`.

## 3. Manifest

```jsonc
{
  "format": "edvora-wp-export",
  "formatVersion": 1,
  "pluginVersion": "1.0.0",
  "createdAtGmt": "2026-11-06T10:00:00Z",
  "connectionId": "<id shown in Edvora>",
  "tenantSlug": "iba",
  "site": {
    "siteId": "<hex sha256(home_url + '|' + $wpdb->prefix)>",
    "homeUrl": "https://example.ir", "siteUrl": "https://example.ir",
    "name": "…", "wpVersion": "5.7.21", "phpVersion": "7.4.33",
    "locale": "fa_IR", "timezone": "Asia/Tehran", "gmtOffset": 3.5,
    "permalinkStructure": "/%postname%/", "uploadsBaseUrl": "https://example.ir/wp-content/uploads"
  },
  "plugins": [{ "slug": "lifterlms", "folder": "lifterlmsfa", "version": "4.21.3", "active": true }],
  "theme": { "stylesheet": "buddyboss-theme", "template": "buddyboss-theme", "version": "…" },
  "woo": { "currency": "IRT", "hpos": false, "priceDecimals": 0 } ,     // null when WooCommerce is not active
  "lifterlms": { "currency": "IRR" },                                   // null when not active
  "tutor": { "currency": "USD", "monetizeBy": "wc" },                   // null when not active
  "counts": { "wp.user": 1234, "woo.order": 5678 }
}
```

`plugins[].slug` is the **canonical** slug (read from the plugin header `Text Domain` or known main-file names),
`folder` the real directory (IBA renamed LifterLMS to `lifterlmsfa`).

## 4. Record envelope and kinds

```ts
type SourceRecord = {
  type: 'record'
  v: 1
  kind: string                              // see table
  wpId: string                              // primary key as string; composite keys joined with ':'
  data: Record<string, unknown>             // main row, column names untouched (values as strings, as $wpdb returns them)
  meta?: Record<string, string | string[]>  // meta rows; repeated keys → string[]; serialized PHP values are
                                            // unserialized by the plugin with allowed_classes=false and re-encoded
                                            // as JSON *strings* prefixed "json:" (e.g. "json:[\"subscriber\"]")
  rel?: Record<string, string[]>            // related ids: terms, children
  items?: Record<string, unknown>[]         // embedded child rows (order items, question answers)
}
```

Export order (dependencies first) and exactly what each kind carries:

| # | kind | `wpId` | `data` | `meta` | `rel` / `items` |
| --- | --- | --- | --- | --- | --- |
| 1 | `wp.user` | `ID` | `wp_users` row **without** `user_pass`, `user_activation_key` | allow-listed usermeta only: `first_name`, `last_name`, `nickname`, `description`, `<prefix>capabilities`, `digits_phone`, `digits_phone_no`, `digt_countrycode`, `mobile`, `phone_number`, `billing_phone`, `billing_first_name`, `billing_last_name`, `billing_email`, `billing_city`, `_tutor_instructor_status`, and any key matching `/(national|melli|meli)_?(code|id)/i` | — |
| 2 | `wp.term` | `term_taxonomy_id` | `term_id, name, slug, taxonomy, parent, description, count` for taxonomies `category, post_tag, product_cat, course_cat, course_tag` | termmeta | — |
| 3 | `wp.attachment` | `ID` | posts row (`post_type='attachment'`) | `_wp_attached_file`, `_wp_attachment_image_alt` | — |
| 4 | `wp.post` | `ID` | posts row, `post_type IN ('post','page')`, `post_status IN ('publish','draft','private','future')` | all meta except keys starting `_edit_`, `_wp_old_`, `_oembed_` | `rel.terms` |
| 5 | `woo.product` | `ID` | posts row `post_type='product'` | all meta except `_edit_*`, `_oembed_*`, `_product_attributes` | `rel.terms` |
| 6 | `woo.coupon` | `ID` | posts row `post_type='shop_coupon'` | all meta | — |
| 7 | `woo.order` | order id | **normalised** (same for HPOS and legacy): `id, status` (with `wc-` prefix), `currency, total, discount_total, tax_total, customer_id, billing_first_name, billing_last_name, billing_email, billing_phone, payment_method, payment_method_title, transaction_id, date_created_gmt, date_paid_gmt, date_completed_gmt, parent_id, type` | all order meta (HPOS `wc_orders_meta` or postmeta) except `_edit_*`, keys containing `card_number_full` | `items[]`: `{id, type: 'line_item'|'coupon'|'fee', name, product_id, variation_id, qty, subtotal, total, code?, discount?}` |
| 8 | `woo.membership_plan` | `ID` | posts row `post_type='wc_membership_plan'` | all meta | — |
| 9 | `woo.membership` | `ID` | posts row `post_type='wc_user_membership'` (`post_author` = user, `post_parent` = plan, `post_status` e.g. `wcm-active`) | all meta | — |
| 10 | `lifterlms.course` / `.section` / `.lesson` / `.quiz` / `.question` / `.access_plan` / `.coupon` / `.order` / `.transaction` / `.membership` / `.certificate` (earned: `llms_my_certificate`) | `ID` | posts row of `course`, `section`, `lesson`, `llms_quiz`, `llms_question`, `llms_access_plan`, `llms_coupon`, `llms_order`, `llms_transaction`, `llms_membership`, `llms_my_certificate` | all meta | `rel.terms` for course |
| 11 | `lifterlms.user_meta` | `meta_id` | `lifterlms_user_postmeta` row: `user_id, post_id, meta_key, meta_value, updated_date` | — | — |
| 12 | `tutor.course` / `.topic` / `.lesson` / `.quiz` / `.enrollment` | `ID` | posts row of `courses`, `topics`, `lesson`, `tutor_quiz`, `tutor_enrolled` | all meta | `rel.terms` for course |
| 13 | `tutor.question` | `question_id` | `tutor_quiz_questions` row | — | `items[]` = its `tutor_quiz_question_answers` rows |
| 14 | `tutor.progress` | `<user_id>:<lesson_id>` | `{user_id, lesson_id, completed_at}` from usermeta `_tutor_completed_lesson_id_<lesson_id>` | — | — |

Rules for the plugin:
- Only kinds whose plugin is active are exported; tables that don't exist are skipped (`counts` omits them).
- Dates: copy both local and `_gmt` columns as stored; never convert.
- Never export: `user_pass`, `user_activation_key`, `session_tokens`, application passwords, options other than those
  read into the manifest, `wp_usermeta` keys outside the allow-list.
- Strings are UTF-8; invalid sequences replaced (`wp_check_invalid_utf8( $s, true )`).

## 5. Request signature (push mode)

Headers: `X-Edvora-Connection: <connectionId>`, `X-Edvora-Timestamp: <unix seconds>`, `X-Edvora-Nonce: <32 hex>`,
`X-Edvora-Signature: <hex>`.

```
canonical = METHOD + "\n" + PATH_WITH_QUERY + "\n" + TIMESTAMP + "\n" + NONCE + "\n" + hex(sha256(body))
signature = hex(HMAC-SHA256(secret, canonical))
```

`METHOD` upper-case; `PATH_WITH_QUERY` exactly as sent (e.g. `/api/import/push/records?kind=wp.user&seq=3`); empty
body → sha256 of the empty string. Server: ±300 s window, nonce remembered 10 min per connection, constant-time
compare, HTTPS required unless host is `localhost`, `127.0.0.1` or `*.localhost`.

Test vector (both sides must pass it):
- secret `edvora-test-secret`, method `POST`, path `/api/import/push/records?kind=wp.user&seq=1`,
  timestamp `1762423200`, nonce `00112233445566778899aabbccddeeff`, body `{"a":1}\n`
  (8 bytes: `{"a":1}` plus a newline)
- `hex(sha256(body))` = `e346432021b04179518d9614f3560ccd71354a4ee101ddcb893d6959a9d6301c`
- expected `X-Edvora-Signature` = **`8655c65e291469d1e2898516e8f721ac08c3d20e8aa8b7133f208dbfaeb8938b`**
- empty-body case: `GET /api/import/push/ping`, same secret and timestamp, nonce `ffeeddccbbaa99887766554433221100`
  → `d56b50a393f133b9ccd8fbbb7e0660ec2f2fc940000757d3b9990dd55dc569c4`
- bundle case (§1): the vectors, canonical strings and a signed bundle body are in
  `packages/integrations/src/wordpress/fixtures/signature-vector.json`; `signature.test.ts` checks the TS side
  against that file and the PHP self-test must load the same values. Keep them identical.

The secret is the string the admin copies from Edvora (base64url, 43 chars), used as raw UTF-8 bytes for the HMAC key.
