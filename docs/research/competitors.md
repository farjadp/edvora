# Competitors and alternatives: what an Iranian academy can use instead of Edvora

**Task:** E-032 (Phase 1, part 2) · **Owner:** 03 · Market Researcher · **Date:** 2026-11-06
**Sister doc:** `docs/research/wp-lms-landscape.md` (WordPress LMS data models, written by another agent). This doc does not repeat the data-model work. It covers the market only.

**Method.** Vendor pricing pages, terms of service, help centres, wordpress.org/Moodle registries and Iranian vendor sites, read on 2026-11-06. Iranian sites were read directly over HTTP. Some prices on them are drawn by JavaScript, so I took the numbers from the page's own script or public API and say so where I did. Every fact has a numbered source `[n]`. All sources were accessed **2026-11-06**.

**Legend.** ✅ yes / built · ⚠️ partial, add-on, higher tier only, or with a catch · ❌ no · ⏳ planned in Edvora (spec exists, not built) · `[unverified]` I could not confirm it from a primary source · *Inference:* my reading, not a sourced fact.

**Currency.** USD prices are as published (the annual price is shown per month and billed yearly). Iranian prices are in **toman** as published. I did not convert them: the rate moves too fast for a conversion to stay accurate.

---

## 0. Summary

1. **None of the global SaaS platforms can serve an Iranian academy.** Teachable (§2.2 of its terms) and Kajabi (§3.3) name Iran as a prohibited location [2][8]. Stripe, the processor most of them run on, lists Iran as a prohibited jurisdiction [21]. Skool's list of 154 payout countries leaves Iran out [18]. Thinkific, Circle, Podia and LearnWorlds use general sanctions or export wording, or none at all [5][20][16][12]. They still have no Iranian payment rail, and Persian/RTL support is thin or only on request (LearnWorlds turns RTL on per support ticket) [13]. **They are reference products, not rivals for Iranian customers.** They do matter for non-Iranian tenants, and as the bar for features.
2. **The real Iranian alternative today is WordPress plus local add-ons:** an Iranian education theme (1.2–2.35 M toman on RTL-Theme [41], up to 13.5 M on Zhaket [42]), Tutor LMS or LearnPress (100,000+ and 70,000+ active installs [37]), the Zarinpal WooCommerce gateway (60,000+ installs [37]) and **SpotPlayer** for protected video (14,900 toman per licence [45]). It is cheap to start. It is also where the WP-migration wedge applies.
3. **The closest SaaS rival is دوره‌ساز (Doresaz).** It is an Iranian "site builder for instructors" with encrypted playback, instalment purchase, a Bale OTP login, gamification, a custom domain on the landing page and, notably, a **"move your WordPress site to Doresaz"** feature. Its plans cost 399,000 / 699,000 / 1,699,000 toman per 30 days [50][51][52]. Doresaz is the benchmark for Edvora's migration wedge.
4. **Live classes in Iran mostly mean Skyroom (اسکای‌روم).** It claims 95,000+ customers and 3,000 concurrent users per room, and it has a web-service API and a WordPress plugin [46][47][48]. In Farvardin 1405 (about April 2026) it **stopped selling and renewing every plan** because it ran out of capacity, then reopened with an afternoon-only package [49]. That makes a single live provider a real risk.
5. **Marketplaces compete for instructors, not academies.** Faradars (فرادرس) claims 5,000,000+ learners [53]. Maktabkhooneh (مکتب‌خونه) pays 97% of the sale through the instructor's own link and 30% otherwise [54]. An academy with its own brand and sales team, like IBA, is not their target.
6. **Payments:** Zarinpal charges 0.5% per transaction, capped at 16,000 toman, plus 500 toman [58]. **Zarinpal's payment-link product (زرین‌لینک) is "temporarily disabled by Central Bank order"** [59]. That hurts the "Instagram + payment link" sellers who are Edvora's lower-end prospects. Digipay lists **"دوره آموزشی" (training course)** as a merchant category for its instalment gateway [61]. That is the clearest sign that a BNPL provider will serve course sellers.

**Where Edvora wins:** multi-tenant white-label for academies with an advisor sales team (lead CRM plus instalments plus `/verify` certificates), with Persian, Jalali and Zarinpal built in from day one. **Where it loses today:** no published price, no self-serve sign-up, no protected video and no live classes yet (both ⏳), and no migration tool yet (⏳). Doresaz already has all of these in some form.

---

## 1. What Edvora is today (from the repo, for the comparison)

| Area | Status in repo | Evidence |
| --- | --- | --- |
| Multi-tenancy: tenant per domain, isolation, per-tenant brand, features and gateway | ✅ | `README.md` "What works today" [71] |
| Public site: RTL, Vazirmatn, light/dark | ✅ | `README.md` [71] |
| Checkout, coupons, **instalments**, gateway callback (Zarinpal + mock) | ✅ | `README.md`. `packages/core/src/instalments.ts` splits a total into 1–24 payments with an optional down payment, rounded to whole toman [71] |
| Lead CRM: lead form → advisor queue → pipeline rules → follow-up dates | ✅ data and rules, admin UI | `README.md`. `packages/core/src/leads.ts` (statuses new/contacted/follow_up/enrolled/lost) [71] |
| Certificates: auto codes (`BA-MBA-182`), public `/verify` | ✅ codes and verify. ⏳ issuing flow with PDF/QR (Phase 2 E) | `README.md`, `docs/product/phase-2.md` §E [71] |
| SMS (Kavenegar + mock): lead, login, enrollment | ✅ | `README.md` [71] |
| Quizzes, assignments with private files, content drip | ✅ merged (E-026) | `apps/web/src/collections/{Quizzes,Assignments,Submissions,SubmissionFiles}.ts`, `packages/core/src/{quiz,drip,assignments}.ts`, commit `83faa96` [71] |
| Staff 2FA (TOTP) | ✅ | `packages/core/src/totp.ts`, ADR 007 [71] |
| Protected video: ArvanCloud signed URLs + watermark, no DRM by design | ⏳ | `docs/product/phase-2.md` §B [71] |
| Live classes: provider adapter (Skyroom or BigBlueButton, not chosen) + auto-recordings | ⏳ | `docs/product/phase-2.md` §D. Tenant feature flag `live` exists [71] |
| Email + Telegram/Bale notifications | ⏳ | `docs/product/phase-2.md` §F [71] |
| Gamification | ⏳ spec (E-027/E-028) | `docs/product/gamification.md` [71] |
| Hosting Iranian tenants inside Iran (ArvanCloud, backup Liara/Hamravesh) | ⏳ decided (ADR 002, accepted 2026-11-06). The current runbook covers a Railway environment | `docs/adr/002-hosting-in-iran.md`, `docs/runbooks/` [71] |
| WordPress migration-in | ⏳ planned (this branch is `wp-migration`). Not built | branch name, task brief |
| Published pricing / self-serve sign-up | ❌ none in repo | grep of `docs/`, `README.md` [71] |

*Inference:* Edvora's instalments are **academy-financed**. The academy carries the credit risk and the student pays each instalment through the gateway. They are **not BNPL**: no third party pays the academy up front. That fits high-ticket cohort programmes like IBA's MBA/DBA. Reminders for overdue instalments and access locking are not confirmed in the repo `[unverified]`. `phase-2.md` A1f lists the access policy as a client question.

---

## 2. Global SaaS course platforms

### 2.1 Pricing and fees (published, USD)

| Platform | Plans: monthly billing → annual billing (per month) | Platform transaction fee | Source |
| --- | --- | --- | --- |
| **Teachable** | Starter $39 → $29 · Builder $89 → $69 · Growth $189 → $139 · Custom (sales) | Starter **7.5%**. Builder and above 0% when using Teachable Payments. Card processing extra: 2.9% + 30¢ (US), 3.9% + 30¢ (international) | [1] |
| **Thinkific** | Start $109 → $82 · Grow $219 → $164 · Expand $499 → $374 · Plus (sales). Branded app add-on $199/mo | No platform fee stated. 2.9% processing on Thinkific Payments | [4] |
| **Kajabi** | Basic $179 → $143 · Growth $249 → $199 · Pro $499 → $399 | No revenue share. Card processing 2.9%/2.8%/2.7% + 30¢ (US). **2% / 1% / 0.5% fee if you use an outside processor** | [7] |
| **LearnWorlds** | Starter $49 → $44 · Pro Trainer $99 → $79 · Learning Center $299 → $249 · Corporate (custom) | Starter: **$5 per course enrollment**. Others: none. The page shows no currency code; treated as USD | [11] |
| **Podia** | Mover $49 → $42 · Shaker $99 → $84 · Earthquaker $179 → $150 | Mover **5%**. Others none. Stripe/PayPal 2.9% + 30¢ extra | [15] |
| **Skool** | Hobby $9/mo · Pro $99/mo (yearly price not shown; page says "2 months free") | Hobby **10%**, Pro **2.9%** | [17] |
| **Circle** | Professional $89 · Business $199 · Scale $419 (annual billing only shown) · Circle Plus (custom) | 2% / 1% / 1% / 0.5% | [19] |

### 2.2 Features that matter to Edvora's buyers

| Platform | Custom domain / white-label | Payment plans (instalments) | CRM / email | Live classes | Video protection | RTL / Persian |
| --- | --- | --- | --- | --- | --- | --- |
| Teachable | Branding removal on **Growth** and above. Custom-domain plan matrix unreadable `[unverified]` [1] | ✅ "payment plan" is one of four pricing types [3]. Needs a connected processor `[unverified]` | ⚠️ basic. Not a CRM `[unverified]` | ❌ none on the pricing page [1] | `[unverified]` | `[unverified]`: no Teachable RTL documentation found |
| Thinkific | Custom domain on all plans. Brand removal from **Grow**, email white-label from **Expand** [4] | ✅ all plans [4] | ⚠️ email automation on all plans, bulk email from Grow [4] | ✅ Zoom live lessons, all plans [4] | `[unverified]` | `[unverified]` |
| Kajabi | Custom domain all plans. "Powered by Kajabi" removed from **Growth** [7] | ✅ "Payment Plan" offer type; needs Kajabi Payments, Stripe or PayPal [9] | ✅ contacts (2,500 / 25,000 / 100,000), unlimited marketing email, automations from Growth [7] | ⚠️ coaching all plans. **Live cohort courses from Growth** [7] | `[unverified]` | `[unverified]`: only a third-party glossary claims RTL; not used |
| LearnWorlds | Custom domain all plans. **Full white-label only on Learning Center** ($249+) [11] | ✅ from Pro Trainer [11] | ⚠️ mass email credits 2,000 / 5,000 / 10,000 per month [11] | ✅ Zoom/Meet/Teams/Webex: one account on Pro Trainer, several on Learning Center [11] | Not on the pricing page [11] | ⚠️ RTL **enabled only through a support ticket**, "for specific languages" (not named) [13] |
| Podia | Custom domain all plans [15]. Branding removal not stated | `[unverified]` | ⚠️ 100 / 500 / 1,000 email subscribers included [15] | ⚠️ "Events (Live & In-person)" [15] | `[unverified]` | `[unverified]` |
| Skool | "Custom URL" [17]. White-label not mentioned | `[unverified]`: not in the payments FAQ [18] | ❌ community-first | ✅ unlimited live calls [17] | `[unverified]` | `[unverified]` |
| Circle | Custom domain all plans. **White-label from Business**. Branded apps only on Plus [19] | `[unverified]`: "Payments" listed, plans not specified [19] | ⚠️ Email Hub add-on $99/mo for 10,000 contacts [19] | ✅ streams 100 / 200 / 500 attendees, rooms 15 / 20 / 50 [19] | `[unverified]` | `[unverified]` |

*Inference:* Kajabi is closest to Edvora's "sell by funnel and email" side, and LearnWorlds is closest on white-label for an academy. Neither has an advisor/lead pipeline like Edvora's. Kajabi's CRM is contact- and email-centred [7].

### 2.3 Can an Iranian academy use them? (sanctions and payments)

| Platform | What the terms say about Iran / sanctions | Payment rail | Verdict |
| --- | --- | --- | --- |
| Teachable | §2.2 "OFAC Restrictions": user warrants they are not a resident of Cuba, Iran, North Korea, Venezuela or Crimea. Terms dated 04/20/2026 [2] | Teachable Payments / Stripe / PayPal [1] | ❌ excluded by name |
| Kajabi | §3.3: no use from a prohibited jurisdiction; names Cuba, Iran, North Korea, Syria. Page modified 2026-05-05 [8] | Kajabi Payments, Stripe, PayPal [7][9] | ❌ excluded by name |
| Thinkific | §20.8: export controls and a restricted-party warranty. No country named. No promise of availability in any country. Last modified June 30, 2026 [5] | Thinkific Payments, Stripe, PayPal [4] | ❌ in practice (no Iranian rail). Legally `[unverified]` |
| Circle | §1: user warrants they are not in a US-embargoed country. Dated September 1, 2026 [20] | Circle Payments `[unverified]` | ❌ |
| Podia | No sanctions clause; general export-control and compliance wording (§6(B)(iii), effective 12-12-24) [16] | Stripe / PayPal [15] | ❌ in practice |
| LearnWorlds (Cyprus) | No sanctions clause found. §11.1 general compliance with laws [12] | Card, PayPal, SEPA, bank transfer for subscriptions [12]; Stripe/PayPal for student payments [11] | ❌ in practice |
| Skool | Sanctions clause not found on the rules page [18] | Skool merchant account, payouts via Stripe Express. **Iran is not among the 154 payout countries** (list updated Sept 2026) [18] | ❌ no payouts |
| (rail) Stripe | Prohibited jurisdictions include "Cuba, Iran, North Korea, and Syria"; OFAC named [21] | n/a | n/a |
| (rail) PayPal | PayPal's developer error docs name Iran among card-issuer countries not supported [22] | n/a | n/a |

The repo already reaches the same conclusion: no US cloud or Stripe for Iranian tenants, and get advice from a Canadian sanctions lawyer before taking Iranian money (`README.md`, ADR 002) [71]. The legal position of a **Canada-based vendor** serving Iranian academies is not covered here `[unverified]`: Notion page 07 / counsel.

### 2.4 Migration-in tools (because "migrate from WordPress" is our wedge)

| Platform | What they offer | Source |
| --- | --- | --- |
| Teachable | "Migration assistance" and "white glove onboarding" **only on Custom** (for sales over $12k/yr). "Imported students" on Growth | [1] |
| Thinkific | Help-centre "Migration Support: Bulk Student Import and Course Enrollment". The search-result text is internally inconsistent about whether Thinkific does it for you. Self-serve CSV import. A migration workbook is mentioned. Could not open the article (HTTP 403) `[unverified]` | [6] |
| Kajabi | Help-centre result says **no free in-house migration**; imports are manual, with webinars to help. The article returned 404 when fetched, so this rests on the search snippet `[unverified]` | [10] |
| LearnWorlds | **Paid** in-house migration covering courses, assessments, videos, certificates, bundles/subscriptions, users, enrollments and progress. Free consultation. No price published | [14] |
| Circle | "Course migration is free for Annual Business plans and above" | [19] |
| WordPress | None of the above advertises a **WordPress-specific** importer on its own pages `[unverified]`. Freelancers and agencies fill the gap (not cited as facts) | — |

*Inference:* the global players treat migration as a sales-assisted service for big accounts, not a self-serve product. A one-click WordPress import (users, orders, enrollments, progress) is a real gap. In Iran, Doresaz already advertises one (§5.1).

---

## 3. Open-source LMSs

| Product | Licence | Multi-tenancy | Commerce | Persian / Jalali | Hosting effort | Sources |
| --- | --- | --- | --- | --- | --- | --- |
| **Moodle** (مودل, "Moodle") | GPL `[unverified in this pass]` | ❌ in core. **IOMAD** (free, open source, by e-Learn Design) adds tenants with their own URLs, themes, logos, CSS, licences and an e-commerce block [29]. **Moodle Workplace** is commercial, through partners. A secondary source cites about $6,000 to $150,000 per year `[unverified]` [30] | "Enrolment on payment" + payment-gateway plugins. **`paygw_zarinpal` exists**: maintainer onbirdev, Moodle 3.10–5.2, **13 installations**, last release 20 Nov 2025 [26] | **Persian pack 63% complete** (20,101 of 32,033 strings) for Moodle 5.0 [23]. **Jalali calendar plugin** `calendartype_jalali` by Shamim Rezaie: Moodle 2.6–5.3, **690 installations**, last release 27 Sep 2026 [24]. Known bug: messaging dates stay Gregorian (MDL-70072) [25] | Self-host PHP + DB; plugins to vet `[unverified]` | [23]–[30] |
| **Open edX** | AGPL v3 [31] | ⚠️ via eduNEXT's `eox-tenant` plugin [33]. Tutor can also run several platforms side by side `[unverified]` | ⚠️ e-commerce is a separate service `[unverified]` | `[unverified]` | Heavy. Tutor's official minimum is 4 GB RAM, 2 CPU, 8 GB disk; 8 GB RAM recommended (search-result text; the page did not render) [32] | [31]–[33] |
| **Canvas LMS** | AGPL v3 [34] | `[unverified]` | ❌ not a selling tool `[unverified]` | `[unverified]`: the GitHub page does not mention RTL [34] | Heavy (Ruby, production guide in wiki) [34] | [34] |
| **Chamilo** | GPLv3+ [35] | ✅ "Hierarchical Multi-Tenant (Multi-URLs)" [35] | ⚠️ BuyCourses plugin. An older README says only PayPal works [36] | "60+ languages… including RTL support" [35]. Persian completeness `[unverified]` | Medium (PHP) `[unverified]` | [35][36] |

**Moodle in Iran.** Iranian universities run Moodle under the name «مودل» on `lms.*.ac.ir` sites. Examples: user guides from Bu-Ali Sina University (`lms.bou.ac.ir`), Tabriz University of Medical Sciences (`safa.tbzmed.ac.ir`, "مودل فراگیر") and IASBS [28]. Iran does not appear in Moodle's top-10 countries for registered sites. The 10th country (Russia) has 4,214, so Iran has fewer than that among 146,777 registered sites [27]. Registration is optional, so this undercounts. *Inference:* Moodle is the default for **universities and corporate training**, not for commercial academies that sell. Its Zarinpal gateway has 13 installs [26], and its commerce, CRM and instalments are weak or absent.

**Why open source is not the main threat.** Every one of these needs a sysadmin. None ships an Iranian gateway that is maintained at scale, an advisor CRM or instalments. Moodle + IOMAD is the only real **multi-tenant** open-source rival, and it targets corporate training [29].

---

## 4. WordPress as the competitor (brief; see `wp-lms-landscape.md` for data models)

### 4.1 The typical Iranian stack and what it costs

| Layer | Typical choice | Number (source, 2026-11-06) |
| --- | --- | --- |
| LMS plugin | Tutor LMS | 100,000+ active installs, v4.2.0 [37] |
| | LearnPress | 70,000+ active installs, v4.4.13 [37] |
| | LifterLMS · Sensei | 10,000+ · 9,000+ [37] |
| | Masteriyo | 6,000+ active installs, v3.5.1, rating 96 [37] |
| | LearnDash (paid) | Sold by Liquid Web in a bundle with The Events Calendar, Give and Kadence: **$350/yr for 1 site**, $599 for 10, up to $999 for 100 [38] |
| Persian localisation | Parsi Date (پارسی دیت) | 100,000+ active installs [37] |
| Gateway | Zarinpal for WooCommerce | 60,000+ active installs, updated 2026-07-15 [37]. Alternatives: Gateland (5,000+), Parsigate (1,000+) [37] |
| Theme (Iranian marketplace) | RTL-Theme (راست‌چین) "قالب آموزشی" category | e.g. **Studiare (استادیار) 8,613 sales, 1,848,000 toman**; Parsa (پارسا) 1,790 sales, 1,698,000; Edumall 2,097 sales, 1,348,000; Magnet Academy 2,348,000 [41] |
| | Zhaket (ژاکت) education category | Eduma 1,894 sales, 1,350,000 (810,000 on sale); DigiAcademy (دیجی آکادمی) 338 sales, 1,900,000; Tadris (تدریس) **13,500,000** [42][43] |
| Protected video | **SpotPlayer (اسپات‌پلیر)** | Per licence (3 devices, one course ≤ 10 GB): **14,900 toman**. +9,900 per extra course, +490 per extra GB, an extra device costs 1/3 of the licence fee. Rebranding (own name, logo, domain on the players) **999,000 toman per 3 months** [45]. Storage plans 20 GB → 1,000 GB. Base figures from the page script: 99,000 / 199,000 / 399,000 / 699,000 / 1,199,000 / 1,999,000 toman for the 3-month option, lower for 6-month and yearly. The billing unit of these figures is not stated `[unverified]` [45]. Features: device limits, licence revoke, per-buyer watermark (e.g. mobile number), screen-recording blocking on some OSes, JSON licence API, players for Windows, macOS, Android and Web; iOS "coming soon" [44] |
| Live | Skyroom WordPress plugin (WooCommerce → Skyroom rooms) | [48] |

*Inference, a ballpark start-up cost:* theme ≈ 1.3–2.3 M toman + free LMS plugin + free Zarinpal plugin + SpotPlayer 14,900 per student + hosting. That is far below any global SaaS and near Doresaz's monthly fee. **Edvora will not win on entry price against WordPress.** It has to win on total cost of ownership and on the sales workflow.

### 4.2 Why Iranian academies pick WordPress

- **Local ecosystem.** Persian themes with Jalali calendars and quiz builders are filter options on RTL-Theme's education category [41], and the main Iranian gateways ship WP plugins [37]. SpotPlayer and Skyroom both plug into WP/WooCommerce [44][48].
- **Theme marketplaces sell on instalments too.** Zhaket shows DigiAcademy at "4 instalments with SnappPay (اسنپ‌پی), no interest" [43].
- **Agencies and freelancers know it.** Portal.ir's guide steers instructors to marketplaces, own sites, Aparat/YouTube and Instagram/Telegram [68] (*inference:* WP is the default "own site").

### 4.3 Pain points (what the migration pitch should press on)

| Pain | Evidence |
| --- | --- |
| **Security** | Patchstack counted **11,334 new WordPress-ecosystem vulnerabilities in 2025** (+42% on 2024). **91% were in plugins** and 9% in themes. **46% were not fixed by public disclosure** [39]. Tutor LMS has had an unauthenticated SQL injection via `coupon_code` (≤ 3.9.6) [40]. Third-party aggregators list several more 2026 Tutor CVEs; not individually verified `[unverified]` |
| **Plugin sprawl and conflicts** | The stack is theme + LMS + WooCommerce + gateway + SpotPlayer + Skyroom + SMS plugin: five or more vendors and five update cycles. *Inference*, consistent with [39] |
| **Stale themes** | A buyer's question on DigiAcademy (Mehr 1405) asks whether the theme gets updates; its last update was "last year" [43] |
| **Protected video is a bolt-on** | The WP stack relies on a separate player and licence (SpotPlayer) per student [44][45]. Students install an app. iOS is not available yet [44] |
| **Instalments** | Neither Tutor nor LearnPress is shown with Iranian instalment support. The WooCommerce instalment plugins found rely on Stripe-style card tokenisation or Klarna, which do not exist in Iran `[unverified for Iranian commercial plugins]`. Academies run instalments by hand: Novin (نوین) offers 2–4 fee-free instalments, with full access after the first one, also arranged **via Telegram** with staff [66] |
| **Performance / hosting** | `[unverified]`: no source measured it in this pass |

---

## 5. Iranian platforms

### 5.1 Academy and course SaaS (direct competitors)

| Product (Persian / Latin) | What it is | Price as published | Key features | Sources |
| --- | --- | --- | --- | --- |
| **دوره‌ساز (Doresaz)**, doresaz.com | "The only specialised site builder for instructors" | From its public plan API: **Basic (پایه) 399,000**, **Pro (حرفه‌ای) 699,000**, **Organisational (سازمانی) 1,699,000** per 30 days. Storage 12 / 25 / 50 GB. Commission per sale **35,000 / 25,000 / 15,000 toman**. The API does not label the currency of the plan price. *Inference:* toman, because the commission strings say toman. 14-day free trial. Monthly, 6-month and yearly toggles | Encrypted, non-downloadable playback with screen-recording blocking (domestic CDN; global CDN on the top plan), **"instalment purchase of courses"**, instructor's own payment gateway, quizzes, scheduled lesson release, gamification, marketing automation, SMS/email from your site, **"move a WordPress site to Doresaz"**, **one-time login codes in the Bale (بله) messenger**, custom domain on the landing page, branded app (top plan), copyright-mark removal. The pricing table does not show which features belong to which plan `[unverified]` | [50][51][52] |
| **وبزی (Webzi)**, webzi.ir | General site/shop builder (not course-specific) | Shop-builder plans 4,188,000 / 5,184,000 / 8,388,000 toman per year, each with a 3-month instalment option [67] | No course features found on the homepage [67] | [67] |
| **پرتال (Portal.ir)** | General site builder. Its blog targets course sellers | `[unverified]`: pricing page not read | Article on selling courses (12 Bahman 1404) [68] | [68] |
| «آکادمی‌ساز», «کلاسه» (Kelase), «وادانا» (Vadana), Navaco LMS | Candidates from the brief | — | **Not found.** `kelase.com` is an Indonesian AI career-mentor app, not Iranian [69]. No primary site found for "Vadana", "Navaco LMS" or a product named "آکادمی‌ساز" `[unverified]` | [69] |

**Doresaz is the benchmark.** It already advertises the bundle that Edvora's roadmap puts in Phase 2 (protected video, drip, gamification), plus instalments and WP migration [50][52]. Its plan API exposes a concrete price ladder [51]. What Doresaz does **not** advertise: a lead CRM with advisors, multi-academy (tenant) management (its top plan allows 2 sites [50]), verifiable certificates, or cohort/live features. *Inference from its feature list:* it targets solo instructors, while Edvora targets academies with staff.

### 5.2 Live-class infrastructure

| Product | Facts | Sources |
| --- | --- | --- |
| **اسکای‌روم (Skyroom)**, skyroom.online, run by Mahbang Fanavari Pars and Nasim Ertebat Damavand | Claims 95,000+ customers, 35 M+ participants, 43 M+ events, up to **3,000 concurrent users**, Persian chat, cloud recording, whiteboard. Enterprise: dedicated server, on-premise inside an organisation's network, purchasable through the government procurement system (ستاد). Customer logos include the Central Bank, Sharif University of Technology and Shaparak [46]. **Web service** to automate rooms and users from your own site [47]. **WordPress/WooCommerce plugin** [48]. Prices are not on the order page (behind the panel) `[unverified]` [46] | [46]–[48] |
| Skyroom capacity crisis | Zoomit, Monday 17 Farvardin 1405 (≈ 2026-04-06): when schools moved online during the "special conditions", Skyroom's capacity filled up. It **stopped selling all plans and even renewals**, then offered an "afternoon service" (13:00–07:00 only) at 30% off until capacity recovers [49] | [49] |
| Adobe Connect | Still used by Iranian universities, e.g. Sari Agricultural University's student guide for the autumn 1404 term [70]. Iranian resellers and licensing `[unverified]` | [70] |
| BigBlueButton | Open source; Iranian hosted offers `[unverified]` | — |
| **ایوند (Evand)** | Event ticketing. In-person: free for organisers, fee **30,000 toman + 5% per ticket**, paid by the attendee by default. Online events/webinars: virtual room **from 100,000 toman per hour**. Promotion packages 5.1 M–29.7 M toman (Mehr 1405 festival prices) [57] | [57] |

*Inference:* Edvora's provider-agnostic live adapter (Phase 2 D) is the right call. Skyroom has the API Edvora needs [47], but [49] shows it can stop selling with no notice. BigBlueButton on Edvora's own Iranian VMs is the hedge.

### 5.3 Marketplaces (compete for instructors, not for academies)

| Marketplace | What they offer instructors | Sources |
| --- | --- | --- |
| **فرادرس (Faradars)** | Claims 5,000,000+ learners and calls itself Iran's biggest education platform. Recording at home or in its studio (free), editing done 100% by Faradars. Two money models: revenue share paid periodically, or a one-off upfront fee. Share % not published | [53] |
| **مکتب‌خونه (Maktabkhooneh)** | Instructor sets the price. Instructor gets **97% of sales through their own link, 30% otherwise** | [54] |
| **دانشجویار (Daneshjooyar)** | Claims an average instructor income of 13,000,000+ toman per month, 1,000,000+ users, 612+ instructors | [55] |
| **یادپدیا (Yadpedia)** | Regular payouts to a bank account. A search snippet says up to 80% share; the share was not visible on the page I fetched `[unverified]` | [56] |
| Sabzlearn (سبزلرن), Toplearn (تاپ‌لرن) | Sites reachable. No instructor terms page found in this pass `[unverified]` | — |

*Inference:* for an established academy with a sales team (IBA sells by phone, per `packages/core/src/leads.ts` [71]), a marketplace takes the customer relationship and 3–70% of revenue. Edvora's pitch is "own your students, your brand and your data". Marketplaces are a **channel**, not a substitute. Instructors who want an audience will still go there.

### 5.4 How Iranian academies sell today (payment and instalment rails)

| Rail | Facts | Sources |
| --- | --- | --- |
| Instagram + DM + **card-to-card** | Zarinpal's own blog calls card-to-card the most common way to pay in Instagram shops: the seller sends a card number by DM or in comments. It names human error as the main risk and pushes a branded gateway instead | [60] |
| Telegram | Novin arranges instalment purchases **through Telegram** with staff [66]. Telegram is filtered in Iran; Bale is the likely working channel (repo handoff E-013) [71] | [66][71] |
| **Zarinpal gateway** | Standard fee **0.5% per transaction, capped at 16,000 toman, + 500 toman fixed**. First month free apart from the Shaparak fee. Enamad issuing 600,000 toman | [58] |
| **Zarinpal link (زرین‌لینک)** | Payment links for products, events and **course registration** with no website. Currently **"temporarily disabled by order of the Central Bank"** | [59] |
| In-house instalments | Novin: 2–4 instalments, no fee, full access after the first [66]. Doresaz offers "instalment purchase" as a feature [52]. Cheques and promissory notes still appear: Lendo's bank loans need an e-promissory note on some plans [63] | [52][63][66] |
| **Digipay (دیجی‌پی)**, BNPL | Instalment gateway for online shops; the merchant is **paid up front**. Merchant categories include **"دوره آموزشی" (training course)**. Plans: 6 instalments up to 100 M toman, and a 12-month bank loan at 23% with one cheque. Claims 100,000+ shops | [61] |
| **SnappPay (اسنپ‌پی)**, BNPL | 4 interest-free instalments are used by Zhaket for digital products (themes) [43]. Its website returned HTTP 403 to my client. Whether education merchants are accepted `[unverified]` | [43][65] |
| **Torob Pay (ترب‌پی)**, BNPL | "4 instalments, no fee" for buyers [62]. Merchant categories `[unverified]` | [62] |
| **Lendo (لندو)**, loans | Loan card usable at any card terminal; interest 23% [63]. *Inference:* a student could fund a course with it, but it is not a merchant integration | [63] |
| **Azki (ازکی)** | Insurance marketplace with instalment purchase of policies. **Not relevant to course sales** | [64] |

*Inference:* the realistic BNPL adapter for Edvora is **Digipay first**, because it is the only one confirmed to list a training-course category [61]. SnappPay is second, pending merchant terms. Zarinlink being switched off [59] pushes link-based Instagram sellers towards a real checkout. That is good for Edvora if onboarding is easy.

---

## 6. Comparison matrices

### 6.1 Edvora vs global SaaS and open source

| Criterion | **Edvora** (repo truth) | Teachable | Thinkific | Kajabi | LearnWorlds | Podia | Skool | Circle | Moodle + IOMAD | Open edX |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Multi-tenant / white-label | ✅ tenant per domain [71] | ⚠️ branding removal Growth+ [1] | ⚠️ Grow+ [4] | ⚠️ Growth+ [7] | ⚠️ full on Learning Center [11] | ⚠️ `[unverified]` | ❌ | ⚠️ Business+ [19] | ✅ IOMAD [29] | ⚠️ eox-tenant [33] |
| Instalments | ✅ academy-financed, ≤ 24 [71] | ✅ [3] | ✅ [4] | ✅ [9] | ⚠️ Pro Trainer+ [11] | `[unverified]` | `[unverified]` | `[unverified]` | ❌ `[unverified]` | ❌ `[unverified]` |
| CRM (lead → advisor pipeline) | ✅ [71] | ❌ `[unverified]` | ⚠️ email only [4] | ⚠️ contacts + email [7] | ⚠️ email credits [11] | ⚠️ [15] | ❌ | ⚠️ add-on [19] | ❌ | ❌ |
| Live classes | ⏳ [71] | ❌ [1] | ✅ Zoom [4] | ⚠️ Growth+ [7] | ✅ [11] | ⚠️ [15] | ✅ [17] | ✅ [19] | ⚠️ BBB plugin `[unverified]` | `[unverified]` |
| Protected video | ⏳ signed URL + watermark [71] | `[unverified]` | `[unverified]` | `[unverified]` | `[unverified]` | `[unverified]` | `[unverified]` | `[unverified]` | ❌ `[unverified]` | `[unverified]` |
| Persian / RTL / Jalali | ✅ [71] | `[unverified]` | `[unverified]` | `[unverified]` | ⚠️ RTL by ticket [13] | `[unverified]` | `[unverified]` | `[unverified]` | ⚠️ fa 63%, Jalali plugin [23][24] | `[unverified]` |
| Iranian payments | ✅ Zarinpal [71] | ❌ [2] | ❌ [5] | ❌ [8] | ❌ [11] | ❌ [15] | ❌ [18] | ❌ [20] | ⚠️ paygw_zarinpal, 13 installs [26] | ❌ `[unverified]` |
| Hosting in Iran | ⏳ ADR 002 [71] | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ self-host | ✅ self-host |
| Usable from Iran (terms) | ✅ (counsel pending) [71] | ❌ by name [2] | ❌ in practice [5] | ❌ by name [8] | ❌ in practice | ❌ in practice | ❌ [18] | ❌ [20] | ✅ | ✅ |
| Migration-in from WP | ⏳ | ⚠️ Custom plan only [1] | ⚠️ student CSV [6] | ❌ [10] | ⚠️ paid service [14] | `[unverified]` | `[unverified]` | ⚠️ free on annual Business+ [19] | ❌ | ❌ |
| Price (entry, annual billing) | not published | $29/mo [1] | $82/mo [4] | $143/mo [7] | $44/mo [11] | $42/mo [15] | $9/mo [17] | $89/mo [19] | free + hosting [29] | free + hosting [31] |
| Target customer | academies with sales staff, Iran first | solo creators → mid | creators → business | creators/coaches | academies, corporate | creators | communities | communities | universities, corporate | universities, MOOCs |

### 6.2 Edvora vs the Iranian alternatives

| Criterion | **Edvora** | WordPress stack (Tutor/LearnPress + theme + Zarinpal + SpotPlayer) | **Doresaz** | SpotPlayer (standalone) | Skyroom | Marketplaces (Faradars, Maktabkhooneh) |
| --- | --- | --- | --- | --- | --- | --- |
| Multi-tenant / white-label | ✅ [71] | ⚠️ one site each; multisite by hand `[unverified]` | ⚠️ own site + domain on landing page; up to 2 sites on top plan [50] | ⚠️ rebranding 999,000 / 3 months [45] | ⚠️ custom-domain page exists [46] `[unverified details]` | ❌ their brand |
| Instalments | ✅ academy-financed [71] | ⚠️ manual or Telegram [66]. Plugins `[unverified]` | ✅ "instalment purchase" [52] | ❌ | ❌ | `[unverified]` |
| CRM (advisor pipeline) | ✅ [71] | ❌ (add-ons `[unverified]`) | ⚠️ marketing automation, SMS [50] | ❌ | ❌ | ❌ |
| Live classes | ⏳ adapter [71] | ⚠️ via Skyroom plugin [48] | `[unverified]` | ❌ | ✅ [46] | `[unverified]` |
| Protected video | ⏳ watermark, no DRM [71] | ✅ via SpotPlayer [44] | ✅ encrypted, anti-recording [50] | ✅ [44] | n/a | ✅ own players `[unverified]` |
| Quizzes / drip / assignments | ✅ [71] | ✅ LMS plugin `[unverified per plugin]` | ⚠️ quizzes, scheduled release; assignments `[unverified]` [50] | ⚠️ exams between sections [44] | ❌ | `[unverified]` |
| Verifiable certificates | ✅ `/verify` [71] | ⚠️ plugin-dependent `[unverified]` | `[unverified]` | ❌ | ❌ | `[unverified]` |
| Persian / RTL / Jalali | ✅ | ✅ Parsi Date [37] | ✅ | ✅ | ✅ | ✅ |
| Iranian payments | ✅ Zarinpal | ✅ Zarinpal plugin [37] | ✅ own gateway [50] | n/a | ✅ | ✅ |
| BNPL | ❌ | `[unverified]` | `[unverified]` | n/a | n/a | `[unverified]` |
| Hosting in Iran | ⏳ [71] | ✅ any Iranian host | ✅ domestic CDN [50] | ✅ (Tehran office) [45] | ✅ | ✅ |
| Migration-in from WP | ⏳ | n/a | ✅ advertised [50] | n/a | n/a | ❌ |
| Price | not published | ≈1.3–2.3 M toman theme + 14,900 per student (SpotPlayer) + hosting [41][45] | 399k / 699k / 1.699 M toman per 30 days + 15k–35k per sale [51] | 14,900 per licence [45] | `[unverified]` | 3%–70% of revenue [54] |
| Target customer | academies with sales staff | anyone with an agency | solo instructors (inference) | anyone selling video | anyone running live sessions | instructors without an audience |

---

## 7. Positioning

### 7.1 Where Edvora wins

1. **The academy-with-a-sales-team workflow.** Lead form → advisor queue → follow-up rules → enrolment with instalments → certificate with `/verify` [71]. No global SaaS has an advisor pipeline, and no Iranian alternative found advertises one [7][50]. This is IBA's real sales motion (phone-led, high-ticket).
2. **Multi-tenant by design.** One codebase runs many branded academies with isolated data and a gateway per tenant [71]. In Iran the only comparable multi-tenant option is self-hosted Moodle + IOMAD, which has no commerce rail at scale [26][29].
3. **Legally and technically usable in Iran.** Iranian gateway and SMS, self-hosted fonts, an Iran-hosting decision [71]. The global platforms exclude Iran or have no rail for it [2][8][18][21].
4. **One vendor, typed and tested, instead of five plugins.** Against WordPress's security record (91% of 11,334 vulnerabilities in plugins, 46% unpatched at disclosure [39]), this is the core migration message.
5. **Academy-financed instalments up to 24 payments** with a down payment [71]. Longer than the 4-instalment BNPLs [43][62], and with no third party taking a cut. *Inference:* this suits MBA/DBA-priced programmes.

### 7.2 Where Edvora loses (today)

1. **No price, no self-serve sign-up, no trial.** Doresaz has a 14-day trial and a public ladder from 399,000 toman [50][51]. Global SaaS have 7–30-day trials [1][4][11].
2. **No protected video yet (⏳).** Iranian buyers expect SpotPlayer-class protection: device limits, watermark, revocation [44]. Doresaz bundles it [50].
3. **No live classes yet (⏳).** Cohort programmes run live. Competitors either are the live tool (Skyroom) or integrate it (WP plugin) [46][48].
4. **No migration tool yet (⏳)**, while Doresaz advertises WP → Doresaz [50].
5. **No audience.** Marketplaces bring learners: Faradars claims 5 M+ [53]. Edvora brings none.
6. **No email/marketing automation or app.** Doresaz lists marketing automation and a custom app [50]. Kajabi's and Thinkific's email tools set the global bar [4][7]. Edvora's email is ⏳ (Phase 2 F) [71].
7. **No BNPL rail.** The academy carries all instalment risk. Digipay already pays merchants up front and lists training courses [61].

### 7.3 Top 5 things to build next (ranked)

| Rank | Build | Why (evidence) | Size note |
| --- | --- | --- | --- |
| **1** | **WordPress one-click migration** (Tutor/LearnPress/LearnDash + WooCommerce): users with phone normalisation, courses/lessons, orders → enrollments, progress, coupons, Zarinpal history; **SpotPlayer licence mapping**; 301 redirects for SEO | The installed base is large (Tutor 100k+, LearnPress 70k+, Zarinpal WC 60k+ [37]). WP pain is well documented [39][40]. The global SaaS sell migration only to big accounts [1][14][19]. **Doresaz already advertises WP migration** [50], so this is a race. Keep `wp-lms-landscape.md` for field mapping | Wedge. Without it, every sale needs manual data entry |
| **2** | **Protected video (Phase 2 B)** with ArvanCloud signed HLS + moving watermark; **optionally a SpotPlayer adapter** so migrated academies keep their existing licences | Iranian buyers already pay for SpotPlayer-class protection [44][45]. Doresaz bundles it [50]. A SpotPlayer bridge lowers the switching cost for WP migrants, using SpotPlayer's JSON licence API [44] | Removes the #2 objection |
| **3** | **Live-class adapter (Phase 2 D): Skyroom first, BigBlueButton fallback** | Skyroom has a web service and is the Iranian default [46][47]. Its sales halt in Farvardin 1405 [49] shows a single provider is risky, so a self-hosted BBB fallback on the Iran VMs (ADR 002) is insurance | Needed for cohort programmes (IBA) |
| **4** | **Instalment collection:** due-date reminders (SMS now, Bale later), overdue access policy, staff "inbox zero" for finance; then a **Digipay BNPL adapter** behind `packages/integrations/payment/` | Edvora already has the plan maths [71]. Collection is what academies run by hand on Telegram today [66]. Digipay pays up front and lists training courses [61] | Turns a feature into cash flow |
| **5** | **Self-serve onboarding + published toman pricing** (tenant provisioning, domain hookup, Zarinpal merchant ID, trial) | Doresaz anchors expectations at 399k–1.7 M toman per month with a 14-day trial [50][51]. Zarinlink being switched off [59] pushes Instagram sellers to real checkouts, *if* setup takes minutes. **Pricing is a Farjad decision (human approval gate)** | Needed to sell beyond hand-held tenants |

Not in the top 5 but noted: email/marketing automation (Doresaz, Kajabi parity [7][50]); a branded mobile app (Doresaz top plan [50], Thinkific $199/mo add-on [4]); Bale OTP login (Doresaz has it [50]; Edvora's SMS OTP works today [71]).

### 7.4 The WordPress migration wedge in one paragraph

Iranian academies start on WordPress because it is cheap and local: a 1.3–2.3 M toman theme, free LMS and gateway plugins, and SpotPlayer per student [37][41][45]. As they grow, they pay for it in security (91% of WP vulnerabilities are in plugins, 46% unpatched at disclosure [39]; Tutor has had unauthenticated SQL injection [40]), in five-vendor plugin sprawl, and in sales operations run by hand (instalments over Telegram [66], card-to-card in DMs [60]). Edvora's offer: **"Bring your WordPress academy over in one step. Keep your students, orders, progress and video licences, and get an advisor CRM, instalments and verifiable certificates that WordPress never had."** The window is open, but Doresaz already makes a similar promise to solo instructors [50]. Edvora should aim the wedge at **academies with staff**, where the CRM and multi-tenant story is unmatched.

---

## 8. Top unknowns (to close next)

1. **Doresaz in depth:** which features sit on which plan, how instalments are financed, what its WP migration actually moves, and how many customers it has `[unverified]`. Read only, no sign-up.
2. **Skyroom API prices and limits** (behind the panel) and the current sales status after the Farvardin 1405 halt [49] `[unverified]`.
3. **BNPL merchant terms** for education at Digipay, SnappPay and Torob Pay: fee to the merchant, KYC, Enamad requirement [61][62] `[unverified]`.
4. **SpotPlayer storage billing unit** (per month or per term) [45], and whether its licence API lets an outside platform issue licences for migrated students `[unverified]`.
5. **Legal:** whether a Canada-based vendor may sell SaaS to Iranian academies. Notion 07 / counsel, **human approval gate** [71].
6. **Market size:** the number of Iranian academies on WP LMS plugins (wordpress.org counts are global, not per country [37]). One possible next step is a wmtips/BuiltWith-style country breakdown (wmtips returned HTTP 403) `[unverified]`.
7. Global SaaS gaps marked `[unverified]` above: video protection, RTL support and Teachable custom domain per plan.

---

## Sources

All accessed 2026-11-06.

1. Teachable, Pricing. https://teachable.com/pricing
2. Teachable, Terms of Use (§2.2 OFAC Restrictions; updated 04/20/2026). https://teachable.com/terms-of-use
3. Teachable Help Center, "Price your products" (four pricing types incl. payment plans), via search result. https://support.teachable.com/en/articles/11682476
4. Thinkific, Pricing. https://www.thinkific.com/pricing/
5. Thinkific, Terms of Service (§20.8; last modified June 30, 2026). https://www.thinkific.com/legal/terms-of-service/
6. Thinkific Support, "Migration Support: Bulk Student Import and Course Enrollment Instructions" (search-result text; fetch returned 403). https://support.thinkific.com/hc/en-us/articles/360030354314-Bulk-Student-Import-and-Enrollment-Instructions
7. Kajabi, Pricing. https://kajabi.com/pricing
8. Kajabi, Terms of Service (§3.3; modified 2026-05-05). https://kajabi.com/policies/terms/
9. Kajabi Help, "Create a payment plan offer" (via search result). https://help.kajabi.com/articles/sales/offers/create-a-payment-plan-offer
10. Kajabi Help, "Does Kajabi offer migration services?" (search-result text; fetch returned 404). https://help.kajabi.com/articles/resources/support/does-kajabi-offer-migration-services.md
11. LearnWorlds, Pricing. https://www.learnworlds.com/pricing/
12. LearnWorlds, Terms of Service (§8.2, §11.1). https://learnworlds.com/terms
13. LearnWorlds Support, "How to enable the right-to-left text in your school (RTL)". https://support.learnworlds.com/support/solutions/articles/12000080532-how-to-enable-the-right-to-left-text-in-your-school-rtl-
14. LearnWorlds Support, "LearnWorlds migration services". https://support.learnworlds.com/support/solutions/articles/12000099902-learnworlds-migration-services
15. Podia, Pricing. https://www.podia.com/pricing
16. Podia, Terms (§6(B)(iii), effective 12-12-24). https://www.podia.com/terms
17. Skool, Pricing. https://www.skool.com/pricing
18. Skool Help, "Payments FAQ" (154 payout countries, updated Sept 2026; Iran absent). https://help.skool.com/article/86-payments-faq
19. Circle, Pricing. https://circle.so/pricing
20. Circle, Terms (§1, dated September 1, 2026; §4.4). https://circle.so/terms
21. Stripe, Restricted Businesses ("High-Risk Jurisdictions and Persons"). https://stripe.com/legal/restricted-businesses
22. PayPal Developer, error `CARD_ISSUER_COUNTRY_NOT_SUPPORTED` (via search result). https://developer.paypal.com/api/payments/v2/errors/card_issuer_country_not_supported
23. Moodle, Language packs for Moodle 5.0 (fa: 63%, 20,101/32,033). https://download.moodle.org/langpack/5.0/
24. Moodle Marketplace, Persian calendar `calendartype_jalali`. https://marketplace.moodle.com/plugins/calendartype_jalali
25. Moodle Tracker, MDL-70072 (messaging dates stay Gregorian), via search result. https://tracker-old.moodle.org/browse/MDL-70072
26. Moodle Marketplace, `paygw_zarinpal`. https://marketplace.moodle.com/plugins/paygw_zarinpal
27. Moodle Statistics (146,777 registered sites; top-10 countries). https://stats.moodle.org/
28. Iranian university Moodle guides (via search results): Bu-Ali Sina University https://lms.bou.ac.ir/pluginfile.php/60647/mod_label/intro/How%20to%20Work%20with%20Moodle-%20for%20Professors%201398.12.27%20%281%29.pdf · Tabriz Univ. of Medical Sciences https://safa.tbzmed.ac.ir/uploads/user/56/safa/راهنمای استفاده از مودل فراگیر-جدید.pdf · IASBS https://iasbs.ac.ir/files/documents/computer-center/moodle/1stWShHelp.pdf
29. IOMAD, homepage. https://www.iomad.org/
30. Compono, "Moodle Workplace pricing: hidden costs 2026" (secondary, via search result). https://www.compono.com/articles/moodle-workplace-pricing-hidden-costs-2026
31. Open edX docs, edx-platform README (AGPL v3), via search result. https://docs.openedx.org/projects/edx-platform/en/latest/references/docs/README.html
32. Tutor docs, Installing Tutor (minimum 4 GB RAM / 2 CPU / 8 GB disk), via search result. https://docs.tutor.edly.io/install.html
33. PyPI, `eox-tenant`, via search result. https://pypi.org/project/eox-tenant
34. GitHub, instructure/canvas-lms (AGPL-3.0). https://github.com/instructure/canvas-lms
35. GitHub, chamilo/chamilo-lms (GPLv3+, Multi-URLs, 60+ languages incl. RTL). https://github.com/chamilo/chamilo-lms
36. Chamilo BuyCourses README (older branch: PayPal only), via search result. https://codeclimate.com/github/chamilo/chamilo-lms/public/plugin/buycourses/README.md/source
37. wordpress.org Plugins API, plugin_information/query_plugins for `tutor`, `learnpress`, `learning-management-system` (Masteriyo), `lifterlms`, `sensei-lms`, `zarinpal-woocommerce-payment-gateway`, `wp-parsidate`, `gateland`, `parsigate`. https://api.wordpress.org/plugins/info/1.2/ (human pages: https://wordpress.org/plugins/tutor/ etc.)
38. Liquid Web, LearnDash pricing (learndash.com/pricing redirects here). https://www.liquidweb.com/software/learndash/
39. Patchstack, "State of WordPress Security in 2026" (2025 data). https://www.patchstack.com/whitepaper/state-of-wordpress-security-in-2026/
40. Wordfence Intelligence, "Tutor LMS <= 3.9.6 – Unauthenticated SQL Injection via coupon_code" (search-result text; page body did not render). https://www.wordfence.com/threat-intel/vulnerabilities/wordpress-plugins/tutor/tutor-lms-396-unauthenticated-sql-injection-via-coupon-code
41. RTL-Theme (راست‌چین), education theme category. https://www.rtl-theme.com/category/wp-themes/elearning/
42. Zhaket (ژاکت), education theme category. https://www.zhaket.com/web/category/education
43. Zhaket, DigiAcademy theme page (price, SnappPay 4 instalments, buyer Q&A dated 1405/7/9). https://www.zhaket.com/web/digiacademy-theme
44. SpotPlayer (اسپات‌پلیر), homepage. https://spotplayer.ir/
45. SpotPlayer, Prices page and its script (`/assets/js/site.js`, storage array; `.t:after` adds "تومان"). https://spotplayer.ir/prices
46. Skyroom (اسکای‌روم), homepage. https://www.skyroom.online/
47. Skyroom, "What is the web service?". https://www.skyroom.online/web-service/
48. Skyroom, WordPress/webinar plugins. https://www.skyroom.online/plugins/
49. Zoomit, "Skyroom renewals with 'afternoon service' and 30% discount" (17 Farvardin 1405). https://www.zoomit.ir/iran-news/458556-skyroom-new-service-with-discount/
50. Doresaz (دوره‌ساز), Pricing page (feature table). https://doresaz.com/pricing
51. Doresaz public plan API (prices, storage, per-sale commission). https://api.doresaz.com/v1/subscription/plan
52. Doresaz, homepage (instalments, marketing features). https://doresaz.com/
53. Faradars (فرادرس), Teaching page. https://faradars.org/teaching
54. Maktabkhooneh (مکتب‌خونه), Teaching page. https://maktabkhooneh.org/teaching/
55. Daneshjooyar (دانشجویار), Become a teacher. https://daneshjooyar.com/become-teacher/
56. Yadpedia (یادپدیا), Teaching page. https://yadpedia.ir/teaching.php
57. Evand (ایوند), Pricing. https://evand.com/pricing
58. Zarinpal (زرین‌پال), Pricing/tariffs. https://www.zarinpal.com/pricing
59. Zarinlink (زرین‌لینک), homepage (Central Bank suspension notice). https://zarinp.al/
60. Zarinpal Blog, "How to pay on Instagram (card-to-card or gateway)". https://www.zarinpal.com/blog/%D8%A8%D8%B1%D8%A7%DB%8C-%D9%BE%D8%B1%D8%AF%D8%A7%D8%AE%D8%AA-%D8%AF%D8%B1-%D8%A7%DB%8C%D9%86%D8%B3%D8%AA%D8%A7%DA%AF%D8%B1%D8%A7%D9%85-%DA%A9%D8%A7%D8%B1%D8%AA-%D8%A8%D9%87-%DA%A9%D8%A7%D8%B1%D8%AA
61. Digipay (دیجی‌پی), Merchant acquisition / instalment gateway. https://www.mydigipay.com/merchant-acquisition/
62. Torob Pay (ترب‌پی), homepage. https://torobpay.com/
63. Lendo (لندو), homepage. https://lendo.ir/
64. Azki (ازکی), homepage. https://www.azki.com/
65. SnappPay (اسنپ‌پی): own site returned HTTP 403. Background via Digiato guide (search result). https://digiato.com/promoted/guide-to-installment-purchase-with-snapp-pay
66. Novin Academy (نوین), "Build website" course page (instalment terms, Telegram). https://www.novin.com/academy/build-website-course/
67. Webzi (وبزی), homepage and pricing. https://webzi.ir/ · https://webzi.ir/pricing
68. Portal.ir (پرتال), "How to build an online-training site and sell courses" (12 Bahman 1404). https://www.portal.ir/create-build-training-course
69. Kelase, homepage (Indonesian product). https://kelase.com/
70. Sari Agricultural Sciences and Natural Resources University, Adobe Connect student guide (via search result). https://sanru.ac.ir/wp-content/uploads/2025/12/1000000.pdf
71. Edvora repo (this branch): `README.md`, `AGENTS.md`, `docs/product/phase-2.md`, `docs/product/gamification.md`, `docs/adr/002-hosting-in-iran.md`, `docs/agents/handoffs/E-013.md`, `packages/core/src/{instalments,leads,quiz,drip,assignments,totp}.ts`, `apps/web/src/collections/*`, commit `83faa96`.

---

## Handoff

- **Task:** E-032 (Phase 1, part 2): competitor and alternatives research.
- **Output:** `docs/research/competitors.md` (this file). No other files touched.
- **Decisions made:** none on product scope. I ranked five build priorities (§7.3) as a recommendation only. I labelled Doresaz the primary Iranian benchmark and Digipay the first BNPL candidate (both evidence-based recommendations).
- **Open issues:** see §8. Biggest: Doresaz plan-by-feature detail, Skyroom API pricing and availability, BNPL merchant terms for education, the SpotPlayer licence API for migrated students, and the Canadian sanctions position (human gate).
- **Next owner:** Head of Product → product-manager (turn §7.3 into backlog items), tech-lead (the WP migration spec should cover SpotPlayer licence mapping and Skyroom/BBB adapter order). Pricing (§7.3 #5) and any public claim need **Farjad's approval**.
