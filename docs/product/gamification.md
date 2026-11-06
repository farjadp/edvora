# Gamification — "panel with a soul"

**Task:** E-027 · **Source:** Farjad: staff and student panels feel "خیلی بی‌روحه"; `AGENTS.md`, `docs/product/phase-2.md` (A, C, Q, R), `packages/core/src/progress.ts`, `apps/web/src/collections/*`
**Not read:** Notion pages; `docs/ux/E-022-staff-shell.md` (not in this branch; it lives on `feature/staff-shell-2fa`). Anything unknown is in `[brackets]`.
**Dependency:** quizzes, assignments and content drip come from E-026. This doc names them by concept only; field names are for tech-lead.

## 1. Goal and tone

Give every panel a pulse: visible progress, small wins, a reason to come back this week, and one big finish (the certificate). Voice is an executive programme, not a game. Think "a good coach and a Swiss watch", not "cartoon mascot".

| Do | Don't |
| --- | --- |
| Quiet, confident copy: «این هفته دو جلسهٔ یادگیری داشتید.» | Confetti on every click, emoji spam, "Oops!", countdown panic |
| Rings, thin lines, tenant brand colour, one gold accent for milestones | Cartoon badges, coins, hearts/lives, loud sounds |
| Reward consistency and finishing | Reward speed or raw time on screen |
| Rest is allowed and planned for | Guilt: no "you lost your streak!" red banners |

**Non-goals (said no):**

| Feature | Why not |
| --- | --- |
| Public global leaderboard, bottom-rank lists | Shaming adult paying clients; privacy; hurts renewals |
| Points that buy discounts or cash | Touches revenue/accounting; abuse risk. `[Farjad: later?]` |
| Hearts/lives, lost-streak punishments | Wrong tone for executives |
| Individual staff ranking | Toxic; makes advisors log fake calls. Team goal instead |
| Chat, social feed, friend requests | Not one of the three revenue lines |
| Gamifying the public site or checkout | Out of scope; panels only |
| Native push/sound, third-party SDKs | AGENTS.md: no external runtime dependencies. Reuse email/SMS/Telegram/Bale from Phase 2 F |

## 2. Tenant control (Core, with Tenant config)

| Setting | Default | Notes |
| --- | --- | --- |
| Gamification on/off (master) | **Off** for new tenants `[Farjad: or on?]`; IBA on after Farjad's approval | A tenant feature flag next to `lms`/`crm` in `tenants.features`, tech-lead decides shape |
| Per-mechanic toggles | all on when master is on | XP & levels · streaks · badges · cohort leaderboard · celebrations · staff goals · finance inbox-zero |
| Audience | students / staff / both | Staff side can be on while students are off, and vice versa |
| Level names, badge names/icons | platform defaults (section 4) | Tenant may rename; keep Persian half-spaces |
| Weekly goal (learning days) | 2 | Range 1–5 |
| Streak freezes | 1 per 4 streak weeks, max 2 banked | `[IBA: ok?]` |
| Leaderboard size N | 5 | Range 3–10 |
| Staff daily goals | see section 6 | Admin edits numbers |
| Brand | Reuses `branding.primaryColor` / `accentColor` | Gold for milestone moments is a platform token, tenant may override |
| XP values | defaults in section 3 | Super-admin only for P1; academy admin in P2 `[Farjad]` |

**When off:** progress bars/percent (`courseProgress`), "continue lesson", week view and certificate all remain. Hidden: XP, levels, streaks, badges, leaderboard, celebrations. No empty placeholders and no "locked" teasers. Existing history is kept (not deleted) so turning it back on restores everything.

## 3. Student mechanics

### 3.1 XP

XP measures **meaningful learning actions**, never time on screen. All values are starting proposals `[tune with IBA after 1 cohort]`.

| Action | XP | Cap / rule |
| --- | --- | --- |
| Complete a lesson (watched ≥ the completion threshold in Phase 2 B3, `[90]`%) | 10 | Once per lesson, ever. Rewatch = 0 |
| Pass a quiz first time | 20 base + up to 10 by score | Score bonus only on first attempt |
| Retake a quiz | 0 XP unless it turns fail into pass: then 10 (flat, once) | Never lowers XP; best attempt counts for badges |
| Submit an assignment on time | 30 | Once per assignment; resubmit before deadline = 0 extra |
| Submit late (if tenant allows late) | 10 | |
| Assignment graded at/above pass mark | +20 | Once per assignment |
| Attend a live class (joined ≥ `[50]`% of duration) | 15 | Needs live-class attendance from Phase 2 D; if unavailable, skip |
| Complete a course (all lessons + required assignments) | 100 | Once per enrollment |
| Pass final defense | 150 | Once per enrollment |
| Weekly goal met | 25 | Once per week |
| Daily cap | 150 XP/day | Stops binge-farming; the excess is not carried over |

Rules:
- XP is awarded to an **enrollment** (course and cohort context) and rolls up to the student's total at that academy.
- No XP for: opening a page, skipping ahead without completing, scrubbing a video to the end, downloading resources, profile edits, logging in.
- A revoked or invalidated action (e.g. grade overturned, refund/cancellation) reverses its XP with a ledger entry, never silently.

### 3.2 Levels and progress rings

| Level | Default Persian name | Idea |
| --- | --- | --- |
| 1 | آغازگر | Just started |
| 2 | پویا | First rhythm |
| 3 | کوشا | Consistent |
| 4 | حرفه‌ای | Strong progress |
| 5 | برجسته | Near the end |
| 6 | پیشگام | Finished + defended |

Thresholds `[XP per level: derive from the real course size once E-026 content exists]`. Levels never go down. Names are tenant-editable (Level 6 may be tied to the certificate rather than XP).

Progress rings (on `/panel`): one ring per active enrollment = `courseProgress` %. A second thin ring = this week's learning-day goal (e.g. ۱ از ۲ روز). Level shown as a small label and a line to the next level, with Persian digits («۱۲۰ امتیاز تا سطح کوشا»).

### 3.3 Streaks: "weekly rhythm" (Core)

Adult learners have jobs, travel and Nowruz. A daily streak would punish them. So:

- A **learning day** = at least one XP-earning action that day (Asia/Tehran day, Jalali calendar).
- A **streak week** = the learning-day goal met in a Jalali week (week-start day follows the tenant setting from Phase 2 A, `[Saturday? confirm]`).
- The streak counts **consecutive streak weeks**, shown as «۳ هفتهٔ پیاپی».
- **Rest-day rule:** the goal is days *per week*, not specific days; the student chooses nothing, any 2 days count. Rest days never break anything.
- **Freeze:** if the goal is missed, a banked freeze is spent automatically and the streak survives. The student is told gently afterwards, not warned with alarms.
- **Drip-aware (needs E-026 release info):** a week counts as *neutral* (streak neither grows nor breaks) when the student has **nothing released and unfinished**, or when the cohort is on a scheduled break. A student who is fully caught up is never punished.
- Goal is scaled down: if fewer than the goal's number of items are released that week, the goal becomes that number (min 1).
- Streak shown only to the student (and anonymised in the leaderboard as nothing; streaks are not ranked).
- Broken streak copy: «از هفتهٔ آینده دوباره شروع می‌کنیم.» No red, no loss framing. Longest streak is kept as a personal record.

### 3.4 Badges and milestones

Badges are awarded once per student per enrollment (or lifetime where noted). Starter catalogue `[Farjad approves names]`:

| Badge (Persian) | Trigger | Scope |
| --- | --- | --- |
| قدم اول | First lesson completed | Lifetime |
| شروع قوی | 3 lessons in the first week | Enrollment |
| ریتم هفتگی | 3 streak weeks | Lifetime |
| پایدار | 8 streak weeks | Lifetime |
| تحلیل‌گر | First quiz passed at ≥ `[80]`% on first try | Enrollment |
| به‌موقع | 3 assignments submitted before deadline | Enrollment |
| بازخورد را جدی گرفت | Resubmitted/improved after feedback `[only if resubmission is allowed]` | Enrollment |
| نیمهٔ راه | 50% course progress | Enrollment |
| خط پایان | 100% lessons + required assignments done | Enrollment |
| آمادهٔ دفاع | Eligible for final defense (`certificateEligibility` blocked only by defense) | Enrollment |
| فارغ‌التحصیل | Certificate issued (also the final boss) | Enrollment |
| همیشه حاضر | Joined ≥ `[80]`% of live classes | Enrollment |

Rules: no "rare/legendary" tiers; badge shows name, one line of why, and the Jalali date earned. Public share only if the student chooses (static image, no tracking).

### 3.5 Cohort leaderboard (Tenant config, opt-in)

| Rule | Detail |
| --- | --- |
| Off by default, per tenant; then **opt-in per student**, default **off** | Student can opt out any time; opting out removes them immediately |
| Scope | Same cohort only, never cross-tenant, never cross-cohort |
| Metric | XP earned **this week** and **cohort total**; not streaks, not grades |
| Display | Top N (default 5) + the student's own position «شما: رتبهٔ ۱۲ از ۳۰» if opted in. **Never** list the bottom ranks, never show who is last |
| Identity | Pseudonym or initials only («ع. ر.» or a chosen nickname); real name never shown. Opted-out students are counted nowhere visible |
| Minimum | Hidden until ≥ `[8]` students in the cohort have opted in (otherwise it is identifiable) |
| Ties | Share the rank |
| Grades/assignments | Scores and grades are never part of it |

### 3.6 Celebration moments

Short, once per event, dismissible, respects "reduce motion", no sound by default.

| Moment | Treatment |
| --- | --- |
| Lesson complete | Ring fills, +۱۰ small toast |
| Level up | Subtle card with new name |
| Badge earned | Gold-edged card, one line |
| Weekly goal met | Ring closes, brief line |
| Course 100% | Full-width moment: «همهٔ درس‌ها را پشت سر گذاشتید.» |
| Certificate issued | The finale (below) |

Must work offline-tolerant on slow mobile: celebration is local UI, XP is confirmed by the server and corrected silently if different.

### 3.7 Certificate as "final boss"

- From the first lesson, `/panel` shows a **path to the certificate**: lessons → required assignments → quizzes → defense (if `requiresDefense`) → certificate. Each step shows done/remaining, using `certificateEligibility` (reasons `progress` / `defense` already exist).
- The certificate preview is visible but sealed until eligible; it states exactly what is missing («یک تکلیف و دفاع نهایی باقی مانده»).
- When issued: finale screen with the certificate, `/verify` code and QR (Phase 2 E), badge فارغ‌التحصیل, level پیشگام, and a "share / download PDF" action. Email + SMS follow Phase 2 F.
- Gamification must never bypass certificate rules: XP/levels do not unlock a certificate.
- `[DBA: do not show any "Ministry of Science approved" wording in the finale or badges until verified.]`

## 4. Staff mechanics (Core, Tenant config)

Principle: staff work toward **outcomes** (leads moved, payments checked), not activity.

### 4.1 Advisor daily goals and follow-up streak

| Item | Rule |
| --- | --- |
| Daily goal | Close the day's due follow-ups: «۵ از ۸ پیگیری انجام شد». Due follow-ups = leads with a follow-up date on/before today `[needs a follow-up date on leads: today only activities (call/note/sms) exist]` |
| What counts as "done" | A follow-up with a **recorded outcome** (reached / not reached + reason / next date set / status changed). A bare "call" entry does not count |
| Follow-up streak | Consecutive **working days** with all due follow-ups handled. Working days per tenant `[Iran weekend: Thu/Fri? confirm]`; holidays, leave and zero-due days are neutral |
| Freeze | 1 per month, auto-used on sick/leave day or admin-marked leave |
| Wins | Small celebration when a lead moves forward (registered / paid / enrolled), credited to the advisor who owns the lead |
| Visibility | The advisor sees their own goals and streak. Admin sees aggregates, not a rank list |

### 4.2 Team progress (no individual leaderboard)

- One shared **team goal** per week (default metric: follow-ups completed on time; alternative: leads moved to next stage) with a single progress ring and a milestone line.
- Admin view: per-advisor workload and stuck leads for **coaching**, labelled that way, not sorted by "best".
- Staff see only their own numbers plus the team total.
- `[Is a team reward needed (lunch etc.)? Client decides; the product only shows the goal]`

### 4.3 Finance "inbox zero"

| Item | Rule |
| --- | --- |
| Inbox | Pending payments to verify and instalments due/overdue, from `orders.payments` (status started/verified/failed) and `orders.instalments` (pending/paid) |
| Counter | «۳ مورد در انتظار بررسی»; at zero a calm full-state: «همه‌چیز بررسی شده است ✓» (no emoji in product; use the icon system) |
| Streak | "Zero-inbox days" in a row; weekends/holidays neutral |
| Honesty | Counter reflects real state; reconciling cannot be faked (see anti-abuse) |
| Privacy | Amounts only to finance and admin roles; others never see payment details |

## 5. Anti-abuse and fairness

| Rule | Detail |
| --- | --- |
| One award per source | Each XP source (lesson, quiz, assignment, class) has a unique key per enrollment; repeated/double-fired events and offline retries are idempotent |
| Video | XP only on valid completion from Phase 2 B3, once per lesson. Scrubbing to end, background tab with paused player, or multiple concurrent sessions do not count `[detect via playback checks; thresholds with tech-lead]` |
| Quiz | First pass pays; retakes pay 0 except fail→pass once; per-attempt cooldown `[set by E-026 quiz rules]` |
| Assignment | XP on submission (non-empty), grade bonus only from an instructor's grade; instructors cannot grade their own enrollment |
| Skipping | No XP for marking complete manually, jumping lessons, or opening content |
| Rate limits | Daily XP cap (150); max `[N]` XP events/minute per user; excess logged, not rewarded |
| Drip | Cannot earn on content not yet released to the cohort |
| Staff | Outcome required for every counted follow-up; same lead + same outcome on the same day counts once; follow-ups on leads created by the same user within `[N]` min are not counted; admin can flag/exclude an entry with a reason (audited) |
| Finance | Inbox zero counts only real status changes with a verifier; cannot self-verify own-created payments `[policy?]` |
| Audit | Every award, reversal and admin adjustment is recorded with actor and reason; admin can reverse, not edit silently |
| Tenant isolation | All gamification data tenant-scoped; no cross-tenant visibility, totals or badges |
| Account sharing | Existing concurrent-IP signals (B6) may invalidate XP; no auto-ban |

## 6. Data (describe only; tech-lead designs schema)

| Concept | Kind | Notes |
| --- | --- | --- |
| Gamification settings | Per-tenant config | Master + mechanic toggles, goals, N, names, freeze rules |
| XP/event ledger | **Append-only**, tenant-scoped | actor (student/staff), enrollment or lead/payment ref, source type + source id (unique key), points, reason, awardedAt (UTC), reversedBy. Source of truth |
| Derived totals | Recomputable cache | XP total, level, streak weeks, freezes, longest streak, weekly goal state. Rebuilt from ledger; may be materialised per user/enrollment |
| Badge awards | One row per award | badge key, scope, awardedAt; catalogue is code/config, with tenant overrides |
| Preferences | Per user | leaderboard opt-in, nickname/initials, celebrations on/off |
| Staff daily snapshots | Per user/day | due, done, outcome count, zero-inbox flag (derived or stored for streaks) |
| Inputs it reads | Existing | `enrollments` (completedLessons, defensePassed, status), `leads` (status, activities), `orders` (payments, instalments), `certificates` |
| Rules logic | `packages/core` with Vitest | XP calc, caps, streak/freeze, level thresholds, badge triggers: pure functions, no UI |

## 7. Privacy

| Data | Who sees |
| --- | --- |
| Own XP, level, streak, badges | The student; academy admin and instructor of that cohort (aggregates), not other students |
| Leaderboard entry | Cohort peers, pseudonym only, only if the student opted in |
| Staff goals/streaks | The staff member; admin sees aggregates and coaching view |
| Finance inbox detail | Finance + admin |
| Exports / deletion | A student's gamification data is included in their data export and deleted/anonymised with the account (tech-lead to align with account deletion) |

Defaults: leaderboard opt-in **off**; badge sharing **off**; no gamification data in analytics tools (none allowed anyway); no comparison messages to anyone.

## 8. Stories and acceptance criteria

Tags: **Core** = every academy · **Config** = tenant setting · **IBA** = IBA-only (quote separately). Priority: P1 ships first.

| ID | Story | Tag | Pri | Why |
| --- | --- | --- | --- | --- |
| G1 | Tenant admin turns gamification on/off and toggles mechanics | Config | P1 | Everything depends on it |
| G2 | Student earns XP and sees level and rings | Core | P1 | The visible pulse |
| G3 | Weekly rhythm streak with freezes, drip-aware | Core | P1 | Retention without punishment |
| G4 | Badges and milestones | Core | P1 | Small wins |
| G5 | Certificate path ("final boss") and finale | Core | P1 | Ties to the revenue outcome |
| G6 | Celebrations | Core | P2 | Polish, needs G2 |
| G7 | Cohort leaderboard, opt-in | Config | P2 | Nice, privacy-sensitive |
| G8 | Advisor daily goal + follow-up streak | Core | P2 | Needs follow-up dates on leads |
| G9 | Team goal view | Core | P2 | After G8 |
| G10 | Finance inbox zero | Core | P2 | Cheap; data exists |
| G11 | Tenant-custom badges/XP values by academy admin | Config | P3 | Super-admin edits are enough first |

### Acceptance criteria

**G1 · Switches**
- G1.1 **G** gamification master is off **W** a student opens `/panel` **T** progress % and "continue" show; no XP, level, streak, badge or leaderboard appears and no empty space/"locked" stubs.
- G1.2 **G** master on, streaks off **W** student loads `/panel` **T** XP/levels/badges show; streak UI absent; streak weeks are not computed.
- G1.3 **G** master turned off then on **W** the student returns **T** previous XP, badges and streak history are intact.
- G1.4 **G** user of tenant `demo` **W** requests any `iba` gamification data by URL/id **T** 404, no existence leak.
- G1.5 **G** tenant colours changed **W** panels reload **T** rings/cards use the new `primaryColor`/`accentColor`; milestone gold stays legible in light and dark themes.
- G1.6 **G** an academy admin without super-admin role **W** tries to edit XP values (P1) **T** denied.

**G2 · XP, levels, rings**
- G2.1 **G** student completes a lesson for the first time **W** completion is saved **T** +10 XP appears once; the ring and `courseProgress` % increase.
- G2.2 **G** the same completion event fires twice (double-tap, offline retry) **W** processed **T** exactly one XP award.
- G2.3 **G** lesson already completed **W** student rewatches **T** 0 XP, no toast.
- G2.4 **G** student has earned 150 XP today **W** completes another lesson **T** lesson is completed (progress counts) with 0 XP and a neutral note «سقف امتیاز امروز تکمیل شد».
- G2.5 **G** student fails a quiz then passes on retake **W** result recorded **T** one flat 10 XP; a further retake gives 0.
- G2.6 **G** a grade is overturned or enrollment cancelled/refunded **W** change saved **T** a reversing ledger entry appears; level recalculated; level never drops below a level already celebrated `[or may drop? decide]`.
- G2.7 **G** student opens `/panel` on 360 px, slow 3G **W** page loads **T** rings render from cached/server values within 3 s; no layout shift.
- G2.8 **G** XP is 1234 **W** shown **T** Persian digits «۱٬۲۳۴» in UI, Latin in any stored/exported value.
- G2.9 **G** student with two enrollments **W** switches **T** rings/XP shown for the selected enrollment; total level at the academy is separate and clear.
- G2.10 **G** content not yet released by drip **W** any attempt to complete it **T** rejected, no XP.

**G3 · Streak**
- G3.1 **G** goal is 2 learning days **W** student learns on any 2 days in the Jalali week **T** week counted; streak +1; weekly bonus 25 XP once.
- G3.2 **G** goal missed and one freeze banked **W** week ends **T** freeze consumed, streak unchanged, student notified calmly on next visit.
- G3.3 **G** goal missed, no freeze **W** week ends **T** streak resets to 0, longest streak kept, no red/loss message.
- G3.4 **G** no released-and-unfinished content in the week **W** week ends **T** week is neutral; streak neither grows nor breaks.
- G3.5 **G** only 1 item released that week and goal is 2 **W** student completes it **T** goal met (scaled to 1).
- G3.6 **G** cohort break (e.g. Nowruz) configured **W** week passes **T** neutral.
- G3.7 **G** activity at 23:59 and 00:01 Tehran time **W** counted **T** assigned to the correct Jalali day and week; stored UTC.
- G3.8 **G** freezes earned **W** banked count would exceed 2 **T** capped at 2.
- G3.9 **G** streaks are off **W** a week ends **T** nothing is recorded or shown.

**G4 · Badges**
- G4.1 **G** first lesson completed **W** saved **T** «قدم اول» is awarded once with Jalali date.
- G4.2 **G** badge trigger met twice **W** processed **T** one award, no duplicate.
- G4.3 **G** badge condition later invalidated (grade reversal) **W** change saved **T** badge is revoked with an audit entry `[or kept? decide]`.
- G4.4 **G** 100% progress reached **W** required assignment is still ungraded **T** «خط پایان» is not awarded (matches C6/`certificateEligibility`).
- G4.5 **G** tenant renamed a badge with half-space «حرفه‌ای» **W** shown **T** half-space preserved, no broken join.
- G4.6 **G** student profile **W** viewed by another student **T** no badges or XP visible.

**G5 · Certificate path**
- G5.1 **G** progress 100% and `requiresDefense` with defense not passed **W** student opens the path **T** all steps done except defense; certificate sealed with reason text matching `defense`.
- G5.2 **G** progress under 100% **W** viewed **T** remaining steps listed; reason matches `progress`.
- G5.3 **G** XP high enough for level 6 but certificate not issued **W** viewed **T** certificate stays sealed (XP never unlocks it).
- G5.4 **G** certificate issued **W** student opens `/panel` **T** finale shows certificate, `/verify` code, QR, PDF download and فارغ‌التحصیل badge once; reopening shows a quiet version.
- G5.5 **G** course is a DBA **W** finale/badges render **T** no "Ministry of Science" wording unless flagged verified.
- G5.6 **G** workshop/video course without defense **W** path displays **T** defense step absent.

**G6 · Celebrations**
- G6.1 **G** OS "reduce motion" is on **W** an event fires **T** static confirmation, no animation.
- G6.2 **G** celebration shown **W** student dismisses or navigates **T** it is not repeated on reload.
- G6.3 **G** server rejects an optimistic award **W** corrected **T** UI updates silently, no error popup.
- G6.4 **G** celebrations toggle off **W** events fire **T** XP still recorded, no animation.
- G6.5 **G** celebration assets **W** loaded **T** self-hosted, no external requests.

**G7 · Leaderboard**
- G7.1 **G** leaderboard enabled, student has not opted in **W** viewing **T** they see an invitation, not rankings, and are not listed anywhere.
- G7.2 **G** fewer than `[8]` opted in **W** viewing **T** leaderboard hidden with a neutral message.
- G7.3 **G** student opted in, rank 12 of 30 **W** viewing **T** sees top 5 + «شما: رتبهٔ ۱۲»; no ranks 13–30 or last place visible.
- G7.4 **G** student opts out **W** saved **T** disappears from others' view on next load; own XP unaffected.
- G7.5 **G** two students tie **W** shown **T** same rank, both listed in top N.
- G7.6 **G** viewed via API **W** payload inspected **T** contains no real names, emails, phones or ids of other students.
- G7.7 **G** student in cohort A **W** requests cohort B's board **T** 404.
- G7.8 **G** academy admin views **T** only anonymised aggregates; no way to see who opted out.

**G8 · Advisor goals**
- G8.1 **G** 8 follow-ups due today **W** advisor records outcomes on 5 **T** goal shows «۵ از ۸».
- G8.2 **G** advisor adds a "call" activity without an outcome **W** saved **T** not counted.
- G8.3 **G** same lead, same outcome, same day logged twice **W** processed **T** counted once.
- G8.4 **G** zero follow-ups due, or approved leave **W** day ends **T** neutral; streak keeps.
- G8.5 **G** advisor tries to complete another advisor's lead **W** attempt **T** denied; no credit.
- G8.6 **G** admin flags an entry as fake **W** saved with a reason **T** reversed, audited, advisor notified neutrally.
- G8.7 **G** a lead is moved to "paid"/enrolled **W** saved **T** small win moment for the owning advisor.

**G9 · Team goal**
- G9.1 **G** team goal 40, done 26 **W** advisor opens the dashboard **T** one ring «۲۶ از ۴۰» and no per-person ranking.
- G9.2 **G** admin coaching view **W** opened **T** sorted by name/neutral order with workload and stuck leads; no "top/bottom" labels.
- G9.3 **G** team goal reached **W** reached **T** milestone message once.
- G9.4 **G** a staff user of tenant `demo` **W** opens `iba`'s team data **T** 404.

**G10 · Finance inbox**
- G10.1 **G** 3 pending payments **W** finance opens inbox **T** counter «۳ مورد در انتظار بررسی», linking to items.
- G10.2 **G** last item verified or rejected **W** list refreshes **T** counter zero and calm message; zero-day streak increments at day end.
- G10.3 **G** a payment `failed` **W** counted **T** appears as "needs attention", not silently closed.
- G10.4 **G** non-finance role **W** opens inbox **T** denied (default deny).
- G10.5 **G** the verifier is the creator of the payment **W** verify attempted **T** blocked `[policy?]`.
- G10.6 **G** amounts displayed **T** integer rials via `formatToman()`; Persian digits in UI.

## 9. Metrics that show it worked

| Metric | Target |
| --- | --- |
| Weekly active students per cohort (≥1 learning day) | `[baseline from first IBA cohort]` then + `[X]` pts |
| Lesson/week completion rate vs. pre-gamification cohort | `[X]`% up |
| Students completing the course and defense | up vs. baseline |
| Leaderboard opt-in rate (signal of comfort) | `[track]`; low rate is fine, complaints are the red flag |
| Student complaints about pressure/unfairness | 0 |
| Advisor follow-ups with recorded outcome | up; fake-log flags near 0 |
| Pending payments older than `[2]` days | down |
| Farjad's gut check: "panel no longer بی‌روح" | Yes after review of UX mock-ups |

## 10. Open questions (client / Farjad)

| # | Question (plain language) |
| --- | --- |
| 1 | Should gamification be on by default for new academies, or off until they ask? |
| 2 | For IBA's executives, is a points-and-badges feel acceptable, or only progress rings and milestones? Show Farjad the mock-ups first. |
| 3 | Which day does your week start? (Saturday?) And which are your working days and holidays for staff? |
| 4 | Should students see a leaderboard at all? If yes, minimum people needed before it appears (suggest 8)? |
| 5 | Do you want students to be able to share a badge/certificate image publicly? |
| 6 | Do advisors record a "next follow-up date" on leads today? We need this for daily goals. |
| 7 | Is it fine that the team goal is shared and nobody is ranked? Any reward for the team? |
| 8 | Should a refunded or cancelled student lose XP and badges? |
| 9 | Who may change XP values and badge names: only Edvora, or the academy admin too? |
| 10 | Do you have drip/holiday breaks planned in a cohort (e.g. Nowruz), so streaks pause? (needs E-026) |
| 11 | Are live classes tracked for attendance? If not, attendance XP/badge is skipped. |
| 12 | Can the person who creates a payment also verify it, or must it be another person? |
| 13 | Level names: are آغازگر … پیشگام fine, or do you prefer your own terms? |

## Handoff

- **Task:** E-027 gamification PRD
- **Output:** `docs/product/gamification.md`
- **Decisions made:** weekly-rhythm streaks with freezes and drip-neutral weeks; XP for outcomes with caps, never time; leaderboard opt-in/off by default/top-N + own rank/pseudonyms/min size; staff team goal, no individual ranking; outcome-required follow-ups; finance inbox zero; append-only ledger with derived totals; off-state keeps progress only; XP never unlocks a certificate
- **Open issues:** section 10 and all `[brackets]`; dependency on E-026 (quizzes, drip) and on a follow-up date field for leads; XP numbers need tuning after one cohort
- **Next owner:** `ux-architect` (screens: student panel rings/path/finale, staff goals, team view, finance inbox) then `tech-lead` (schema, `packages/core` rules + tests); `qa` for section 8 criteria
