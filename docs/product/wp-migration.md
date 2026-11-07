# WordPress migration — "bring your academy to Edvora"

**Task:** E-032 Phase 2 (stories) · **Source:** E-032 design brief, `AGENTS.md`, `docs/research/wp-lms-landscape.md`, `docs/research/competitors.md` (Doresaz), ADR 003/004/005/007/009 · **Not verified:** the Studiare/Estadyar data format (needs a sample DB), IBA's live data. Unknowns stay in `[brackets]`.

## Goal

An academy owner with a WordPress + LMS site can move to Edvora **by themselves**, see exactly what will happen **before** anything is written, and end with: users keyed by phone, courses, quizzes, enrollments + progress, orders/payments/coupons in rials, certificates, pages/posts, media, and old URLs redirecting (301). Students keep their access and log in with an SMS code. Doresaz only advertises "we can move your WP site" (doresaz.com/pricing); we win by being self-serve, dry-run-first, repeatable and complete (orders, enrollments, progress).

**Tag:** Core (every academy migrating from WP needs it). IBA-specific parts are marked **IBA-only** (quote separately).

## Non-goals (said no)

| Not doing | Why |
| --- | --- |
| Import WordPress password hashes | Students log in by OTP; hashes are risk with no benefit. Staff re-onboard with TOTP (ADR 007) |
| Auto-grant admin/instructor roles from WP | Wrong role = data leak. Listed for manual assignment |
| Wallet balances, events/tickets (MEC, Tickera), BuddyBoss social, forums | Not one of the three revenue lines (courses, consulting, corporate training); reported as "not migrated" |
| Plugin that phones home / analytics | AGENTS.md: no external runtime calls except the academy's own Edvora URL |
| Run SQL dumps | v2, ops-assisted, parse only, never execute |
| LearnDash adapter in v1 | Few Iranian users `[verify]`; Tutor/LearnPress/LifterLMS first |
| Delete anything in Edvora because it vanished from WP | No hard delete; report only |
| Live two-way sync | One-way, repeatable import. Sync is a different product |
| Silent best-guess merges of people | Wrong merge = student sees another person's data |

## Personas

| Persona | Needs | Can't be assumed |
| --- | --- | --- |
| **Academy owner** (non-technical) | "Will I lose students or money records? How long? Can I go back?" | Knows what a plugin, DNS, or REST API is |
| **Academy admin** | Run the import, fix warnings, confirm, switch domain | Knows WP internals; has `import.run` permission only if granted |
| **Edvora onboarding staff** (super-admin) | Help on call, read job logs, test unknown stacks | Can see other tenants' data (they must not, from inside a job) |
| **Migrated student** | Log in, find the course, see progress, not feel scammed | Remembers a password; has a phone number in WP |

## End-to-end flow

| # | Step | Who | Result |
| --- | --- | --- | --- |
| 1 | Admin opens Admin > Migration > "New connection"; picks method | Admin | One-time secret shown once, expires in 72 h |
| 2 | **Connect**: (a) install plugin "Edvora Migrator" and paste URL+secret (push), or download `.edvora-bundle` and upload it, or (b) REST fallback with application password + Woo/LMS keys | Admin | Connection "ready" |
| 3 | **Detect stack** (WooCommerce, LifterLMS, Tutor, LearnPress, Digits, Presto, ...) | System | List shown in plain Persian |
| 4 | **Dry run**: full mapping, zero writes | System | Report: counts + warnings + redirect preview |
| 5 | **Review warnings**; fix in WP or choose "skip / accept" per class | Admin | Report marked reviewed |
| 6 | **Run** (explicit confirm, `import.run`) | Admin | Job runs in background, chunked, resumable |
| 7 | **Progress** screen; safe to close tab | Admin | Per-kind progress, errors |
| 8 | **Summary**: created / updated / skipped / conflicts / not migrated | Admin | Downloadable CSV |
| 9 | **Switch domain + redirects** (DNS, checklist, redirect test) | Admin / staff | Old URLs 301 to new |
| 10 | **Students log in by OTP**; heads-up SMS/message | Student | Access to the same courses |
| 11 | Purge raw bundle, revoke connection | System / Admin | PII minimised |

## Summary table

Priority: P1 = needed to migrate IBA and any Woo+LMS academy safely; P2 = needed to sell migration as self-serve; P3 = later.

| ID | Story | Tag | Pri | Why |
| --- | --- | --- | --- | --- |
| W1 | Create migration connection (secret, expiry, revoke) | Core | P1 | Nothing starts without a safe handshake |
| W2 | Plugin push | Core | P1 | Primary path; gets phones from usermeta |
| W3 | Bundle upload | Core | P1 | Hosts that block outbound calls |
| W4 | REST fallback | Core | P2 | No-plugin sites; known gaps |
| W5 | Detect stack | Core | P1 | Picks adapters, drives warnings |
| W6 | Dry-run report | Core | P1 | Trust: nothing written until reviewed |
| W7 | Confirm and run | Core | P1 | Prevents accidental imports |
| W8 | Users and phones | Core | P1 | Phone is the login; most risk |
| W9 | Courses, sections, lessons, video refs | Core | P1 | The product |
| W10 | Quizzes and questions | Core | P2 | Completion rules depend on them |
| W11 | Enrollments and progress | Core | P1 | Students must not lose access |
| W12 | Orders, payments, coupons | Core | P1 | Money records; rial rules |
| W13 | Certificates | Core | P2 | Verifiable credentials must survive |
| W14 | Media | Core | P2 | Pages break without images |
| W15 | Pages, posts, categories | Core | P2 | SEO and content |
| W16 | SEO slugs + 301 redirects | Core | P1 | Losing rankings = losing leads |
| W17 | Idempotent re-run and conflicts | Core | P1 | Make dry runs and delta runs safe |
| W18 | Resumable large imports | Core | P1 | Big sites fail mid-way |
| W19 | Token security (owner view) | Core | P1 | Owners must trust it |
| W20 | Audit log | Core | P1 | Who imported what |
| W21 | Purge raw bundle | Core | P1 | PII duty |
| W22 | Student first login + message | Core | P1 | The moment students judge us |
| W23 | Student whose phone isn't found | Core | P1 | The failure that makes support calls |
| W24 | Switch-domain checklist | Core | P2 | Last mile of the move |
| W25 | Studiare/Estadyar theme adapter | Core | P3 | Biggest Iranian theme; blocked on sample DB + licence (Farjad approval) |
| W26 | IBA: Woo Memberships, Presto/SpotPlayer cleanup, LifterLMS-Woo linkage | IBA-only | P1 for IBA | Quote separately |

## Cross-cutting rules (QA checks these on every story)

| Rule | Acceptance |
| --- | --- |
| Tenant isolation | **G** a connection/bundle/job created for tenant `iba` **W** used from host `demo` or by id **T** refused/404, nothing written, no existence leak. Every write carries the job's tenant; `import-refs` are keyed by tenant |
| Money | **G** any price/total **W** converted **T** integer rials via `toRial(decimalString, currency)`; IRR x1, IRT x10, IRHR x1000, IRHT x10000; read **per order**; fraction after conversion rule fails or unknown currency => row skipped with warning, never rounded, never floats |
| Persian digits | **G** phone/number input in ۰-۹ or ٠-٩ **W** imported **T** normalised with `toLatinDigits` / `normalizeIranMobile` in storage; UI shows Persian digits; codes/IDs stay Latin |
| Dates | **G** WP `*_gmt` columns **W** imported **T** stored UTC; shown with `formatJalali`; if only local time exists, assume `[site timezone from WP settings]` and warn |
| No hard delete | **G** record exists in Edvora but not in WP **W** re-run **T** untouched, listed under "gone from WP" |
| PII | **G** raw data **W** imported **T** only mapped fields kept; no password hashes; national code only if present and checksum-valid; raw bundle in private storage; purged on schedule; logs never print phone/email in full |
| Persian text | **G** Persian slugs/titles **W** imported **T** URL-decoded, Arabic ي/ك normalised to ی/ک `[confirm]`, ZWNJ kept, no mojibake |
| Mobile | Student-facing screens (first login, "no phone" page) work at 360 px on slow 3G; no spinner >3 s without feedback |
| Roles | Migration screens: default deny; only `import.*` permission holders of that tenant; super-admin access to a tenant's job is itself audit-logged |

---

## W1-W4 · Connect

**Goal:** owner reaches "connected" in minutes with the safest method their host allows.
**Non-goals:** auto-installing the plugin; storing WP admin passwords.

| ID | Story | Acceptance |
| --- | --- | --- |
| W1 | As an admin, I want to create a migration connection, so the importer can talk to my site only for this move. | **G** I hold `import.run` **W** I create a connection **T** a secret is shown **once** (copy button), stored only as a hash, bound to my tenant + one job, expires in 72 h `[confirm]`, can be revoked. **G** I reload **T** secret never shown again, only "created, expires on <Jalali>". **G** expired/revoked **W** plugin calls **T** rejected with a clear "connection expired, create a new one" in the plugin screen |
| W2 | As an admin, I want to install the plugin and push data directly, so I do not move files by hand. | **G** plugin active, URL+secret pasted **W** I click "test connection" **T** green check with site name + WP/PHP version; **G** wrong secret / wrong tenant URL **T** Persian error, no data sent; **G** HTTP (not HTTPS) non-local URL **T** refused with reason; **G** clock off >5 min **T** message "ساعت سرور شما با ما فرق دارد" with the offset; **G** PHP <7.4 or WP <5.6 **T** plugin refuses to activate with a reason; **G** a replayed request (same nonce) **T** rejected |
| W3 | As an admin on a locked-down host, I want to download a bundle from the plugin and upload it in Edvora. | **G** plugin generates `.edvora-bundle` **W** I upload it **T** signature + per-file hashes verified, tenant verified, shows manifest (site, date, counts). **G** tampered file / wrong signature / signed for another tenant **T** refused, nothing stored beyond a rejected-upload log; **G** file over `[size limit]` or not a zip **T** clear error; **G** slow/dropped upload **T** resumable or clear retry, no half-bundle used |
| W4 | As an admin who cannot install plugins, I want to connect with REST keys. | **G** I enter site URL, application password, Woo ck/cs and/or LMS key **W** I test **T** each credential shows ok/failed separately. **G** connected via REST **W** dry run **T** report shows "limited mode" with the gaps: phones kept in usermeta, theme-specific meta, unpublished/private data `[verify]`; **G** keys have read-only scope **T** accepted; write-capable keys **T** warning "use read-only keys"; keys never stored after the job ends |

## W5 · Detect stack

| ID | Story | Acceptance |
| --- | --- | --- |
| W5 | As an admin, I want Edvora to recognise what my site runs, so I know what will be migrated. | **G** a connected site **W** detection runs **T** list in Persian: LMS (LifterLMS / Tutor / LearnPress / theme builder), WooCommerce (HPOS or legacy `shop_order`), phone plugin (Digits, WP SMS), memberships, video players (Presto, SpotPlayer), payment gateways (Zarinpal/Zibal/IDPay), plus versions. **G** unknown LMS or theme builder (e.g. Studiare) **T** "not supported yet: only users/pages/posts/orders are migrated", offers "request support" with the stack list attached, no crash. **G** several LMSs at once **T** admin picks which to import |

## W6 · Dry-run report

**Goal:** a report an owner can read in 5 minutes and a developer can act on.

| ID | Story | Acceptance |
| --- | --- | --- |
| W6 | As an admin, I want a dry run that writes nothing, so I can see the consequences first. | **G** connected, detected **W** I click "dry run" **T** zero rows written to content collections (QA: row counts unchanged); only the job + report are stored. Report shows per kind (users, courses, sections, lessons, quizzes, questions, enrollments, progress, orders, payments, coupons, certificates, media, pages, posts, categories, redirects): **create / update / skip / conflict** counts. |
| W6a | Warning classes (each with count, 5 sample rows, "what to do") | See table below |
| W6b | As an admin, I want a redirect preview. | **G** dry run done **W** I open "redirects" **T** table old path => new path with count by type; CSV download; duplicates and loops flagged |
| W6c | (failure) | **G** dry run crashes mid-way **T** status "failed" with a human message and the step; retry continues; no partial report presented as complete. **G** source changes between dry run and run **T** run re-checks and shows "data changed since the dry run, review again" `[threshold?]` |

Warning classes the report must support:

| Class | Meaning | Default action |
| --- | --- | --- |
| No phone | User has no phone in any known field | Import into "needs phone" list, not loginable |
| Duplicate phone | Same normalised phone on >1 WP users | Review queue; no merge |
| Invalid phone | Not a valid Iranian mobile after normalisation | Treated as no phone; original kept as note |
| Existing user in another tenant | Phone already an Edvora user | Add membership only; profile untouched |
| Unknown currency | Currency not in IRR/IRT/IRHR/IRHT | Order/product price skipped |
| Fractional price | Conversion gives a non-integer rial amount | Row skipped |
| Zero/placeholder price | e.g. LifterLMS plan price 1 while Woo product has the real price | Use Woo product; flag if no linked product |
| Unsupported question type | Types we cannot grade | Question skipped, quiz marked "incomplete" |
| SpotPlayer / DRM video | License-bound, cannot be copied | Lesson created with stub; manual action |
| Presto Player video | Source reference needs mapping | Stub or mapped if direct file/HLS URL `[verify]` |
| External video host | YouTube/Vimeo/Aparat/etc. | Kept as external link; "protected video" not applied |
| Out of scope data | Events/tickets, wallets, BuddyBoss, forums | Counted, not migrated |
| Orphan data | Enrollment without user/course, order without user | Skipped with id list |
| Missing media | File URL returns 404/too large/disallowed type | Placeholder + list |
| Slug collision | Two items same slug | Suffix and logged; redirect still points to correct one |
| Staff accounts | WP administrators/instructors | Listed for manual role assignment |
| Limited mode (REST) | Data not available over REST | Shown as gap |
| Inactive users | No login/order for `[N]` months | Choice: import or skip (client question) |

## W7 · Confirm and run

| ID | Story | Acceptance |
| --- | --- | --- |
| W7 | As an admin, I want to confirm explicitly before data is written. | **G** report with unreviewed blocking warnings **W** I click "run" **T** blocked with list of what to decide; **G** reviewed **T** confirm dialog with counts + "this does not delete anything on your WordPress site"; **G** I lack `import.run` **T** button absent and API 403; **G** double-click / two admins at once **T** one running job per tenant; second is refused with "import already running"; **G** tenant has an unpaid plan limit exceeded `[policy?]` **T** blocked before writing |
| W7p | As an admin, I want to see progress and leave the page. | **G** job running **W** I close the tab and return **T** progress per kind (n of N, errors, ETA), correct after reload; **G** I cancel **T** stops after the current chunk, keeps what was written, status "cancelled", re-run continues |
| W7s | As an admin, I want a summary. | **G** job finished **T** created/updated/skipped/conflict/failed per kind, links to warnings, CSV export, "what to do next" list (assign staff roles, fix no-phone, switch domain); numbers equal DB counts (QA reconciles) |

## W8 · Users and phones

| ID | Story | Acceptance |
| --- | --- | --- |
| W8 | As an academy, I want students matched or created by phone so they can log in by OTP. | **G** WP user with phone `+989121234567`, `۰۹۱۲۱۲۳۴۵۶۷`, or `00989121234567` **W** imported **T** one Edvora user with `09121234567`-normalised phone per `normalizeIranMobile`; phone sources checked in priority order (Digits `digits_phone`, `digits_phone_no`+`digt_countrycode`, WP SMS `mobile`, `phone_number`, Woo `billing_phone`, latest order billing phone); source used is recorded. Auth email is the placeholder `<phone>@phone.<tenant>.edvora.local`, random password; **no WP password hash is stored** |
| W8a | Duplicates | **G** two WP users with the same normalised phone **W** dry run/run **T** neither merged; both listed in a review queue; admin chooses "keep A, link B's orders to A" or "skip B"; until decided, B is imported without phone |
| W8b | Missing | **G** WP user without any phone **T** imported into the "needs phone" list with WP email as contact, `loginable = false`, enrollments kept; admin can export the list (CSV) to collect phones |
| W8c | Existing elsewhere | **G** phone matches an Edvora user already in tenant `demo` **W** imported for `iba` **T** only an `iba` tenant membership is added; name/email/avatar/other-tenant data unchanged; not visible to `iba` admins beyond what a normal member shows |
| W8d | Bad data | **G** malformed phone (letters, 8 digits, `+1…`) **T** warning "invalid phone", user treated as no phone; foreign numbers kept only if the academy allows non-Iran phones `[confirm]`. **G** invalid national code **T** dropped, rest imported |
| W8e | Staff | **G** WP admin/instructor/shop manager **T** imported as a normal user (or listed only, `[client choice]`), never with a staff role; listed in summary "assign roles manually; staff set up TOTP" |
| W8f | Non-student WP roles/spam | **G** subscriber with no orders, no enrollments, bot-like email **T** shown under "inactive users" with the admin's choice (see questions) |

## W9 · Courses, sections, lessons, video refs

| ID | Story | Acceptance |
| --- | --- | --- |
| W9 | As an academy, I want my courses with structure and prices imported. | **G** LifterLMS/Tutor/Woo product course **W** imported **T** course (title, Persian slug, description, thumbnail, status draft/published as in WP, `sourceUrl`), sections ordered, lessons ordered, free-preview flag if known. Price comes from the Woo product (LifterLMS plan price 1 is ignored), converted to integer rials. Course unpublished in WP => `draft` in Edvora. **G** price missing **T** empty price + `TODO(client)` warning, course not published automatically; imported courses are **never** auto-published `[confirm]` |
| W9a | Lesson content | **G** lesson body has shortcodes (`[presto_player]`, `[vc_row]`, theme builders) **T** HTML kept, shortcodes that cannot render are removed from the text and listed as warnings with lesson link; no raw `[shortcode]` shown to students |
| W9b | Video refs | **G** lesson with a direct MP4/HLS URL **T** stored as a video reference for later transfer to ArvanCloud (not hot-linked at runtime) `[confirm with B-module]`. **G** SpotPlayer / DRM / Presto private source **T** lesson gets a visible-to-admin "video missing" stub: title, order and text imported, `videoStatus = needs-action`, student sees "ویدیوی این جلسه به‌زودی بارگذاری می‌شود" (not a broken player); counted in summary. **G** YouTube/Vimeo/Aparat **T** external link kept, warning that it is not protected |
| W9c | Edge | **G** lesson in two courses **T** one lesson per course (lessons belong to a course), mapped by ref; **G** course with 0 lessons **T** imported, warning; **G** 3,000-lesson site **T** see W18 |

## W10 · Quizzes and questions

| ID | Story | Acceptance |
| --- | --- | --- |
| W10 | As an academy, I want quizzes and question banks to survive. | **G** quiz with types Edvora's `questions` collection supports (`single`, `multiple`, `trueFalse`, `short` — `apps/web/src/collections/Questions.ts`) **W** imported **T** quiz + questions + correct answers + points + pass mark + attempt limit (where known); linked to lesson/course. **G** unsupported types (matching, ordering, fill-in-the-blank, essay/open-ended as auto-graded, image-pick, H5P) **T** question skipped, quiz flagged "incomplete: n questions not migrated", pass mark kept but admin warned that the total changed; **G** quiz with 0 supported questions **T** not published; **G** student past attempts/scores **T** imported as history only if mappable, else counted "not migrated" and the lesson completion still comes from W11 |

## W11 · Enrollments and progress

| ID | Story | Acceptance |
| --- | --- | --- |
| W11 | As a student, I want my paid courses to still be mine after the move. | **G** WP enrollment (LifterLMS enrollment, Tutor enrolled, Woo order with course product, Woo Memberships plan) **W** imported **T** one Edvora enrollment per user+course (unique, idempotent), status mapped (active/completed/cancelled/expired), enrolled date UTC; **G** cohort-based IBA programme **T** cohort is not guessed: enrollments without a cohort until the academy assigns `[client question]`; **G** enrollment whose user has no phone **T** kept on the "needs phone" user |
| W11a | Progress | **G** student completed 12 of 30 lessons in WP **T** `completedLessons` has those 12 (only for lessons that were imported); panel shows ۴۰٪ per core progress rule; **G** lessons skipped in import **T** not counted, summary explains the difference; **G** progress for a lesson not found **T** dropped + counted; **G** re-run **T** progress is a union (never decreases) |
| W11b | Access safety | **G** order refunded/cancelled in WP **T** enrollment not created as active; **G** expiring membership **T** expiry date kept `[confirm]` |

## W12 · Orders, payments, coupons

| ID | Story | Acceptance |
| --- | --- | --- |
| W12 | As an academy, I want historical orders and payments for my books and for support. | **G** Woo order (legacy `shop_order` or HPOS) with currency `IRT` and total `1,500,000` **W** imported **T** order total = integer rials `15,000,000`; items, discount, status mapped, created date UTC, gateway ref (Zarinpal/Zibal/IDPay authority/ref id) stored as text; **G** currency read per order, mixed currencies OK; **G** unknown currency or fraction after conversion **T** order skipped, warning, never rounded. Imported orders are **history**: they never trigger SMS, emails, receipts, new enrollments or cert issuing |
| W12a | Instalments/partial payments | **G** order paid in parts `[does IBA's Woo use instalment plugin?]` **T** if not representable, imported as a single historical order with a note; no invented instalment schedule |
| W12b | Coupons | **G** Woo coupon (percent/fixed, usage limit, expiry) **T** coupon imported with fixed amount converted to rials; expired coupons imported as inactive; percent > 100 or negative amount skipped; same code in Edvora **T** conflict, not overwritten; code stays Latin case-insensitive `[confirm]`; used-count kept |
| W12c | Orphans | **G** order with a deleted user **T** imported only if a phone/email contact exists, else counted as orphan |
| W12d | Refunds | **G** refunded/partially refunded order **T** status kept; refund amounts in rials; partial refund not representable => note + warning |

## W13 · Certificates

| ID | Story | Acceptance |
| --- | --- | --- |
| W13 | As an alumnus, I want my existing certificate still verifiable. | **G** LifterLMS/Tutor certificate (earned, date, template) **W** imported **T** certificate record linked to user + course; the **legacy id/URL is stored** (field e.g. `legacyId`) and `/verify` resolves it; a **new Edvora code** (Latin) is generated for new PDFs. **G** WP cert has no earn date **T** blank, warning; never invent grades, hours, or a "Ministry of Science" approval; **G** user without phone **T** kept on "needs phone" user; **G** re-run **T** same cert, no second code. Old PDF files are imported as attachments only if present `[verify]`; otherwise the PDF is regenerated from Edvora's template and marked "imported credential" |

## W14 · Media

| ID | Story | Acceptance |
| --- | --- | --- |
| W14 | As an academy, I want images and files copied to Edvora, so they survive after I cancel hosting. | **G** WP media URLs **W** background job pulls them **T** stored in Edvora storage; types from an allow-list (jpg, png, webp, pdf, `[doc/zip?]`), size cap `[N MB]`, magic bytes checked (a `.jpg` that is HTML is rejected); no hot-linking at runtime; content URLs rewritten to Edvora media. **G** 404 / timeout **T** retried then listed under "missing media", content shows no broken image icon; **G** private paid files (lesson attachments) **T** go to private storage, not public; **G** same file twice **T** stored once (checksum). **G** disk quota exceeded **T** job pauses with a message |

## W15 · Pages, posts, categories

| ID | Story | Acceptance |
| --- | --- | --- |
| W15 | As an academy, I want blog posts, pages and categories imported. | **G** published posts/pages **W** imported **T** title, body, excerpt, featured image, category, published date UTC, `sourceUrl`; drafts as draft; trash not imported. **G** page builder content (Elementor/WPBakery/theme shortcodes) **T** text content kept, layout not reproduced; warning per page "layout needs manual rebuild"; **G** forms/sliders/popups **T** listed as not migrated. Reuses E-030's `sourceUrl` field and `pages` collection `[pending merge of E-030]`. IBA may use the importer instead of E-030's scraper `[Farjad decision]` |

## W16 · SEO slugs and 301 redirects

| ID | Story | Acceptance |
| --- | --- | --- |
| W16 | As an owner, I want old links and Google rankings to keep working. | **G** old URL `/product/<persian-slug>`, `/course/<slug>`, `/lessons/…`, `/?p=ID`, post URL, category page **W** a visitor/Googlebot requests it on the new domain **T** one 301 to the new path (no chains >1 hop); Persian slugs are URL-decoded when stored, matching works for encoded and decoded requests; query strings like `?utm_` ignored for matching. **G** unmatched path **T** normal 404. **G** redirect loop or target equals source **T** dropped and flagged at dry run. **G** redirect to unpublished/draft target **T** not created. Redirects are tenant-owned; wrong host => nothing. CSV export for the owner/host. Slug is kept as in WP where possible (SEO) |

## W17 · Idempotent re-run and conflicts

| ID | Story | Acceptance |
| --- | --- | --- |
| W17 | As an admin, I want to run the import again (e.g. to fetch last week's orders) without duplicates. | **G** a finished import **W** I run again **T** records upserted by (tenant, source site, kind, wpId); counts show update/skip only; no duplicate users, courses, orders, enrollments, certs. **G** record edited in Edvora since the last import (checksum of mapped fields differs from what we wrote) **T** **not overwritten**; listed as conflict with "keep Edvora / use WP" per row (explicit action); **G** record deleted from WP **T** untouched, listed "gone from WP"; **G** WP slug changed **T** Edvora slug kept, redirect added from the new WP slug `[confirm]`; **G** different WP site into same tenant **T** separate source site id; allowed with warning |

## W18 · Resumable large imports

| ID | Story | Acceptance |
| --- | --- | --- |
| W18 | As an admin of a big site, I want the import to survive failures. | **G** `[50,000]` users / `[N]` orders **W** run **T** processed in chunks (500 records per kind) with a cursor per kind; progress is correct. **G** server restart / network drop / plugin timeout mid-way **T** status "paused: <reason>", "resume" continues from last committed chunk, no duplicates; **G** one bad row **T** logged and skipped, chunk continues; error ceiling `[N%]` stops the job; **G** the plugin gets HTTP 429/5xx **T** backoff and retry; **G** slow mobile admin **T** page works without keeping the tab open |

## W19 · Token security (owner's view)

| ID | Story | Acceptance |
| --- | --- | --- |
| W19 | As an owner, I want to know the key I gave can't be abused. | **G** connection created **T** screen states in Persian: valid for this academy only, for this move only, expires on <Jalali date>, can be cancelled now; "revoke" works immediately (next request rejected). **G** many bad signatures **T** rate-limited, admin notified; **G** secret leaked (pasted in chat) **T** one-click revoke and re-issue; **G** import finished **T** connection auto-revoked `[confirm]` and plugin options are deleted on deactivation/uninstall; the plugin makes **no** call except to the configured Edvora URL. Request signature scheme (HMAC, timestamp, nonce) is the tech-lead's spec, not shown to the owner |

## W20 · Audit log

| ID | Story | Acceptance |
| --- | --- | --- |
| W20 | As an owner, I want a record of every migration action. | **G** any connection create/revoke, dry run, run, resume, cancel, conflict decision, purge, super-admin view **T** audit entry: who, when (Jalali in UI, UTC stored), tenant, job id, counts; no PII values in the entry; read-only, can't be edited; visible to admins of that tenant only |

## W21 · Purge of raw bundle

| ID | Story | Acceptance |
| --- | --- | --- |
| W21 | As an owner, I want my students' raw data deleted when no longer needed. | **G** bundle stored in private uploads (never publicly reachable; direct URL => 403/404) **W** retention ends (`[30 days]`, client decides) or admin clicks "delete now" **T** raw files wiped, manifest + counts + report kept, audit entry written; **G** purge before the final run **T** warning "you will need to re-upload to re-run"; **G** purge fails **T** retry + alert, status visible. This is the only deletion in the feature and applies to raw import files, not academy data. Also: plugin temp files wiped after 24 h |

## W22 · Student first login after migration

**Goal:** the student is not surprised, does not need a password, and finds their courses.

| ID | Story | Acceptance |
| --- | --- | --- |
| W22 | As a migrated student, I want to log in with my phone and see my courses. | **G** my phone was imported **W** I enter it (Persian or Latin digits) on the new site **T** I get an OTP SMS, log in, and land on my panel with my courses and progress (e.g. ۴۰٪); **G** expired/wrong code **T** clear message, resend after cooldown; **G** I try to log in on `demo` host **T** no access to `iba` data |
| W22a | Heads-up message | **G** academy chooses to notify **W** after domain switch **T** one SMS per student, sent once, rate-limited, only to loginable users, skipped for "needs phone"; opt-out honoured; text below `[approved by client; SMS cost per message: [fee]]`. Imported history never triggers purchase SMS |
| W22b | Old password attempt | **G** student types email+password habitually **T** login page offers phone as the only method and a line "رمز عبور لازم نیست" |

Student-facing copy (draft, needs client approval and a Persian proofread):

| Where | Persian |
| --- | --- |
| Heads-up SMS | `{academy}: سایت جدید ما فعال شد. برای ورود فقط شماره موبایلت را وارد کن؛ کد تأیید پیامک می‌شود. دوره‌ها و پیشرفتت حفظ شده است. {url}` |
| Login page note | `بدون رمز عبور وارد شوید: شماره موبایلی را که هنگام ثبت‌نام داشتید وارد کنید تا کد تأیید برایتان پیامک شود.` |
| After first login banner | `خوش آمدید! دوره‌ها و پیشرفت شما از سایت قبلی منتقل شده است. اگر چیزی کم است، به ما پیام بدهید.` |
| Video stub | `ویدیوی این جلسه به‌زودی بارگذاری می‌شود.` |
| OTP error | `کد واردشده درست نیست یا منقضی شده است. دوباره تلاش کنید.` |

## W23 · Student whose phone was not found

| ID | Story | Acceptance |
| --- | --- | --- |
| W23 | As a student whose phone wasn't in WordPress, I want a way in and not a dead end. | **G** I enter a phone that matches no user **W** I request an OTP **T** after verifying the OTP a **new** account is created (normal signup), and it shows: `اگر قبلاً در سایت قدیمی ما دوره خریده‌اید، با پشتیبانی تماس بگیرید یا ایمیل قدیمی‌تان را بفرستید تا حساب شما را وصل کنیم.` with a contact form (name, old email, old phone); **G** I am on the "needs phone" list **W** admin adds my phone (admin-entered, then verified by OTP on first login) **T** my enrollments/progress appear after OTP login; **G** admin links my new account to the imported record **T** requires `import.run`, writes an audit entry, moves enrollments, never merges if the imported record already has a different verified phone; **G** two requests claim the same imported record **T** first verified wins, second goes to review; **G** the person is not the owner of the old email **T** no email-only auto-link (anyone could claim another's courses) |

## W24 · Switch domain and redirects checklist

| ID | Story | Acceptance |
| --- | --- | --- |
| W24 | As an owner, I want a checklist for going live. | **G** summary done **W** I open "go live" **T** checklist: all blocking warnings resolved or accepted; test of 10 sample old URLs => 301 (green/red); DNS instructions (A/CNAME, `[TTL tip]`); SSL status; sitemap present; keep old hosting for `[N]` days; "put the old site in maintenance mode so new orders don't land there" reminder; **G** a final delta run (W17) before switching **T** suggested; **G** old site still takes orders after the switch **T** warning; tests fail **T** can't mark "done" without an explicit override |

## W25-W26 · Adapters

| ID | Story | Acceptance |
| --- | --- | --- |
| W25 | (P3) As an owner on Studiare/Estadyar, I want my theme courses migrated. | **G** a sample DB and a licence (Farjad approval) exist **T** adapter spec written from real data; until then W5 shows "not supported yet" and offers the generic path (users, orders, pages) |
| W26 | **IBA-only** As IBA, I want my LifterLMS + Woo + Memberships site moved. | **G** IBA export (WP 5.7.21, PHP 7.4, LifterLMS 4.21.3, Woo 5.4.4 legacy orders, Memberships, Digits, Presto) **T** plugin works on PHP 7.4; prices from Woo; Memberships map to enrollments; Presto/SpotPlayer lessons stubbed; MEC/Tickera/BuddyBoss reported not migrated; IBA's public LifterLMS REST endpoints may substitute for E-030's scraper for content only |

## Client questions (written for the academy owner)

| # | Question | Why we ask |
| --- | --- | --- |
| 1 | **IBA:** When someone buys a course in your shop, is it the WooCommerce product that gives them access, or the LifterLMS "plan"? Which one shows the real price? | Decides where prices and enrollments come from |
| 2 | Do you use "wallet" credit (کیف پول) with real balances? If yes, are balances owed to students? | We do not migrate wallets; money owed needs a plan |
| 3 | Do you sell event tickets (Tickera/MEC) that still must be honoured? | Not migrated; we need a list of valid tickets |
| 4 | How long should we keep the raw copy of your data after the move? (we suggest `[30]` days) | PII retention |
| 5 | Should students who haven't logged in or bought anything for `[N]` months be moved? | Fewer junk accounts, less cost |
| 6 | Is the mobile number saved for every student? Where did you collect it (login with Digits, checkout, profile)? | Phones are the login |
| 7 | Should we SMS students after the switch? Who pays for the SMS? Do you approve the text? | Cost + consent |
| 8 | Which videos are on SpotPlayer, Presto or YouTube/Aparat? Do you still own the original files? | These cannot be copied automatically |
| 9 | Do students on cohort programmes (MBA/DBA) have a start date we can read, or should you assign cohorts by hand? | Cohorts are not guessed |
| 10 | Should imported courses stay hidden until you check them? (we recommend yes) | Avoid publishing wrong prices |
| 11 | Who are the WordPress admins/instructors, and which Edvora role should each get? | Roles are never auto-assigned |
| 12 | Do you accept foreign phone numbers (non-Iranian) for students? | Login rules |
| 13 | Are old PDF certificates kept as files, and should old certificate numbers stay valid on `/verify`? | Alumni verification |
| 14 | Do you pay in instalments (اقساط) through a plugin? Name it. | Instalments may not map |
| 15 | Who can access the old hosting, and when do you want to switch the domain? | Schedule |

## Open questions for Farjad

| # | Question | Default if no answer |
| --- | --- | --- |
| 1 | Approve plugin-first (push + bundle), REST as P2 fallback? | Yes |
| 2 | Bundle retention 30 days, connection expiry 72 h? | Yes |
| 3 | Should imported courses default to draft? | Yes |
| 4 | Buy a Studiare/Estadyar licence for a sample DB (cost `[fee]`; needs your approval)? | Not yet; W25 stays P3 |
| 5 | Is migration included in the plan, a paid one-off, or free for IBA only? | `[pricing decision]` |
| 6 | Does the importer replace E-030's scraper for IBA content, or do both coexist? | Importer for data, scraper stays for public content until proven |
| 7 | Ship the plugin on wordpress.org or direct download only? (wp.org adds review time and rules) | Direct download, signed |
| 8 | OK to use wording "الان در پلتفرم جدید" in SMS/comms before the client approves? | No; client approves all copy |
| 9 | Do legacy certificates get the "imported credential" label, or look identical to new ones? | Label, to avoid unverifiable claims |
| 10 | Is an unconfirmed-mobile (admin-entered) phone allowed to own an account before OTP? | No; OTP always required |

## Metrics that show it worked

| Metric | Target |
| --- | --- |
| Dry run finishes without errors for IBA | 100% |
| Reconciliation: Edvora counts vs report vs WP counts, per kind | Equal (except listed skips) |
| Re-run creates duplicates | 0 |
| Cross-tenant writes in tests | 0 |
| Students with a phone who log in by OTP within `[7]` days of switch | `[>=80%]` |
| Support tickets "I can't find my course" in the first month | `[<5%]` of students |
| Owner can finish connect to dry run without staff help | `[>=70%]` of pilot academies |
| Organic traffic to old URLs 4 weeks after switch (Search Console) | `[>=90%]` of before |

## Handoff

- **Task:** E-032 Phase 2: PRD with stories W1-W26 and acceptance criteria.
- **Output:** `docs/product/wp-migration.md`.
- **Decisions made:** plugin-first, dry run mandatory, no password hashes, no auto roles, no merge by email, no hard delete, imported orders are history only (no notifications), imported courses default to draft `[Farjad confirm]`, wallets/events/BuddyBoss out of scope, Studiare is P3.
- **Open issues:** Studiare format unverified; question-type list and video storage depend on modules Q/B; cohort mapping; whether E-030 scraper stays; retention and SMS cost; all `[brackets]`.
- **Next owner:** `tech-lead` (data model: `import-jobs`, `import-refs`, `redirects`, `legacyId`, `loginable`/needs-phone flag; plugin and signature spec) then `ux-architect` (admin wizard, student login copy), `qa` for the acceptance criteria.
