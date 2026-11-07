# IBA website inventory → Edvora mapping (E-030)

Source: https://iranbrandacademy.com (WordPress + Elementor + LifterLMS + WooCommerce), crawled 2026-11-06.
`robots.txt` allows everything except `/wp-admin/`; we fetched one request at a time, ≥1.5 s apart, with an
identifying user agent, and cached every response (`apps/web/.cache/iba-import/`, git-ignored). About 140 requests.

Importer: `pnpm --filter @edvora/web import:iba` (`apps/web/src/seed/import-iba.ts`). Transcribed page text:
`apps/web/src/seed/iba/curated.json`. Per-run notes: `apps/web/.cache/iba-import/report.json`.

## What the site has

| Source | Count | Notes |
| --- | --- | --- |
| Pages (WP REST) | 69 | ~25 real content pages; the rest are forms, cart/checkout, account and test pages. Sitemap is stale (e.g. `/brand-mba/` is 404; real page is `/دوره-برندسازی-2/`) |
| Posts (WP REST) | 29 | 2020–2021; categories مقالات، اطلاعیه‌ها و اخبار، ژورنال، سینما برند |
| LifterLMS courses | 30 | Mostly past cohorts (Brand MBA XVIII–XXV, DBA III–IX); content behind login — not imported |
| LifterLMS lessons | ~1,300 (7 sitemaps) | Behind login — not imported (LMS content migration is a separate task) |
| WooCommerce products | 33 | Shop entries for workshops/videos; prices mostly dated |
| Events (MEC + Tickera) | ~245 | Calendar sessions; no home yet |
| Memberships | 3 | `digital-club`, old cohorts |
| Images | 582 referenced on pages, 37 in posts | We import only the ones our content uses (129) |
| Videos | 12 testimonial videos | On the academy's own ArvanCloud VOD (`brandgancom.arvanvod.ir`); linked, not downloaded |

## Mapping

| Old URL | Edvora | Status |
| --- | --- | --- |
| `/` hero, stats, «چرا آکادمی برند ایران؟» | `tenants.tagline / stats / manifesto` | kept from seed (Notion 02) — same facts |
| `/` logo | `tenants.logo` (Media) | imported |
| `/` client logos (26 files → 24 brands) | `tenants.clientLogos[].{name,logo}` | imported; names from file names, spellings from Notion 02 where they differ — TODO(client) confirm |
| `/` + `/مشاوره-برندسازی/` + `/مشاوره-ساعتی/` services | `tenants.services` (5 on home) + `pages/consulting` (full list of 23) | imported |
| `/contact/` | `tenants.contact.{phone,email,address}` + `pages/contact` | imported (phone kept as `021-22277111`) |
| `/دوره-برندسازی-2/` (Brand MBA) | `courses/brand-mba` | published; price/start date not imported |
| `/brand-dba-دوره-عالی-برندسازی/` | `courses/brand-dba` | published; Ministry of Science claim → `pendingClaims` (hidden) |
| `/` + `/course-shop/تفکر-استراتژیک-آنلاین/` | `courses/strategic-thinking` | published (running cohort from seed) |
| `/دوره-پریمیوم-برندسازی-کوتاه-مدت/` | `courses/premium-branding` | published (running cohort from seed) |
| `/course-shop/تصمیم-در-لبه-بحران/`, `/course-shop/روان-در-لبه-بحران/` | `courses/decision-…`, `courses/mind-…` (video) | published |
| `/brand-archetype/`, `/کارگاه-حضوری-داستان-برند/`, `/کارگاه-حضوری-سفر-قهرمانی-برند-i/` and `-ii/` | `courses/brand-archetypes, brand-story, heroic-journey-1, heroic-journey-2` | published (pre-registration for 1406, schedule text in summary) |
| `/کارگاه-های-برندسازی/` other workshops (تفکر استراتژیک I/II، روانشناسی برند، نشانه‌شناسی، سیستم‌سازی فروش، کیمیا، فروش باهوش، کاردینال‌ها، کهن‌الگوهای ایرانی، روانشناسی سیاه) | `courses/*` | **draft** — past dates or no description |
| `/دوره-های-برندسازی/` faculty grid + MBA/DBA faculty bullets | `courses.faculty[].{name,role,photo}`; `/faculty` lists everyone on a published course | imported (10; 2 without role lines) |
| `/دوره-های-برندسازی/` + `/` video testimonials (12) and «دل‌نوشته‌ها» (11) | `testimonials` (21 after merging people who have both) with photo, quote, video link | imported, `approvedForUse` = true, **consent to reconfirm** |
| `/about/` | `pages/about` | published |
| `/faq/` | `pages/faq` (`faq[]`) | published |
| `/آئین-نامه-آموزشی/` | `pages/regulations` | published |
| `/رزومه-دکتر-شهریار-شفیعی/` | `pages/founder` | **draft** — unverified official-role claims |
| `/job-opportunities/` | `pages/careers` | **draft** — form asks for a face photo |
| 29 posts (`/wp-json/wp/v2/posts`) | `posts` (title, excerpt, cover, author, date, Lexical body with images in Media) | imported; old-site links between posts rewritten to `/journal/<slug>` |
| `/طرح-شماره-1/` graduation bundles | `courses/*-graduation-bundle-*` | already in `seed/run.ts` (real prices) |

## No home in Edvora yet (not imported)

- Alumni photo wall «برخی از دانشجویانِ ما» (21 people, photos) — would need a gallery/alumni block; also consent.
- Photo album «آلبوم خاطراتِ دوره‌های قبل» — gallery; consent for people in photos.
- Per-workshop testimonial carousels on workshop pages (~60 more people) — the site-wide ones were imported.
- Post categories (no category field) — listed per post in the import report.
- Events calendar (MEC/Tickera), WooCommerce products and prices, bundle discounts (e.g. Strategic Thinking I+II 17,982,000 تومان).
- Industry verticals on the consulting page (10 tiles with images); symptom checklist on «روان در لبه بحران».
- Site-wide wartime notice (the seed's `notice` already carries a shortened version).
- Past-participant counters on workshop cards (e.g. «۵۱۲ نفر») — unverified numbers.
- LMS lessons, quizzes, assignments, memberships, student accounts — separate migration, needs the client's export.
- Embedded Aparat videos inside 2 posts and 1 `<video>` (dropped; listed in the report).

## Text rules applied

`cleanPersianText` (`packages/core/src/persian.ts`): ی/ک, kashida removed, half-spaces for می/نمی، ها/های،
تر/ترین and ‌ای after «ه», Persian digits in prose (codes, URLs, emails stay Latin), «٬» for thousands.
Words are never rewritten; the transcription is verbatim (see `docs/agents/handoffs/E-030.md` for every
claim we held back).
