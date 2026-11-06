# E-027 · Panel with a soul — UX (student + staff)

Step 2 of 3 (product-manager → **ux-architect** → ui-designer → tech-lead). Source: `docs/product/gamification.md` (stories **G1–G11**, referenced below).
Builds on: `/dashboard` (`apps/web/src/app/(frontend)/dashboard/page.tsx`), `/learn/[course]/[lesson]`, `docs/design/system.md`, E-022 staff shell (branch `feature/staff-shell-2fa`).
Persian copy uses half-spaces and Persian digits. `[brackets]` = placeholder to confirm. All names/colours come from the tenant; nothing is IBA-specific.

## 0. Facts that shape the design

- The PRD says `/panel`; the code today is **`/dashboard`** (title «پنل من»). This doc says "dashboard". Route name is tech-lead's call.
- Today's dashboard: greeting, "ادامه یادگیری" cards (thin `<progress>`, ٪, lesson count, a play button), certificates, orders table. Empty state is one dashed line. No sense of "this week", no path to the certificate.
- Today's lesson page marks completion with a **manual form button** (`markLessonComplete`). The PRD (G2.1) awards XP on watched ≥ threshold. The UX below supports both: the moment fires after the server confirms completion, whatever triggers it. A manual button must never be the XP trigger on its own (anti-abuse, PRD section 5).
- Staff `/staff` desks are placeholders in E-022 (finance/leads/overview link to admin collections). Advisor desk, team view and finance inbox are new desk bodies inside that shell.
- Users: 45+ managers, mid-range Android, slow national internet. **Soul = clear progress + warm words + one calm moment, not effects.** No JS animation libraries; a moment is CSS only, under 2 KB, self-hosted, and the page works fully without it.
- Palette: tenant `--brand` for rings/primary, `--accent` small highlights. Add one platform token **`--milestone`** (gold; light `#9a6b00` on surface, dark `#e0b040`; ≥3:1 on both themes, tenant may override). Use only for badges, level, certificate seal.

## 1. Where each mechanic appears

| Surface | ON (gamification) | OFF (still has soul) | Stories |
| --- | --- | --- | --- |
| Dashboard (student) | Greeting line + weekly rhythm + rings + XP/level line + certificate path + latest badge | Greeting line + "this week" card (released lessons, scaled goal as plain "برای این هفته") + progress bars + certificate path (as checklist, no gold seal) | G2 G3 G4 G5 |
| Week view (inside course) | Each released item shows done tick; weekly goal ring "۱ از ۲ روز"; locked-by-drip items show release date | Same list + release dates; no goal ring, no XP chip | G2 G3, E-026 |
| Lesson player | After completion: ring fills, «+۱۰ امتیاز» toast, "next lesson" CTA | Completion moment = tick + «این جلسه تکمیل شد» + next-lesson CTA | G2 G6 |
| Quiz result | Score + feedback first; XP chip and badge only as footnote | Score + feedback + retry/next | G2 G4 |
| Assignment | Submit confirmation line; on-time XP chip small | Confirmation line + "what happens next" | G2 |
| Certificate | Path -> sealed preview -> finale; badge فارغ‌التحصیل, level پیشگام | Path -> sealed preview -> finale (no badge/level) | G5 |
| Advisor desk | Daily goal ring, follow-up streak, win moment | List of today's follow-ups with a plain counter «۵ از ۸» | G8 |
| Team progress | Single team ring + milestone line; admin coaching view | Counter «۲۶ از ۴۰» as text + bar | G9 |
| Finance inbox | Counter, zero state, zero-day streak | Counter, zero state with calm message, no streak | G10 |

Principles for the OFF state (G1.1): **no empty slots, no "locked" teasers.** The layout reflows; it is a different composition, not a hollowed-out one. Progress, "continue", this-week, certificate path and warm copy stay.

## 2. Wireframes

Legend: `[…]` placeholder copy · `{Collection.field}` data source (concept names; E-026 and gamification fields are by concept only) · **A** primary action · **B** secondary.

### 2.1 Student dashboard

Primary action: **continue the next lesson** (one dominant button). Secondary: see certificate path / orders.
First-time user (no XP yet): ring 0%, welcome card instead of rhythm card. Returning: rhythm + "last time" resume.
Failure: if rhythm/XP data fails to load, dashboard still renders courses from `enrollments`; the soul sections collapse silently (no error box). If courses fail: card «بارگذاری نشد. دوباره تلاش کنید.» + «تلاش دوباره».

```
MOBILE 375px — single column, ABOVE THE FOLD (≈ 640px) is only items 1–3
┌───────────────────────────────────┐
│ ۱ سلام، [نام]                  [خ]│ {users.name}; first-time: «خوش آمدید، [نام]»
│   [یک جملهٔ کوتاه بر اساس وضعیت]  │ rule-based line (see §5), 1 line, text-muted
├───────────────────────────────────┤
│ ۲ CONTINUE CARD (surface, p-5)    │ {enrollments.course, cohort}; largest element
│   ◔ ring 56px  ۴۰٪  MBA برند      │ ring = courseProgress; ON: ring + %, OFF: bar + %
│   جلسهٔ بعد: [عنوان جلسه]         │ next uncompleted {lessons.title}, {lessons.module}
│   ┌───────────────────────────┐   │
│   │ ▶ ادامهٔ یادگیری  (A)     │   │ 48px, bg-brand, full width
│   └───────────────────────────┘   │
├───────────────────────────────────┤
│ ۳ THIS WEEK (sunken, p-4)         │ ON: {goal days} ring2 + «۱ از ۲ روز یادگیری»
│   ◐ ۱ از ۲ روز · ۳ هفتهٔ پیاپی    │ streak weeks (derived, student-only). OFF: «این هفته ۲ جلسه    
│   [م][ش][ی][پ]… 7 dots, Sat→Fri  │ در انتظار شماست», dots hidden
├ ─ ─ ─ below the fold ─ ─ ─ ─ ─ ─ ─┤
│ ۴ LEVEL + LAST BADGE              │ ON only. «سطح کوشا · ۱۲۰ امتیاز تا حرفه‌ای»
│   ⬡ قدم اول — ۱۴ آبان             │ thin bar; last badge {badge key, awardedAt} formatJalali
│   همهٔ نشان‌ها ›                  │ B → badge list (sheet), not a new page
├───────────────────────────────────┤
│ ۵ CERTIFICATE PATH                │ {certificateEligibility reasons progress/defense}
│   ●──●──○──○──🔒                  │ درس‌ها · تکلیف‌ها · آزمون‌ها · دفاع* · گواهی  (*only if requiresDefense)
│   «۲ تکلیف و دفاع نهایی باقی مانده»│ exact remaining text, never vague
├───────────────────────────────────┤
│ ۶ گواهی‌های من / ۷ سفارش‌ها و اقساط│ existing sections unchanged; orders table
└───────────────────────────────────┘ stays horizontally scrollable

DESKTOP ≥1024px — 12-col, max-w-7xl. Above the fold = rows 1–2.
┌─────────────────────────────────────────────────────────────────────┐
│ ۱ greeting (start)                                    [خروج] (end)  │
├─────────────────────────────────────────┬───────────────────────────┤
│ ۲ CONTINUE CARD(s) (col-span 8)         │ ۳ THIS WEEK card (4)      │
│  one per active enrollment, 2-up grid   │  ring + dots + streak     │
│                                         ├───────────────────────────┤
│                                         │ ۴ LEVEL + last badge      │
├─────────────────────────────────────────┴───────────────────────────┤
│ ۵ CERTIFICATE PATH (full width, horizontal stepper)                 │
├─────────────────────────────────────────────────────────────────────┤
│ ۶ certificates                          ۷ orders and instalments    │
└─────────────────────────────────────────────────────────────────────┘
```

Rules:
- Two enrollments (G2.9): continue cards stack; the THIS WEEK card has a segmented switch «MBA برند | کارگاه» only when >1 enrollment. Level line says «سطح شما در آکادمی» (account-wide) so it is not confused with course ring.
- One ring per card, max. Rings are SVG with `stroke-dasharray` from server values (G2.7: no layout shift, fixed 56px box). Text value always beside the ring, never only inside.
- Cards: no nesting. Item 5 is a stepper, not a card in a card.
- OFF composition: item 3 becomes a one-line "this week" strip; items 4 and gold are removed; 5 stays with neutral colour (`text-brand`, no `--milestone`).
- Returning after a gap: sentence 1 changes (§5), no guilt counters.

### 2.2 Lesson-complete moment (inside the lesson page)

Primary action: **next lesson** («جلسهٔ بعد: [عنوان] ‹»). Secondary: «بازگشت به پنل». Never blocks navigation; there is no modal.
Failure: save fails (offline/slow) -> inline row «ذخیره نشد. اتصال شما ضعیف است؛ دوباره تلاش می‌کنیم.» with «تلاش دوباره»; no celebration shown until the server confirms. If the server answers with different XP (G6.3) the numbers update silently.
First lesson ever: the same block plus the «قدم اول» badge line (once). Returning: standard block.

```
MOBILE 375 — block replaces the old "mark complete" button, below the title; the video stays on top
┌───────────────────────────────────┐
│ ▶ video (aspect-video)            │
│ عنوان جلسه                        │
├───────────────────────────────────┤  role="status", aria-live="polite" (see §7)
│ ✓  این جلسه تکمیل شد              │ line 1, font-bold {enrollments.completedLessons}
│    ◔ ۴۰٪ → ۴۵٪   [+۱۰ امتیاز]     │ ring 40px animates once; chip ON only {XP ledger}
│    ۱ از ۲ روز این هفته            │ ON only; when goal closes: «هدف این هفته کامل شد»
│ ┌───────────────────────────────┐ │
│ │ جلسهٔ بعد: [عنوان] ‹  (A)     │ │ 48px brand; if no next: «به پنل برگردید» as A
│ └───────────────────────────────┘ │
│  بازگشت به پنل  (B, text link)    │
└───────────────────────────────────┘
Desktop: same block under the video in the left column; the lesson list on the end side
ticks the lesson and scrolls it into view. Nothing overlays the video.
```

- Appearance: the block fades in (150 ms) and the ring sweeps (600 ms) once. Chip stays; nothing auto-dismisses because it is part of the page (not a toast). It disappears on navigation and is not shown again on reload (G6.2); on reload the lesson just shows the quiet state «✓ تکمیل شده — [۱۴ آبان]» using `formatJalali`.
- Daily cap hit (G2.4): chip replaced by muted «سقف امتیاز امروز تکمیل شد»; completion line unchanged.
- Rewatch (G2.3): quiet state only, nothing.
- Auto-next: **none**. Executives choose; no 5-second countdown.

### 2.3 Quiz result (concept level; fields are E-026's)

Rule: **feedback before reward.** The result page answers "how did I do and what should I do next" first; XP/badges are a footnote.

PASS (primary: next step · secondary: review answers):
```
MOBILE 375
┌───────────────────────────────────┐
│ آزمون: [عنوان آزمون]              │
├───────────────────────────────────┤  role="status"
│ ✓ قبول شدید                       │ h1, text-ok + icon (colour not alone)
│   ۸ از ۱۰ درست · ۸۰٪              │ {attempt score, max, pass mark}
│   حد نصاب قبولی: ۶۰٪              │
│ ───────────────────────────────── │
│ [یک جملهٔ بازخورد: نقطه قوت]      │ from result, e.g. best topic [module]
│ ───────────────────────────────── │
│ (A) ادامه: [جلسهٔ بعد] ‹          │ 48px brand
│ (B) مرور پاسخ‌ها                  │ outline
│ ───────────────────────────────── │
│ ON: +۳۰ امتیاز · نشان «تحلیل‌گر»  │ small row, text-sm, milestone colour for badge only
└───────────────────────────────────┘
```
NOT YET PASSED (the emotionally risky one; primary: review the weak part · secondary: retake):
```
┌───────────────────────────────────┐
│ هنوز به حد نصاب نرسیده‌اید        │ h1, text-ink (NOT red); icon ◐ not ✗
│   ۴ از ۱۰ درست · ۴۰٪              │
│   برای قبولی ۶۰٪ لازم است         │
│ ───────────────────────────────── │
│ بیشتر در [موضوع] کمک می‌کند       │ the 1–2 weakest topics/lessons, linked
│  • [درس ۳ — عنوان] ‹              │
│ ───────────────────────────────── │
│ (A) مرور درس‌های مربوط            │ primary = learn, not retry
│ (B) آزمون دوباره [الان / ۱۲ ساعت دیگر] │ if cooldown (E-026): show when, disabled w/ reason text
│ ───────────────────────────────── │
│ شمار تلاش: ۱ از [۳]               │ only if attempts are limited
│ ON: «امتیاز اضافی از دست نرفت»    │ NEVER shown; no XP shown at all on a fail
└───────────────────────────────────┘
```
- No red full-width banner, no ✗, no "شکست خوردید". First-time fail and returning fail look identical.
- Fail -> pass later (G2.5): PASS layout plus footnote «نتیجهٔ بهتر ثبت شد».
- Failure of submit/load: «ارسال نشد؛ پاسخ‌های شما نگه داشته شد» + «ارسال دوباره» (answers kept client-side).
- Desktop: same single column, max-w-xl centred; "review answers" opens inline accordion.

### 2.4 Advisor desk with daily goal (`/staff/leads` landing for advisors)

Primary action: **open the next due follow-up** («پیگیری بعدی: [نام مشتری]»). Secondary: filter «همه / امروز / عقب‌افتاده». Failure: list fails -> «بارگذاری نشد. دوباره تلاش کنید.» + retry, counters hidden. First-time: goal ring 0, no streak yet, line «امروز [۸] پیگیری دارید.» Returning: ring + streak.
Data: due follow-ups = `leads` with next-follow-up date <= today and owner = me `[field to be added, PRD open Q6]`; done = follow-up with a **recorded outcome** (G8.2). Counting is server-side only.

```
MOBILE 375 — above the fold = 1, 2, first row of 3
┌───────────────────────────────────┐
│ سلام [نام]. امروز ۸ پیگیری دارید  │ 1 greeting + number, {users.name}
├───────────────────────────────────┤
│ ◔ ۵ از ۸ پیگیری انجام شد          │ 2 DAILY GOAL (sunken); ring 48px + text
│   ۴ روز کاری پیاپی همه را پیگیری  │ follow-up streak ON only; own data only
│   کردید                           │ OFF: just the counter and a thin bar
│ ┌───────────────────────────────┐ │
│ │ پیگیری بعدی: [نام مشتری] (A)  │ │ 48px brand; top of the due list
│ └───────────────────────────────┘ │
├───────────────────────────────────┤
│ امروز │ عقب‌افتاده(۱) │ همه       │ 3 filter chips (B)
│ ┌ [نام] · [دورهٔ مورد علاقه] ──┐  │ lead row: {leads.name, interest course}
│ │ ۰۹۱۲… (ltr)   [زمان پیگیری]  │  │ phone Latin font; tap = call; outcome chips after call
│ └───────────────────────────────┘ │
│ … rows                            │
├───────────────────────────────────┤
│ تیم: ◔ ۲۶ از ۴۰ این هفته          │ 4 team ring (small, single line), link ‹ to team view
└───────────────────────────────────┘
DESKTOP ≥1024 inside the E-022 shell: left (start) col-span 8 = due list; right col-span 4 =
DAILY GOAL card, then TEAM card, then «پرونده‌های بسته‌شده امروز» (wins). Goal card is sticky.
```
- Outcome capture is the only thing that moves the ring: after a call the row asks «نتیجه چه شد؟» with chips (دسترسی شد / پاسخ نداد / زمان بعدی تعیین شد / ثبت‌نام کرد). No outcome = row stays due (explained in-row: «برای ثبت پیگیری، نتیجه را انتخاب کنید»).
- Win moment (G8.7): when a lead moves to registered/paid: a one-line inline note on that row «[نام] ثبت‌نام کرد. دست شما درد نکند.» + goal ring ticks. 4 s, then rests as a normal row.
- Goal complete: ring closes, line «همهٔ پیگیری‌های امروز انجام شد» (empty state E4 below). Admin never sees an advisor rank list (G9.2).

## 3. Emotional moments

Common rules: local UI only (server confirms, corrects silently — G6.3). Celebration is **inline in the page**, never a blocking modal, except the certificate finale which is its own page. No sound. No haptics. Everything is skippable by simply navigating. Master cap: **at most 1 celebratory element per page view; at most 3 per day per user**; extras are recorded and shown as a quiet line in the dashboard. With celebrations toggled off (G6.4), every row below degrades to its "reduced" column. OFF-gamification versions are listed in the last column.

| # | Moment | Trigger | What the user sees | Duration / dismiss | Frequency cap | Reduced motion / celebrations off | Gamification OFF |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | First login | First successful SMS login with 0 prior sessions | Dashboard welcome card in place of "this week": brand mark, «خوش آمدید، [نام]»; one line of what to do; A = «شروع اولین جلسه» | Stays until first lesson done; small «بستن» (x) hides it for good | Once per account per academy | Same, no fade | Same card, no mention of "امتیاز" |
| M2 | First lesson done | First entry in `completedLessons` | Lesson-complete block (2.2) + badge line «نشان قدم اول گرفتید» (gold) | Inline, persistent while on page; not repeated on reload | Once ever (badge is lifetime) | Static block, no ring sweep | «اولین جلسه را تمام کردید. ادامه دهید.» |
| M3 | Lesson done (normal) | Each new completion | Lesson-complete block (2.2) | Inline; gone on navigation | Max 1 per page; cap at 150 XP removes chip only | Static | Tick + sentence |
| M4 | Weekly goal met (streak saved) | Learning-day goal reached in Jalali week | Ring closes on dashboard/lesson block; line «هدف این هفته کامل شد. ۴ هفتهٔ پیاپی.» | Inline 1 line; no dismiss needed | Once per week | Static line | Line without streak: «برنامهٔ این هفته را کامل کردید.» |
| M5 | Streak freeze used | Week ended below goal, freeze spent (G3.2) | On next visit, quiet note at top of "this week": «هفتهٔ گذشته فرصت جبران استفاده شد؛ ریتم شما حفظ شد.» | Dismissible (x); auto-hidden after next visit | Once per freeze | Same | Not shown |
| M6 | Streak at risk | Day 5 of week (`[Wed]`), goal not met, content released and unfinished | Soft line inside "this week", **no notification by default**: «برای هدف این هفته یک روز دیگر مانده است.» | Persists in card; not a banner; never red | Once per week | Same | «این هفته [۲] جلسه در انتظار شماست.» (no goal wording) |
| M7 | Streak broken (gentle) | Week ended below goal, no freeze, not neutral | Next visit: «از این هفته دوباره شروع می‌کنیم.» Longest streak stays: «بهترین ریتم شما: ۴ هفته» | Dismissible; shown once | Once per break | Same | Not shown |
| M8 | Quiz passed | Result page, pass | PASS layout (2.3) with ✓ and a calm line; badge row if any | Persistent on that page | Per attempt; badge once | Static | Same page without XP/badge row |
| M9 | Quiz not yet passed | Result page, fail | NOT-YET layout (2.3); no reward elements | Persistent | Per attempt | Same | Same |
| M10 | Assignment submitted | Successful submit | Inline confirmation «تکلیف شما ارسال شد» + «[مربی] ظرف [۴۸] ساعت بررسی می‌کند» + ON: «+۳۰ امتیاز» small | Inline | Per assignment | Static | Without XP |
| M11 | Level up | Total XP crosses threshold | Small card under the lesson-complete block or at top of dashboard: «به سطح «کوشا» رسیدید» + next level line | Dismissible (x); remembered | Max 1 per day; stacked ups merge into the highest | Static | Not shown |
| M12 | Course 100% | `courseProgress` = 100 | Full-width dashboard card (not a modal): «همهٔ درس‌ها را پشت سر گذاشتید.» + the exact remaining items to the certificate | Persistent until certificate or until dismissed (x), re-shown as the path state | Once per enrollment | Static | Same sentence, no gold |
| M13 | Certificate issued | `certificates` row created | Finale page (§3.1) | Own page; leaves by link; later visits show quiet version | Full version once; quiet afterwards (G5.4) | No sweep/sheen | Same page; no badge/level rows |

### 3.1 Certificate finale (page, not modal)

```
MOBILE 375
┌───────────────────────────────────┐
│ تبریک، [نام]                      │ h1
│ «دورهٔ MBA برند» را به پایان رساندید│ {courses.title}
│ ┌ certificate preview ──────────┐ │ aspect 1.414:1, from {certificates}; the ONLY gold seal on page
│ │ [نام] · [عنوان دوره] · [تاریخ]│ │ formatJalali(issued)
│ └───────────────────────────────┘ │
│ کد استعلام  ABCD-1234 (ltr latin) │ {certificates.code}; copy button; QR
│ (A) دانلود گواهی PDF              │ 48px brand
│ (B) اشتراک‌گذاری / صفحهٔ استعلام  │ share only if tenant allows (PRD open Q5); default: verify link
│ ON: نشان «فارغ‌التحصیل» · سطح «پیشگام»│ one row
└───────────────────────────────────┘
```
Plays a 1.2 s seal sheen once (CSS, `motion-safe:`); nothing else. No DBA "وزارت علوم" wording unless the verified flag exists (G5.5). Sealed state before issuing: same preview greyed with the exact missing text (G5.1/5.2); XP never unlocks it (G5.3).

## 4. Empty states with personality

Each: icon (system icon, 40px, `text-muted`) · one warm line · one action. Never a bare «هیچ موردی یافت نشد». All also exist with gamification OFF unchanged (none depends on XP).

| # | State | Where | Copy | Action | Data |
| --- | --- | --- | --- | --- | --- |
| E1 | No courses yet | Dashboard "continue" | **«مسیر یادگیری شما از اینجا شروع می‌شود.»** / «هنوز در دوره‌ای ثبت‌نام نکرده‌اید. برنامه‌های آکادمی را ببینید یا با مشاور صحبت کنید.» | A «مشاهدهٔ دوره‌ها» (`/#programs`); B «درخواست تماس مشاور» (existing lead flow) | `enrollments` length 0 |
| E2 | Nothing released this week | "This week" card | **«این هفته جلسهٔ جدیدی منتشر نشده است.»** / «تا جلسهٔ بعدی ([تاریخ شمسی]) می‌توانید جلسه‌های قبلی را مرور کنید.» Week is neutral; do not show goal ring | A «مرور جلسه‌های قبلی» | drip release (E-026), `formatJalali` |
| E3 | Leaderboard not enough participants | Cohort leaderboard card (G7.2) | **«جدول گروه هنوز آماده نیست.»** / «وقتی تعداد کافی از هم‌دوره‌ای‌ها فعال کنند، نمایش داده می‌شود.» — never shows counts or names of opted-in people | B «فعال‌سازی مشارکت من» (opt-in toggle) | opt-in count < `[8]` |
| E3b | Leaderboard not opted in | same (G7.1) | **«می‌خواهید در جدول گروه باشید؟»** / «فقط با نام مستعار نمایش داده می‌شوید و هر زمان می‌توانید خارج شوید.» | A «مشارکت می‌کنم» B «فعلاً نه» | prefs |
| E4 | Advisor, zero follow-ups due | Advisor desk | **«امروز پیگیری عقب‌افتاده‌ای ندارید.»** / «فرصت خوبی برای تماس با سرنخ‌های جدید است.» Streak is neutral (G8.4) | A «سرنخ‌های جدید» | leads due = 0 |
| E4b | Advisor, all done today | Advisor desk | **«همهٔ پیگیری‌های امروز انجام شد.»** / «دست شما درد نکند.» | B «برنامهٔ فردا» | done = due |
| E5 | Finance inbox zero | Finance desk (G10.2) | **«همه‌چیز بررسی شده است.»** / «پرداختی در انتظار بررسی نیست.» with ✓ icon in `text-ok`; below: «آخرین بررسی: [ساعت]» and, ON only, «۳ روز پیاپی صندوق خالی» | B «مشاهدهٔ پرداخت‌های بررسی‌شده» | `orders.payments` started/failed = 0, instalments overdue = 0 |
| E6 | No badges yet | Badge sheet (ON) | «نشان‌ها با پیشرفت شما جمع می‌شوند. اولین نشان: تکمیل یک جلسه.» | A «ادامهٔ جلسه» | — |
| E7 | No certificates yet | Dashboard certificates | Not an empty box: section hidden; replaced by the certificate path (2.1 item 5) | — | `certificates` 0 |
| E8 | No orders | Orders section | «سفارشی ندارید.» -> «پرداخت‌های شما اینجا نمایش داده می‌شود.» | — | `orders` 0 |

## 5. Microcopy tone guide

Voice: a good executive coach. Respectful **شما** always, full sentences, no exclamation marks except the certificate headline (max one per page), no emoji, no "عزیز" spam (only the fallback name). Numbers in Persian digits, dates via `formatJalali`, amounts via `formatToman`. Half-space in می‌، نمی‌، ‌ها، حرفه‌ای، پایه‌ای، دوباره‌.

| Don't | Do | Why |
| --- | --- | --- |
| «ایول! تو عالی بودی!!!» | «عالی پیش رفتید. جلسهٔ بعد منتظر شماست.» | شما, no shouting |
| «سطحت رفت بالا 🎉» | «به سطح «کوشا» رسیدید.» | No emoji, formal register |
| «استریکت از بین رفت!» | «از این هفته دوباره شروع می‌کنیم.» | No loss framing |
| «شما ۳ روز است که درس نخوانده‌اید» | «سلام [نام]، خوش برگشتید. جلسه‌ای که نیمه‌کاره ماند آماده است.» | Welcome back, not a counter |
| «آزمون رو افتادی» | «هنوز به حد نصاب نرسیده‌اید. این بخش‌ها کمک می‌کند.» | "هنوز" keeps the door open |
| «خطا! دوباره سعی کن» | «ذخیره نشد. اتصال شما ضعیف است؛ دوباره تلاش می‌کنیم.» | Explains cause, calm |
| «۱۰ XP گرفتی» | «۱۰ امتیاز به شما اضافه شد.» (ON only) | Persian word, شما |
| «هنوز هیچی نداری» | «مسیر یادگیری شما از اینجا شروع می‌شود.» | Empty state invites |
| «تبریک!!! شما برنده شدید» | «تبریک، [نام]. دورهٔ MBA برند را به پایان رساندید.» | Adult, specific |
| «سریع‌ترین دانشجو شما بودید» | «این هفته ۲ روز یاد گرفتید.» | Rewards consistency, never speed |
| «ایمیل نزدی؟ عقب افتادی» (staff) | «۳ پیگیری برای امروز باقی مانده است.» | Neutral numbers |
| «جدول: شما نفر آخر هستید» | never shown. Own rank only: «شما: رتبهٔ ۱۲ از ۳۰» | No bottom ranks |
| «بیشترین پول را وصول کردی» | «همهٔ پرداخت‌ها بررسی شد. دست شما درد نکند.» | Outcomes, not amounts |

Rule-based greeting line (dashboard item 1; first match wins; one line):

| Condition | Line |
| --- | --- |
| No enrolment | «برنامهٔ یادگیری خود را انتخاب کنید.» |
| First visit, 0 lessons | «خوش آمدید. اولین جلسه چند دقیقه بیشتر نیست.» `[دقیقه از lessons]` |
| Away ≥ 7 days | «خوش برگشتید. از همان‌جا که ماندید ادامه دهید.» |
| Weekly goal met | «این هفته برنامه را کامل کردید.» |
| Course 100%, certificate pending | «تا گواهی فقط [دفاع نهایی] مانده است.» |
| Default | «این هفته [۲] جلسه در انتظار شماست.» |

Copy per moment is in the tables in §2–§4; the strings there are the canonical set. New strings follow the same register and go through this table first.

## 6. Settings and states the UI must handle (G1)

- Four independent flags reach the page as plain booleans from the server: `gamification.on`, `streaks`, `badges/levels`, `celebrations`, plus `leaderboard`. Server components decide what to render; client components only animate.
- Every gamified block is wrapped in a component that returns `null` when its flag is off, and the parent grid must not rely on its presence (OFF composition in 2.1).
- Tenant-renamed level/badge names pass through unchanged; no string concatenation that splits half-spaces.
- Dark theme: rings use `--brand` mixed with `--sunken` for track; `--milestone` is checked against both surfaces.

## 7. Accessibility

| Topic | Rule |
| --- | --- |
| Live regions | The lesson-complete block, quiz result, and weekly-goal line are `role="status"` (`aria-live="polite"`, `aria-atomic="true"`), injected into an **already-present empty container** so it is announced. Level-up and badge cards also `polite`. Nothing uses `assertive` (no errors-as-celebrations). Save failure uses `role="alert"`. |
| Announce text | Single sentence, no emoji: «این جلسه تکمیل شد. ده امتیاز اضافه شد.» Not read twice when the visual chip updates. |
| Focus | Celebration never steals focus. After lesson complete, focus stays on the completion control, then the block's primary CTA is the next tab stop. Quiz result: move focus to the result `h1` (tabindex -1) on load. Finale page: focus on `h1`. Dismiss buttons are reachable by keyboard, `Esc` is not needed (no modals). |
| Colour not alone | Pass = ✓ icon + word «قبول شدید»; not-yet = ◐ icon + words; streak and ring always have the number in text (`aria-label="۴۰ درصد از دوره"` on `<svg role="img">` or `<progress>`); gold badges carry the name. Week dots: filled + `aria-label` per day «شنبه: انجام شد». |
| Contrast | Text >= 4.5:1, rings/borders >= 3:1 on light and dark; `--milestone` and tenant brand verified by `tenantPalette`. |
| Motion | All animations wrapped in `motion-safe:` (matches `prefers-reduced-motion: no-preference` in `styles.css`). Reduced motion = final state rendered immediately (G6.1). In-app toggle «جلوه‌های تبریک» (user prefs) in addition to the OS setting (G6.4). No auto-playing video/Lottie, nothing flashes (< 3 per second, none planned). |
| Touch / performance | Targets >= 44px, CTA 48px (existing `buttonClass`). Rings are inline SVG; no images or fonts added. Works at 360px with no horizontal scroll (G2.7). |
| Language | Rings' accessible names and all announcements in Persian; digits Persian in text, Latin only in codes/phones (`dir="ltr"`). |

## 8. Out of scope / not designed here

Leaderboard layout detail (only the empty states, G7), admin settings screen for G1 toggles (belongs to the admin/E-02x work), team coaching view layout (G9: list sorted by name, columns workload and stuck leads, no ranking), notifications content for streaks (Phase 2 F).

## Handoff

- **Task:** E-027 step 2 — UX for the gamified panels (student + staff), ON/OFF versions, moments, empty states, copy, a11y.
- **Output:** `docs/ux/E-027-panel-soul.md`. Four screens ready for the ui-designer preview: student dashboard (2.1), lesson-complete (2.2), quiz result pass / not-yet (2.3), advisor desk (2.4). Certificate finale (3.1) as optional fifth.
- **Decisions made:**
  - Continue-lesson is the dominant action on the dashboard; rhythm/level/badges come after it. Above the fold on 375px: greeting, continue card, this-week card only.
  - Celebrations are inline blocks, never modals; no auto-next; caps: 1 per page view, 3 per day. Certificate finale is the only full page.
  - OFF is a re-composition, not hidden pieces: this-week strip, bars, checklist path, warm copy stay.
  - Quiz fail shows no reward elements and no red; primary action is "review", not "retake". Feedback before XP in the pass layout.
  - Streak-at-risk and broken are soft in-card lines, no banners; no push by default.
  - New platform token `--milestone` (gold) limited to badges, level, certificate seal.
  - Advisor goal moves only on a recorded outcome; outcome chips are part of the desk row. Team ring appears in the advisor desk as a one-liner.
- **Open issues:**
  - PRD says `/panel`, code is `/dashboard`.
  - PRD G2.1 awards XP on watched >= threshold, but the current lesson page has a manual "mark complete" form. Which event is the completion trigger is a tech-lead decision (video progress events vs button); the UX works with either as long as the server confirms.
  - Advisor goals need a follow-up date field on `leads` (PRD Q6); until then 2.4 shows an activity-based list.
  - Day-of-week for "streak at risk" nudge `[Wed]` and week start (Saturday?) need the client's answer (PRD Q3).
  - Quiz cooldown / attempts / retake rules and drip release dates come from E-026; wireframes show them conditionally.
  - Level thresholds and badge names pending Farjad; leaderboard visual design not drafted (only empty states).
- **Next owner:** `ui-designer` (previews for 2.1–2.4, tokens incl. `--milestone`, ring component); then `tech-lead` for completion trigger, ledger and flags.
