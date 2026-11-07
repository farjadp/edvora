# E-032 · WordPress migration · test plan and results (2026-11-06)

Stack: Postgres `edvora_qa032` (fresh migrate + seed), `pnpm dev` on :3120, mock SMS/payments, Chromium.
Legend: **pass** automated and green · **pass (xf)** bug pinned by an expected-fail test · **partial** built in part · **gap** not built or not testable here · **manual** checked by reading code/UI.
Files: `E2E` = `e2e/tests/…`, `PK` = `packages/integrations/src/wordpress/…`, `WEB` = `apps/web/src/lib/wpimport/…`, `CORE` = `packages/core/src/…`.
New QA files: `wp-import-push.spec.ts`, `wp-import-scenarios.spec.ts`, `wp-import-access.spec.ts`, `wp-import-layout.spec.ts`, `wp-import-helpers.ts`, `PK/qa-e032.test.ts`, `WEB/qa-e032.test.ts`, `CORE/wpimport-qa.test.ts`.

| Story | Test file / case | Status |
| --- | --- | --- |
| W1 connection (secret once, hash, 72 h, revoke) | E2E push "new connection: secret shown once…"; "revoking stops the very next request"; "expired connection"; WEB qa "connection secrets" | pass |
| W1 bundle from expired connection | E2E scenarios "expired connection's bundle is refused" | **fail → QA-E032-01** (pass xf) |
| W2 plugin push | E2E push signature checks, tenant binding, manifest→chunks→finish, HTTPS-required, rate limit; wp-import.spec ping; plugin on PHP 7.4/8.2 lint + static review (PK qa) | pass |
| W2 real plugin in WordPress (docker) | `integrations/wordpress-dev` fixtures exist (dev ran them); not re-run by QA | gap (not re-run) |
| W3 bundle upload | E2E scenarios "W3 bundle upload refusals" (tampered, wrong secret, wrong tenant, other academy's, not gzip, empty, revoked); wp-import.spec (demo bundle on iba); PK bundle.test | pass |
| W4 REST fallback | PK rest.test (stubbed WP server: manifest, mapping, gaps, https/redirect/origin, timeout) | pass |
| W4 REST reach (SSRF) | PK qa-e032 `it.fails` | **fail → QA-E032-03** |
| W4 REST end-to-end through the UI | no stub WP server in e2e | gap |
| W5 detect stack | wp-import.spec (detected LifterLMS), PK plan.test, fixtures.test | pass |
| W6 dry run writes nothing, report | E2E scenarios test 1 (row counts of 12 tables unchanged), wp-import.spec; PK plan.test | pass |
| W6b redirect preview + CSV | E2E layout/dry-run page; access spec csv 200/404 | pass (CSV content manual) |
| W6c source changed between dry run and run | `confirmJob` re-plans (code read); no test | gap |
| W7 confirm dialog, `import.run` | E2E wp-import.spec; access spec (view-only has no buttons; replayed actions denied) | pass |
| W7p progress, cancel | progress poller covered by wp-import.spec; **cancel not built** | **gap → QA-E032-06** |
| W7s summary equals DB | E2E scenarios test 1 (counts reconcile: courses, orders, enrollments, users) | pass |
| W8 phones normalised (+98, 0098, Persian digits) | E2E scenarios test 1; CORE wpimport-qa; CORE wpimport.test | pass |
| W8 bidi/ZWNJ in phone | CORE wpimport-qa `it.fails` | **fail → QA-E032-04** |
| W8a duplicates held, released by phone | E2E scenarios test 4 | pass (UI refresh bug QA-E032-02) |
| W8a "skip B / link orders to A" | not built | gap |
| W8b missing phone held, not created | E2E scenarios 1 and 4 | pass; CSV export gap |
| W8c existing user elsewhere gains membership only | E2E scenarios test 1 (name, login email, contact email unchanged; users count +1; memberships demo+iba); PK plan.test | pass |
| W8d bad data | CORE wpimport-qa, PK mappers.test | pass |
| W8e staff imported as normal user | E2E scenarios 1 (WP admin imported as held/no role), PK mappers | pass |
| W8f inactive users | not built | gap |
| W9 / W9a / W9b / W9c courses, lessons, video | PK mappers.test, plan.test; E2E scenarios 1 (course draft, price 84,700,000 rial); courses are always drafts (matches "never auto-published") | pass |
| W10 quizzes | PK mappers.test; wp-import.spec fixture | pass |
| W11 enrolments, progress | E2E scenarios 1 (enrolment +1), W22 login sees course; PK mappers.test | pass |
| W12 money (IRT → rial, shown in toman) | CORE wpimport-qa (10 amounts, digit shapes, no float, refusals); E2E scenarios 1 (order total 84,700,000) and 2 (student sees «۸٬۴۷۰٬۰۰۰ تومان») | pass |
| W12b coupons, W12d refunds | PK plan.test (coupon conflict), mappers.test | pass (unit) |
| W13 certificates (legacy id, `/verify`) | PK mappers.test; no e2e `/verify` of an imported certificate | partial |
| W14 media (SSRF, types, sizes) | WEB wpimport.test + WEB qa (hostname tricks, DNS-level loopback refusal, redirects, size caps, magic bytes, retry rules) | pass |
| W14 media pull end to end | no media server in e2e (fixture media host unreachable; failures are reported calmly) | gap |
| W15 posts/pages | WEB wpimport.test (HTML→Lexical), PK mappers | pass (unit) |
| W16 redirects, tenant isolation, no open redirect | E2E scenarios 3; wp-import.spec; WEB qa (redirect lookup per tenant) | pass (308, see QA-E032-11) |
| W17 idempotent re-run | E2E scenarios 5 (no create/update, row counts identical), wp-import.spec; PK plan.test | pass |
| W17 conflicts | E2E scenarios 6 (Edvora edit kept; "use WordPress version" overwrites with audit); PK plan.test | pass |
| W17 "no deletes" | E2E scenarios 5 (records dropped in WP, nothing removed); WEB qa static (no delete calls); access spec (REST delete/patch refused) | pass |
| W18 chunked, resumable | commit loop saves cursors per batch (code read); no kill-and-resume test; no resume UI | **gap → QA-E032-06** |
| W19 token security | E2E push (all of: expiry, revoke, replay, skew ±5 min, tenant binding, rate limit 61st→429, size 413, 409 incomplete); PK qa signatures; WEB qa (sealed secret, tamper → null, ordering of checks) | pass |
| W19 auto-revoke after import | not built | **QA-E032-08** |
| W20 audit log | E2E scenarios 7 (actions present, no PII); revoke audit in push spec | pass (viewer only in /admin) |
| W21 purge | E2E scenarios 7 ("delete now": files and held PII gone, report kept, audit row) | pass |
| W21 automatic retention for unfinished jobs | not implemented | **fail → QA-E032-07** |
| W22 student first login (Persian digits, courses, toman) | E2E scenarios 2; login page copy «رمز عبور لازم نیست» | pass |
| W22a heads-up SMS | not built | gap |
| W23 phone not found notice | not built | **gap → QA-E032-11** |
| W24 go-live checklist | static list on summary; no URL test | partial |
| W25 Studiare adapter | blocked (P3) | n/a |
| W26 IBA (Woo Memberships, Presto/SpotPlayer stubs, PHP 7.4) | PK mappers/plan (mock site has memberships, Presto, SpotPlayer); plugin lint on php:7.4-cli passes; IBA's real export not available | pass (unit) / gap (real data) |
| Access: anonymous, student, no-permission staff, view-only, run, other academy | E2E access spec (7 tests incl. replay of captured server actions by view-only/advisor/anonymous with a run-user control) | pass |
| Layout: 375 px, desktop, light, dark, RTL, Persian digits, Jalali, axe | E2E layout spec (6 tests, 7 screens × 4 variants; screenshots `docs/agents/handoffs/E-032/qa-*.png`) | pass (a11y bug QA-E032-05 pinned) |
| Security review | PK qa "plugin static review" (6 tests), WEB qa "import code read as a reviewer" (6 tests); findings in bugs.md | pass; findings QA-E032-09 |

## Suite counts (this machine)
| Suite | Result |
| --- | --- |
| `@edvora/core` | 182 pass + 1 expected-fail (was 167+0) |
| `@edvora/integrations` | 73 pass + 1 expected-fail (was 60) |
| `@edvora/web` | 37 pass (was 20) |
| `@edvora/ui` | 17 pass |
| `pnpm typecheck`, `pnpm build`, `tsc -p e2e` | green |
| Playwright (`pnpm e2e`, E2E_PORT=3120) | 78 pass (incl. 2 expected-fail), 4 skipped (deployed smoke), 1 fail (`rich-text.spec` needs a `demo.png` media that a fresh seed does not create, QA-E032-12, not import related) |
| PHP lint | php:7.4-cli and php:8.2-cli: 12 files, no syntax errors |
