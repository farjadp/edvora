# Phase 2 — Keep students

**Task:** E-013 · **Source:** Notion 05 (Phase 2 list), `README.md`, `apps/web/src/collections/` · **Not read:** Notion 01/02/04 (unknowns stay in `[brackets]`)

Goal of the phase: a paying student sees what to do this week, watches protected lessons, submits work, joins live classes, passes the defense and gets a verifiable certificate, and is nudged by email/Telegram/Bale along the way (SMS already exists).

## Summary

| # | Module | Tag | Priority | Why |
| --- | --- | --- | --- | --- |
| A | Student panel (week view) | Core | **P2-1** | Everything else hangs off it; cheapest retention win |
| B | Protected video + watermark | Core (watermark text = tenant config) | **P2-1** | Video is the product for video courses; leaks = lost revenue |
| C | Assignments + grading | Core | **P2-2** | Needed for the defense and for completion rules |
| D | Live classes + auto-recordings | Core (provider adapter); schedule rules IBA | **P2-1** | MBA/DBA cohorts run on live sessions |
| E | Certificate issuing + PDF/QR | Core | **P2-2** | `/verify` + codes already exist; the issuing flow is missing |
| F | Email + Telegram/Bale notifications | Core (channels = tenant config) | **P2-3** | Reduces no-shows; SMS already covers the critical ones |

Cross-cutting rules for every story below (QA checks these on each one):

| Rule | Acceptance |
| --- | --- |
| Tenant isolation | Given a user/record of tenant `iba`, when requested from the `demo` host (or by id), then 404/empty; never a leak of existence |
| Persian digits | Given input with ۰-۹ or ٠-٩, when saved or searched, then normalised with `toLatinDigits`; UI shows Persian digits |
| Dates | Stored UTC, shown Jalali (`formatJalali`), time zone `Asia/Tehran` for class times |
| Roles | Default deny; student sees only own enrollments, submissions, grades |
| Mobile | Every student screen works at 360px on a slow connection (no blocking spinner > 3 s without feedback) |

---

## A · Student panel (week view)

**Goal:** one page answering "what do I do this week?": next live class, deadlines, defense date, progress.
**Non-goals:** social feed, chat, gamification, instructor view (Phase 3), billing page rewrite.

| ID | Story | Acceptance (Given / When / Then) |
| --- | --- | --- |
| A1 | As a student, I want a week view of live classes, assignment deadlines and my defense date, so I know what is due. | **G** I have an active enrollment with a cohort **W** I open `/panel` **T** I see this Jalali week (Saturday start `[confirm]`) with live sessions, deadlines and defense, sorted by time, with "join" enabled from `[10]` min before a session |
| A1f | (failure) | **G** my enrollment is `cancelled`/unpaid instalment overdue `[policy?]` **W** I open `/panel` **T** I see a clear state, not a blank page, and no access to lessons/links |
| A2 | As a student with several enrollments, I want to switch between them. | **G** two active enrollments **W** I pick one **T** the week view shows only that cohort's items; selection persists across reloads |
| A3 | As a student, I want my progress per course (completed lessons, assignments, defense). | **G** 12 of 30 lessons completed **W** I open the panel **T** I see ۴۰٪ (Persian digits) matching `core` progress rule; counts equal the data |
| A4 | As a student of a video-only course (no cohort), I want a simple "continue where you left off". | **G** no cohort **W** I open `/panel` **T** no week grid; a "continue lesson N" card and progress |
| A5 | Tenant isolation | **G** I'm logged in on `demo` **W** I open `/panel?enrollment=<iba id>` **T** 404 |

**Data:** reads `enrollments` (status, cohort, `completedLessons`, `defensePassed`), `cohorts` (`startDate`, `schedule` is free text — **not enough** for a week grid → live sessions in D). Add on `enrollments`: `lastLessonAt` (resume), nothing else. No new collection for A.
**Client questions:** Which day does your week start? Do students with an overdue instalment keep access, lose it, or lose only new lessons? Should students see other students' names/progress? (default: no)

---

## B · Lesson player — protected video + student watermark

**Goal:** enrolled students stream via ArvanCloud VOD with an on-screen watermark (name + last 4 digits of phone); raw video URLs never reach the browser unauthorised.
**Non-goals:** DRM-grade protection (cannot stop screen recording; watermark deters and traces), downloads, live transcoding, subtitles, in-player quizzes.

| ID | Story | Acceptance |
| --- | --- | --- |
| B1 | As a student, I want to watch lessons of courses I paid for. | **G** active enrollment **W** I open a lesson **T** the player gets a short-lived signed URL (expires ≤ `[10]` min, refreshed while playing); no permanent URL in HTML/API |
| B1f | (failure) | **G** not enrolled / cancelled / another tenant's lesson **W** I request the lesson or the signed URL endpoint **T** 403/404, no URL issued; free-preview lessons (`isFreePreview`) play without login, **without** watermark identity |
| B2 | As the academy, I want the student's identity overlaid on the video. | **G** student "علی رضایی" ۰۹۱۲…۳۴۵۶ **W** playing **T** overlay shows name + last 4 digits, moves position every `[N]` s, cannot be removed by CSS toggle in DevTools without removing the player's own container (re-injected if deleted) |
| B3 | As a student, I want my position remembered and lessons marked complete. | **G** I watched ≥ `[90]`% **W** the video ends **T** lesson is added to `completedLessons` once (idempotent on double-fire/offline retry) |
| B4 | As a student on a weak mobile network, I want adaptive quality. | **G** throttled to slow 3G **W** playing **T** HLS drops to a lower rendition instead of stalling; "retry" shown on error, no blank player |
| B5 | As an admin, I want to attach an ArvanCloud video to a lesson. | **G** I paste a video ID/URL **W** I save **T** value validated (format), stored, never shown on public pages; wrong ID shows a clear error on first play, not a 500 |
| B6 | As the academy, I want to see abuse. | **G** one account plays from ≥ `[3]` IPs concurrently **W** detected **T** logged for admin review; auto-block is **not** in scope until client decides |

**Data:** `lessons.videoUrl` exists (HLS). Change to an Arvan **video ID** + provider field (adapter `packages/integrations/video/` with mock and real, tested). New `playbackLogs` is optional/P3 (store only abuse signals, not every heartbeat). Add `enrollments.lessonProgress` (json: lessonId → seconds) or a `lessonProgress` collection (tenant-scoped) — tech-lead decides. Lessons are per **course**, not per cohort: drip-release by cohort week needs `lessons.releaseWeek` `[IBA wants drip?]`.
**Client questions:** What exactly should the watermark show (name, phone, student number)? Is screen-recording deterrence enough or do you need "one device at a time"? Are videos already on ArvanCloud? Can a student keep access to recordings after the cohort ends, and for how long?

---

## C · Assignments + grading

**Goal:** instructors set assignments with deadlines; students submit files/text; instructors grade with feedback; grades feed completion and the defense.
**Non-goals:** plagiarism detection, peer review, rubric builder with weights (single score + comment for now), auto-graded quizzes.

| ID | Story | Acceptance |
| --- | --- | --- |
| C1 | As an instructor, I want to create an assignment for a cohort with deadline, max score, optional attachment. | **G** I'm instructor of the tenant **W** I save with deadline in the past or max score ≤ 0 **T** validation error; valid save appears in students' week view |
| C2 | As a student, I want to submit text and/or files before the deadline. | **G** before deadline **W** I upload a PDF/DOCX ≤ `[20]` MB **T** saved, confirmation shown, I can replace until the deadline |
| C2f | (failures) | **G** file too large / disallowed type / upload drops mid-way **W** submitting **T** clear Persian error, previous submission untouched; **G** after deadline **W** submit **T** blocked, or marked "late" if the assignment allows late `[client]` |
| C3 | As an instructor, I want a queue of ungraded submissions. | **G** 30 submissions **W** I open grading **T** list filtered by assignment/status, oldest first; downloading a file is allowed only for the instructor's tenant |
| C4 | As an instructor, I want to grade with a score and comment. | **G** max 20 **W** I enter ۱۸٫۵ or 18.5 or 18,5 **T** stored as 18.5 (digits and decimal separator normalised); > max rejected |
| C5 | As a student, I want to see my grade and feedback. | **G** graded **W** I open the assignment **T** I see score + comment, and a notification (F) was queued; I never see others' work |
| C6 | As the academy, I want required assignments to block completion. | **G** a required assignment is ungraded or below pass mark `[?]` **W** progress is computed **T** course stays "not complete" and certificate (E) is blocked |
| C7 | Defense scoring (course `requiresDefense`) | **G** all requirements met **W** panel records defense score/date/evaluators **T** `enrollments.defensePassed` is set from the result, not hand-ticked; failed defense allows a re-defense date `[policy?]` |

**Data:** new tenant-scoped collections (add to `multiTenantPlugin.collections`): `assignments` (course, cohort?, title, description, dueAt, maxScore, passScore, required, allowLate, attachments→media), `submissions` (assignment, user, text, files, submittedAt, late, score, feedback, gradedBy, gradedAt, status). Access: student reads/creates own; instructor/admin read all of the tenant; **no delete**. New `defenseResults` (enrollment, date, score, passed, notes, panel) or fields on `enrollments`. `media` currently allows only images/PDF and is public-read → **submissions need a private upload collection** (`submissionFiles`, non-public, ADR needed). Pass logic goes in `packages/core` with Vitest.
**Client questions:** Is the grade a number out of 20 or pass/fail? Pass mark? Are late submissions accepted (with a penalty)? Who sits on the defense panel and is the score averaged? How many retries? Do workshops/video courses have assignments at all?

---

## D · Live classes + automatic recordings (provider-agnostic)

**Goal:** schedule a class once; students join with one click; the recording appears in the lesson list automatically.
**Non-goals:** building our own video conferencing, in-class polls/whiteboard, attendance by face, choosing the provider (Skyroom vs BigBlueButton is open — stories below depend only on the adapter contract).

**Adapter contract** (`packages/integrations/live/`, mock + real per provider): `createRoom(session)`, `getJoinUrl(room, user, role)` (signed, per-user, short-lived), `getRecordings(room)` / recording-ready webhook, `endRoom`. A mock must exist so CI and demo work offline.

| ID | Story | Acceptance |
| --- | --- | --- |
| D1 | As an admin/instructor, I want to schedule a session for a cohort. | **G** cohort + instructor **W** I set start, duration, title **T** session appears in students' week view in Tehran time; overlapping sessions for the same instructor warn |
| D2 | As a student, I want to join with one click. | **G** my enrollment is active **W** within `[10]` min before until end **T** I'm redirected to a per-user signed join URL with my name; before the window the button explains when it opens |
| D2f | (failures) | **G** not enrolled / other tenant / provider API down **W** join **T** 403/404 respectively; provider down shows "try again / backup link" and logs, never a stack trace |
| D3 | As an instructor, I want to join as moderator. | **G** I'm the session's instructor **W** join **T** moderator role; a student link never grants moderator |
| D4 | As a student, I want the recording as soon as it is ready. | **G** class ended and provider finishes processing **W** webhook/poll receives it **T** a recording lesson is attached to the cohort (idempotent on repeated webhooks) and visible only to that cohort, played through B (watermarked) |
| D4f | (failure) | **G** no recording produced / webhook never arrives **W** `[30]` min after end **T** admin sees "recording missing" with a manual attach option |
| D5 | As an instructor, I want attendance. | **G** provider reports join times **W** class ends **T** attendance stored per student; manual correction possible |
| D6 | As the academy, I want to cancel/reschedule. | **G** a session in 2 days **W** I reschedule **T** students are notified (F) and the old join link stops working |

**Data:** Tenants `features` already has `live` — gate on it. New `liveSessions` (tenant via plugin, cohort, title, startsAt UTC, durationMin, instructor→users, provider, providerRoomId, status, recording→lessons, joinWindowMin) and `attendance` (session, user, joinedAt, leftAt). `cohorts.schedule` stays human text. Provider credentials are per-tenant config (like `zarinpalMerchantId`), stored encrypted/env, never in public reads.
**Client questions:** Which do you prefer or already own: Skyroom or BigBlueButton? Do you host on your own servers or buy a plan? Typical class size and length? Must recordings be downloadable by students? Recording retention period? Is attendance counted toward the certificate?

---

## E · Certificate issuing flow (+ PDF with QR)

**Goal:** when progress = 100% **and** (defense passed if `requiresDefense`), a certificate is issued once, with PDF and QR to `/verify/<code>`.
**Non-goals:** third-party credential networks, LinkedIn push, bulk legacy imports (separate task), changing the code format (`BA-MBA-182` stays).

| ID | Story | Acceptance |
| --- | --- | --- |
| E1 | As the system, I issue a certificate automatically when eligible. | **G** progress 100%, required assignments passed, defense passed (if required) **W** the last requirement is met **T** exactly one certificate with next serial exists; re-running the job creates no duplicate (idempotent per enrollment) |
| E1f | (not eligible) | **G** progress 99%, or defense required but not passed, or enrollment cancelled **W** issue is attempted **T** none issued; reason recorded for admin ("missing: defense") |
| E2 | As an admin, I want to review/approve before release `[tenant config: auto vs manual]`. | **G** manual mode on **W** student becomes eligible **T** it waits in an admin queue; approve issues it |
| E3 | As a student, I want to download my PDF. | **G** issued **W** I open `/panel/certificates` **T** PDF with name (Persian, correct RTL and half-spaces), course, date in Jalali, code, QR; only I (and staff of my tenant) can download |
| E4 | As a third party, I want to scan the QR. | **G** a valid code **W** I scan **T** `/verify/<code>` shows holder, course, date, status `valid`; **G** revoked **T** shows "باطل شده"; **G** unknown/other-tenant code **T** "not found", no hints; Persian-digit code input is normalised |
| E5 | As an admin, I want to revoke or reissue (name typo). | **G** issued **W** I revoke **T** status `revoked`, `/verify` reflects within a minute; reissue keeps the code or issues a linked new one `[decide]`; no deletion (access already `delete: false`) |
| E6 | Holder name | **G** student's profile name is missing/Latin **W** issuing **T** requires a confirmed Persian (and optional Latin) name before PDF generation |

**Data:** `certificates` exists (code, holderName, user, course, cohort, finalProject, issuedAt, status, pdf→media). Add `enrollment` relation (unique, enables idempotency), `issuedBy`/`mode`, `revokedAt/reason`, and `holderNameLatin`. `pdf` points to `media`, which is **public-read** → certificates need a private file store or an authenticated download route. `requiresDefense` on `courses` and `defensePassed` on `enrollments` already exist. Certificate `create` is admin-only today: issuing runs in server code with `overrideAccess: true` after checking eligibility and tenant (per AGENTS.md). PDF generation must run in-country with a self-hosted Persian font (Vazirmatn); no external renderers.
**Client questions:** Automatic or approved by the director first? Who signs/what logo and seal appear on the PDF, and is the signature image available? Do workshops and video courses also get certificates (code prefixes)? Is the DBA wording allowed — **do not print "Ministry of Science" until verified**. Latin name on the certificate too?

---

## F · Notifications — email + optional Telegram/Bale

**Goal:** the same event can reach students by SMS (exists), email, and optionally Telegram or Bale, with per-student choice and per-tenant switches.
**Non-goals:** marketing campaigns/newsletters, WhatsApp, push notifications, in-app inbox (later), chat bots answering questions.

| ID | Story | Acceptance |
| --- | --- | --- |
| F1 | As a student, I want reminders for classes and deadlines. | **G** a class in `[1]` h / assignment due in `[24]` h **W** the scheduler runs **T** one message per channel I enabled; none if I opted out; no duplicates after a worker restart |
| F2 | As a student, I want to choose channels. | **G** profile settings **W** I enable email, add an address **T** it must be verified by a link before use; Telegram/Bale connect by a one-time code sent to the bot (`/start <code>`), expiring in `[10]` min |
| F2f | (failures) | **G** invalid email / expired or reused code / bot blocked by the user **W** sending or linking **T** clear error; blocked user is marked unreachable and falls back to SMS; failure is **logged, never thrown into the main flow** |
| F3 | As an admin, I want to enable channels per academy. | **G** tenant has Bale only **W** a notification fires **T** only enabled channels are used; secrets per tenant |
| F4 | As the academy, I want templates for each event. | **G** event "grade published" **W** rendered **T** Persian text, half-spaces, Persian digits, Jalali dates; missing variable falls back to safe text, not "undefined" |
| F5 | As a student, I want no spam. | **G** many events in a minute **W** sending **T** rate-limited/batched to `[N]`; critical (login OTP) always SMS |
| F6 | Tenant isolation | **G** two tenants **W** a job runs **T** each uses its own bot token/sender and only its own users |

**Events (initial):** class reminder, class rescheduled/cancelled, new recording, assignment published, deadline due, grade published, defense scheduled, certificate issued, instalment due (E-016 already plans SMS jobs).
**Data:** new `notificationPreferences` (user, channels: sms/email/telegram/bale with address/chat id + verifiedAt, per-event opt-out) and `notificationLog` (tenant, user, event, channel, status, providerId, error, dedupeKey — the unique `dedupeKey` gives idempotency). Adapters `packages/integrations/{email,telegram,bale}/` with mock and tests; Telegram is blocked/filtered in Iran and not reachable without a proxy, so **Bale is the likely working channel**, Telegram stays optional per tenant. Email uses SMTP behind an adapter (Mailpit locally); an in-country provider `[?]`.
**Client questions:** Do your students actually use email, or only SMS/Bale? Which sender name/email address? Is a Bale bot acceptable (we need an account owner for it)? Any messages you never want sent at night? Is Telegram needed at all?

---

## Build order (suggested, for tech-lead)

| Step | Items | Depends on |
| --- | --- | --- |
| 1 | D adapter + mock, `liveSessions`; A week view; F adapters (email, Bale) + `notificationLog` | live provider decision |
| 2 | B video adapter + signed playback + watermark | Arvan account `[client]` |
| 3 | C assignments/submissions + private file store; defense result | ADR for private uploads |
| 4 | E issuing job + PDF + QR | C, defense |

## Metrics that show it worked

| Metric | Target `[agree with IBA]` |
| --- | --- |
| Live-class attendance rate | `[?]` |
| Lesson completion per enrollment | `[?]` |
| Assignments submitted on time | `[?]` |
| Cohort completion → certificate issued | `[?]` |
| Support requests "where is my link / recording" | down vs. before Phase 2 |

## Out of scope for Phase 2 (said no)

| Request | Why not now |
| --- | --- |
| Community / alumni network, job board | Phase 3, no revenue line |
| Instructor panel beyond grading and scheduling | Phase 3 |
| Mobile app | PWA-quality web first |
| Own video conferencing | Provider adapter is cheaper and safer |

## Open questions for Farjad / the client (consolidated)

1. Skyroom or BigBlueButton; self-hosted or paid plan?
2. Arvan VOD already set up; watermark content; recording retention and post-cohort access.
3. Grading scale, pass mark, late policy, defense panel and re-defense policy.
4. Certificate approval: automatic or director-signed; signature/seal assets; workshops get certificates?
5. Overdue instalment: what happens to access?
6. Email provider and sender; Bale bot owner; is Telegram needed?
7. Week start day and drip-release of lessons by cohort week.
8. Legal: DBA "Ministry of Science" claim stays unpublished until verified (Notion 04).
