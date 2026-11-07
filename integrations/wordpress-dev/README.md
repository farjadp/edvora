# Fixture WordPress for Edvora Migrator

Local-only WordPress sites used to develop the `edvora-migrator` plugin (`../wordpress-plugin/edvora-migrator/`)
and to produce the committed fixture bundles in `packages/integrations/src/wordpress/fixtures/` (ADR 011 §Testing,
contract in `packages/integrations/src/wordpress/FORMAT.md`). Never deploy any of this.

| Site | URL | Stack |
| --- | --- | --- |
| `wp57` | http://localhost:8057 | WordPress 5.7.21 / PHP 7.4.33, WooCommerce 5.4.4 (legacy `shop_order` posts), LifterLMS 4.21.3 **in folder `lifterlmsfa`** (as on IBA), Tutor LMS 1.9.16 |
| `latest` | http://localhost:8082 | WordPress 7.1.4 / PHP 8.2, WooCommerce 11.2.2 (**HPOS** tables), LifterLMS 11.0.1, Tutor LMS 4.2.0 |

Both: locale `fa_IR`, timezone `Asia/Tehran`, permalinks `/%postname%/`, WooCommerce currency `IRT` (0 decimals),
LifterLMS currency `IRR`, Tutor `monetize_by=wc`. Admin login: `admin` / see `seed.sh` (fixture-only password).

## Run

```bash
cd integrations/wordpress-dev
./seed.sh              # docker compose up + install plugins from wordpress.org + sample data (both sites, ~3 min)
./export-fixture.sh    # wp edvora-migrator export → fixtures/sample-wp57.* and sample-latest.* + checks
./smoke-admin.sh 8057  # optional: drives the Tools page over HTTP against the mock Edvora (push + download)
./smoke-admin.sh 8082
docker compose --profile mock down -v   # stop everything and delete the volumes
```

`seed.sh wp57` / `seed.sh latest` seed one site. Seeding needs internet once (wordpress.org plugin, core and
language downloads). The sample data (`seed/seed-data.php`) runs once per site.

## What the sample data covers

- 13 users: Digits-style `digits_phone` / `digits_phone_no` / `digt_countrycode`; one with only `billing_phone` in
  Persian digits; one with no phone; two sharing a phone; `mobile` (WP SMS) and `phone_number` (OTP plugin) styles;
  `melli_code` / `national_code`; an instructor; a name with Arabic `ي`/`ك`. Sara also has `session_tokens`,
  an application password and a non-allow-listed meta key — the export check fails if any of them leak.
- Blog: 3 posts (one draft, one with Arabic letters) in a Persian category, a tag, a page; Persian URL-encoded slugs.
- LifterLMS: 2 courses, 3 sections, 4 lessons (one with `[presto_player]` + `[spotplayer]` shortcodes, one with a
  YouTube `_llms_video_embed`, one free), a quiz with single choice, multiple choice, true/false and an unsupported
  `short_answer` question, access plans (234,500,000 IRR and IBA's placeholder price 1), enrollments, one cancelled
  enrollment, lesson completions.
- Tutor LMS: 1 course (linked to a Woo product), topic, 2 lessons (`_video` youtube / shortcode), quiz with 2 questions
  in `tutor_quiz_questions` + answers, enrollment, completed lesson.
- WooCommerce: 4 products, coupons `nowruz1405` (20 %) and `welcome500` (fixed 500,000), orders: completed with
  `WC_ZPal` + `transaction_id` + coupon, processing (Persian-digit phone), refunded (+ refund row), cancelled,
  two course line items, and one fractional total (`1234567.50`, created while decimals were 2).

Every person, phone, email and code is invented.

## Fixture bundles

`export-fixture.sh` writes, per site, `<name>.edvora-bundle` (gzip NDJSON, signed) and `<name>.ndjson`
(decompressed copy for review), using secret `edvora-fixture-secret`, connection `cnx_fixture`, tenant `demo`.
It checks: manifest first, signature last, HMAC valid, record counts equal `manifest.counts`, and no `user_pass`,
`user_activation_key`, `session_tokens`, `_application_passwords` or non-allow-listed meta in the file.

## Mock Edvora

`mock-edvora/index.php` implements the four push endpoints with real signature checks (timestamp window, nonce
replay, HMAC) and stores chunks in `/tmp/edvora-mock` inside its container. Compose profile `mock` runs it inside
each WordPress container's network namespace, so the plugin is configured with `http://localhost:8099`.

## Lint

```bash
cd integrations/wordpress-plugin
for v in 7.4 8.2; do docker run --rm -v "$PWD":/src -w /src php:$v-cli sh -c 'for f in $(find . -name "*.php"); do php -l $f; done'; done
```
