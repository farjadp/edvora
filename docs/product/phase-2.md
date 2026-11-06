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
| Q | Quizzes (auto-graded) | Core (pass mark, attempts, review = tenant/quiz config) | **P2-2** | Farjad 2026-11-06: biggest LMS gap vs Masteriyo; gives completion a real check without instructor time |
| R | Content drip | Core (rules = course config) | **P2-2** | Cohort programmes need weekly release; stops students skipping ahead |

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
**Non-goals:** plagiarism detection, peer review, rubric builder with weights (single score + comment for now). (Auto-graded quizzes were a non-goal; Farjad reversed this on 2026-11-06 → section Q.)
**Scope of E-026:** C1–C6. **C7 (defense) is out of scope for E-026** and stays as written.

| ID | Story | Acceptance |
| --- | --- | --- |
| C1 | As an instructor, I want to create an assignment for a course (all cohorts) or one cohort, with title, description, deadline, max score, pass score, required yes/no, late allowed yes/no, optional attachment. | **G** I hold `assignments.manage` in scope of that course/cohort **W** I save with deadline in the past, max score ≤ 0, pass score > max, or a cohort that is not of that course **T** field-level Persian error, nothing saved; **G** valid **T** it appears in the week view (A) of the right students only, deadline shown Jalali in Tehran time. **G** a user outside scope, or of another tenant **T** 403/404 |
| C2 | As a student, I want to submit text and/or files before the deadline. | **G** active enrollment, before deadline **W** I upload PDF/DOCX/JPG/PNG (types `[confirm]`) ≤ `[20]` MB each, ≤ `[5]` files **T** saved, confirmation with Jalali time, I can replace/add until the deadline; double-click or retry creates one submission (idempotent per assignment+user) |
| C2f | (failures) | **G** file too large / disallowed type (checked by content, not just extension) / upload drops mid-way / slow 3G **W** submitting **T** clear Persian error, previous submission untouched, text I typed is kept. **G** after deadline, late not allowed **W** submit **T** blocked with the deadline shown. **G** late allowed **T** saved with `late=true` and a visible "late" tag for the grader `[penalty? client]`. **G** not enrolled / cancelled enrollment / other cohort's assignment / other tenant **T** 403/404 |
| C3 | As an instructor, I want a queue of ungraded submissions. | **G** 30 submissions **W** I open grading **T** list filterable by assignment/cohort/status (`submitted`, `graded`, `late`), oldest first, only my scope (`submissions.grade` with course/cohort scope); each row shows student name, time, late tag |
| C3f | (private files) | **G** a submission with files **W** anyone but the owner student or a grader of that tenant (and scope) requests the file, by id or by guessed URL **T** 404, nothing leaks; **G** logged out **T** 401/redirect; **G** grader of tenant `demo` asks for an `iba` file **T** 404. File URLs are never public, never cached (`private, no-store`), served as download with a server-generated name |
| C4 | As an instructor, I want to grade with a score and comment. | **G** max 20 **W** I enter ۱۸٫۵ or 18.5 or 18,5 **T** stored as 18.5 (digits and decimal separator normalised, ≤ `[2]` decimals); **G** > max, < 0, or text **T** rejected, previous grade kept; **G** two graders save at once **T** last write wins and `gradedBy/At` shows who; grading is allowed with no submission (e.g. 0 for a missed deadline) |
| C5 | As a student, I want to see my grade and feedback. | **G** graded **W** I open the assignment **T** I see score, pass/fail, comment; a "grade published" notification (F) is queued (a failed send never blocks grading); **G** not yet graded **T** "waiting for grading", no score; I never see others' work or grades |
| C6 | As the academy, I want required assignments to block completion. | **G** a required assignment has no submission, is ungraded, or score < pass score **W** progress/eligibility is computed **T** course stays "not complete", certificate (E) blocked with reason `assignment`, and the panel lists what is missing; **G** pass score empty **T** "graded" is enough `[client]`; **G** deadline missed and late not allowed **T** stays incomplete until the instructor grades it (see C4) |
| C7 | Defense scoring (course `requiresDefense`) — **out of scope for E-026** | **G** all requirements met **W** panel records defense score/date/evaluators **T** `enrollments.defensePassed` is set from the result, not hand-ticked; failed defense allows a re-defense date `[policy?]` |

**Data:** new tenant-scoped collections (add to `multiTenantPlugin.collections`): `assignments` (course, cohort?, title, description, dueAt UTC, maxScore, passScore?, required, allowLate, attachments→media), `submissions` (assignment, user, enrollment, text, files→`submissionFiles`, submittedAt, late, score, feedback, gradedBy, gradedAt, status; unique assignment+user). Access: student reads/creates/updates own (updates only before deadline and before grading); authoring = `assignments.manage`, grading and reading all = `submissions.grade`, both scope-aware per ADR 006; **no delete**. `media` allows only images/PDF and is public-read → **submission files go to a new private upload collection `submissionFiles`**: storage outside any public/static path, random file names, download only through an authenticated route handler that checks tenant + (owner or `submissions.grade` in scope) on every request, 404 otherwise, MIME/size allow-list on upload. ADR 009 required before build. Pass logic and score parsing live in `packages/core` with Vitest. `defenseResults` stays with C7.
**Client questions:** Is the grade a number out of 20 or pass/fail? Pass mark? Are late submissions accepted (with a penalty)? Which file types and how large? Do workshops/video courses have assignments at all? (Defense panel and retries: asked later with C7.)

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

## Q · Quizzes (auto-graded)

**Added:** 2026-11-06 (Farjad reversed the earlier "no auto-graded quizzes").
**Goal:** instructors build quizzes from a per-course question bank; students take them on a lesson or at course level; the system grades instantly; required quizzes gate lesson completion and the certificate.
**Non-goals:** essay/manual-graded questions (that is an assignment, C), matching/ordering/fill-blank types, random pools per student `[later]`, proctoring/anti-cheat, SCORM/H5P import, quizzes shown to visitors.

**Defaults (configurable per quiz unless noted; each is a client question):**

| Setting | Default | Options |
| --- | --- | --- |
| Pass mark | `[client]` % of total points | 1–100 |
| Attempts | `[client]`; empty = unlimited | number |
| Time limit | none | minutes |
| Counted attempt | **best** | best / last |
| Review after submit | **score + which questions were wrong, correct answers hidden** | nothing / score only / wrong-or-right / full correct answers; "full" can be limited to *after pass* or *after last attempt* |
| Multiple-choice credit | **all-or-nothing** | all-or-nothing / proportional: `max(0, (right picked − wrong picked) / total right) × points` |
| Retake after pass | not allowed | allowed |
| Shuffle questions/options | off | on |

| ID | Story | Acceptance |
| --- | --- | --- |
| Q1 | As an instructor, I want a question bank per course with four types: single choice, multiple choice, true/false, short answer. | **G** I hold `quizzes.manage` in scope **W** I add a question with points > 0 **T** saved in that course's bank; single choice needs ≥ 2 options and exactly 1 correct, multiple ≥ 2 options and ≥ 1 correct, true/false has a correct flag, short answer needs ≥ 1 accepted answer; otherwise Persian field error, nothing saved. Optional explanation text per question. **G** other course/tenant **T** not visible. Archiving a used question hides it from new quizzes but past attempts keep their copy |
| Q2 | As an instructor, I want to build a quiz from bank questions and attach it to a lesson or to the course. | **G** I pick questions, set points (default from bank), pass mark, attempts, optional time limit, review rule, required yes/no **W** I save **T** quiz is attached to exactly one lesson **or** the course (final); **G** 0 questions, pass mark outside 1–100, time limit ≤ 0, or a lesson of another course **T** rejected. **G** I edit a question/quiz after attempts exist **T** past attempts and scores are unchanged (attempt stores a snapshot of questions, options, points, accepted answers); a warning says only new attempts see the change. Unpublished (draft) quizzes are invisible to students |
| Q3 | As a student, I want to start a quiz, answer and submit it. | **G** active enrollment, lesson/quiz unlocked (R), attempts left **W** I open the quiz **T** I see attempt number, question count, time limit, then Start; Start creates an attempt with server-side `startedAt` and `deadlineAt`; answers autosave; Submit grades instantly and shows the result per review rule. **G** I reload or lose connection **T** the in-progress attempt resumes with saved answers and the *server* clock still counts; only one in-progress attempt per quiz; double-submit/retry returns the same result (idempotent). Works at 360px; a dropped connection shows "saved locally, retrying", never a blank page |
| Q4 | Grading rules (system) | **Single choice / true-false:** full points if the chosen option is correct, else 0. **Multiple choice:** per default all-or-nothing; if the quiz is set to proportional, formula above, never below 0. **Short answer:** the answer and each accepted answer are normalised the same way — `toLatinDigits` (۱۲۳ and ١٢٣ → 123), Arabic ي/ك → Persian ی/ک, remove tatweel and Arabic diacritics, ZWNJ (نیم‌فاصله) treated as a space, collapse and trim whitespace, Latin letters case-insensitive — then compared **exactly** against the accepted list (no fuzzy/typo matching). Unanswered = 0. No negative marking. Total = sum of points; `passed = score ≥ passMark% × total`. All of this is one pure function in `packages/core` with Vitest, covering Persian/Arabic digits and ي/ک cases. `[client: accept near-misses? negative marking?]` |
| Q5 | Time limit (system) | **G** time limit 20 min **W** `deadlineAt` passes **T** the attempt is auto-submitted with the last saved answers (graded like any submission), counts as a used attempt, and the student sees "time is up". **G** the student submits after `deadlineAt` + grace `[configurable default: a few seconds, client to confirm]` **T** answers received after the grace are ignored; the attempt is graded from what was saved. **G** nobody is online at the deadline **T** the attempt is closed when next read or by a periodic job; result identical. Timer shown on screen is advisory; only the server decides |
| Q6 | Attempts and counted result | **G** attempts = 3 **W** the 4th start is requested **T** blocked with "no attempts left", no attempt created (also if two tabs race). **G** counted = best **T** the highest score decides passed/score shown on the panel and used for completion; **G** counted = last **T** the latest submitted attempt decides (a later fail replaces an earlier pass). **G** already passed and retake not allowed **T** Start disabled. **G** staff want to give one more try **T** a user with `enrollments.manage` adds extra attempts for that student on that quiz (audited) |
| Q7 | Review after submit | **G** review rule "full" **W** attempt submitted **T** each question shows my answer, right/wrong, correct answer and explanation; **G** rule "hidden" **T** the correct answers are **never present in the response payload** (not merely hidden in the UI), also not in the in-progress attempt data. Student sees only own attempts; instructors with `enrollments.view` see all in scope |
| Q8 | As the academy, I want required quizzes to block completion and the certificate. | **G** a lesson has a required quiz **W** the student finishes the video (B3) **T** the lesson is **not** added to `completedLessons` until the quiz is passed; the player says "pass the quiz to complete". **G** a required course-level quiz is not passed **T** progress may show 100% but the course is not complete, `certificateEligibility` returns reason `quiz`, and E1 issues nothing; panel lists what is missing. **G** non-required quiz **T** never blocks, result is informational. **G** attempts exhausted and not passed **T** stays blocked until staff add attempts (Q6) |
| Q9 | As an instructor/admin, I want results. | **G** quiz with 20 attempts **W** I open results **T** per student: attempts, counted score, passed; per question: % correct (to spot bad questions); export CSV `[P3]`. Staff can open any attempt in scope; tenant `demo` staff cannot see `iba` attempts (404). Manual score override `[P3, client?]` |
| Q10 | Failures / edge cases | **G** another tenant's quiz id, not enrolled, cancelled enrollment, locked by drip **W** start or submit **T** 403/404, no attempt created. **G** the quiz's question was archived mid-attempt **T** attempt uses its snapshot. **G** student types digits as ۱۲, ١٢ or 12 in short answer **T** all match 12. **G** quiz has a time limit and the phone sleeps **T** time keeps running on the server. **G** a free-preview lesson has a quiz **T** quiz requires login+enrollment |

**Data:** new tenant-scoped (add to `multiTenantPlugin.collections`): `questions` (course, type, text, options[{text, isCorrect}], acceptedAnswers[], points, explanation, archived), `quizzes` (course, lesson?, title, status draft/published, questions[{question, points}], passMark, attemptsLimit?, timeLimitMin?, countedAttempt, review, partialCredit, allowRetakeAfterPass, shuffle, required), `quizAttempts` (quiz, user, enrollment, attemptNo, snapshot json, answers json, startedAt, deadlineAt, submittedAt, score, maxScore, passed, status in_progress/submitted/auto_submitted; unique quiz+user+attemptNo). Extra attempts: `enrollments.quizExtraAttempts[{quiz, extra}]`. Access: `questions` and `quizzes` read **not public** (staff with `quizzes.manage`/`courses.view` read; students get quiz data only through a server route that strips correct answers); attempts: student reads own, staff with `enrollments.view` in scope; student never writes score/passed; **no delete**. Authoring = `quizzes.manage` (existing key; tech lead may add `quizzes.edit`). Grading and eligibility in `packages/core`; extend `certificateEligibility` with `missing: ('quiz'|'assignment')[]` and reasons `quiz`/`assignment`.
**Client questions:** see consolidated list items 9–12.

---

## R · Content drip

**Added:** 2026-11-06.
**Goal:** lessons open on a schedule instead of all at once, per course, so cohorts move together and self-paced students are paced.
**Non-goals:** per-student custom schedules, drip for live sessions (D has its own times), drip by score, email "new lesson" campaigns (F event `lesson unlocked` is P3).

**Rule per lesson** (set by `lessons.edit`; default **none = open as soon as enrolled**):

| Mode | Unlocks at |
| --- | --- |
| Fixed date | the chosen date/time (entered in Tehran time, stored UTC) |
| N days after enrollment | start of day (00:00 `Asia/Tehran`) of `enrolledAt` date + N `[confirm: midnight or exact hour]`; N = 0 means the enrollment day |
| N days after cohort start | start of day of `cohort.startDate` + N; N may be 0 |
| After previous | the previous lesson (by `order` in the course) is completed, **including its required quiz** (Q8) |

| ID | Story | Acceptance |
| --- | --- | --- |
| R1 | As an instructor, I want to set a release rule on a lesson. | **G** I hold `lessons.edit` in scope **W** I save mode + value **T** validated (N integer ≥ 0, date valid, "after previous" not on the first lesson); an admin preview shows "unlocks for a student enrolled today: [Jalali date]". **G** `isFreePreview` is on **T** warning: free previews ignore drip (public) |
| R2 | As a student, I want to see what is locked and when it opens. | **G** lesson 5 unlocks in 3 days **W** I open the course lessons list **T** all lessons are listed in order; locked ones show a lock, title, and "باز می‌شود ..." with the Jalali date (Persian digits) — for "after previous": "پس از تکمیل جلسه X"; unlocked ones are playable. Titles are visible, but no video, notes or resources are sent for locked lessons |
| R3 | As the academy, I want a direct URL to a locked lesson refused. | **G** a locked lesson **W** the student opens its URL, calls the signed-video endpoint (B1) or the API for notes/resources **T** 403 with the same "unlocks on ..." message, no video URL issued; **G** unlock time passes while the page is open **T** the next request works without relogin; the player's signed URL is not issued early for a lesson that unlocks soon. All checks are server-side; the UI lock is cosmetic |
| R4 | As a student with no cohort (video-only), I want drip that still makes sense. | **G** a lesson rule "N days after cohort start" and my enrollment has no cohort **W** I open the list **T** fallback (configurable default): treat as "N days after enrollment"; admin sees a warning when saving such a rule on a course that has cohort-less enrollments. **G** "fixed date" **T** applies to everyone. `[client: is that the right fallback?]` |
| R5 | As the academy, I want date changes handled predictably. | Unlock time is **computed on read**, never stored. **G** cohort `startDate` changes **T** all locked lessons recompute; a lesson a student already opened or completed is **never re-locked**. **G** admin moves a student to another cohort **T** recomputed from the new cohort; same no-re-lock rule. **G** enrollment is re-activated after cancel **T** `enrolledAt` is the original date unless admin edits it `[client]`. **G** cancelled enrollment **T** no access at all (B1f beats drip) |
| R6 | As staff, I want to preview everything. | **G** I hold `lessons.edit` or `submissions.grade` in scope **W** I open any lesson **T** I can open locked lessons with a "preview — locked for students" banner; nothing is recorded as student progress; a student, or staff outside scope/tenant, gets no bypass. Platform super-admin impersonating a student sees what the student sees |
| R7 | Time zone and boundaries | **G** unlock "start of day" **T** computed in `Asia/Tehran` `[confirm]` (not browser or server zone; DST handled by the tz database, not hand-coded offsets); Jalali date shown matches the actual unlock moment, including near midnight and year-end (Esfand→Farvardin). **G** the student travels abroad **T** same unlock moment. Logic in `packages/core` (`lessonUnlockAt`), pure, Vitest-tested with fixed clocks |
| R8 | Interaction with other modules | **G** a drip-locked lesson has a quiz (Q) or assignment (C) **T** they are locked with it and not counted as missing until it unlocks (so progress/certificate show "not yet released", not "failed"); the week view (A) lists upcoming unlocks. **G** "after previous" and the previous lesson's required quiz is not passed **T** stays locked, message names the quiz |

**Data:** add on `lessons`: `drip { mode: none/fixedDate/afterEnrollment/afterCohortStart/afterPrevious, days, releaseAt }`. Add `enrollments.enrolledAt` (UTC; set when the enrollment becomes active; backfill from `createdAt`). **Issue for tech lead:** `lessons` is `read: anyone` and exposes `videoUrl`, `notes`, `resources` through the Payload API, so drip (and B, paid content in general) cannot be enforced until those fields are restricted — field-level read access or move content to a server-only route. Required before R ships.
**Client questions:** see consolidated list items 13–16.

---

## Build order (suggested, for tech-lead)

| Step | Items | Depends on |
| --- | --- | --- |
| 1 | D adapter + mock, `liveSessions`; A week view; F adapters (email, Bale) + `notificationLog` | live provider decision |
| 2 | B video adapter + signed playback + watermark | Arvan account `[client]` |
| 3 | **E-026a:** lock down `lessons` field reads; `enrolledAt`; R drip (core `lessonUnlockAt` + lesson list/route enforcement) | none; unblocks B and Q |
| 4 | **E-026b:** ADR 009 (private uploads) → C1–C6 assignments/submissions + `submissionFiles` | ADR 009 |
| 5 | **E-026c:** Q questions/quizzes/attempts, core grading, Q8 gate | step 3 (R "after previous"), `certificateEligibility` change shared with C6 |
| 6 | E issuing job + PDF + QR (C7 defense result lands here, outside E-026) | C, Q, defense |

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
| ~~Auto-graded quizzes~~ | **Reversed 2026-11-06 by Farjad** → now section Q |
| Essay/manual-graded quiz questions, random question pools, proctoring | Assignments (C) cover manual grading; pools/proctoring serve no revenue line yet |
| Per-student custom drip schedules, drip by score | One course-level rule is enough; revisit after IBA feedback |

## Open questions for Farjad / the client (consolidated)

1. Skyroom or BigBlueButton; self-hosted or paid plan?
2. Arvan VOD already set up; watermark content; recording retention and post-cohort access.
3. Grading scale, pass mark, late policy, defense panel and re-defense policy.
4. Certificate approval: automatic or director-signed; signature/seal assets; workshops get certificates?
5. Overdue instalment: what happens to access?
6. Email provider and sender; Bale bot owner; is Telegram needed?
7. Week start day. (Drip is now decided: section R, questions 13–16.)
8. Legal: DBA "Ministry of Science" claim stays unpublished until verified (Notion 04).
9. Quizzes: pass mark, and how many attempts? Should students see the correct answers after a quiz — never, after passing, or always?
10. Multiple-choice questions: if a student ticks only some of the right answers, do they get partial points or zero? (We start with zero.)
11. Short answers: is an exact match (after ignoring Persian/Arabic digit and ي/ک differences, extra spaces, and نیم‌فاصله) fine, or should near-misses count? Any negative marking? (We start with none.)
12. Time-limited quizzes: when time runs out, submit what the student has typed so far (our default) — OK? How many seconds of grace? If a student retakes, does the best or the last score count (we start with best)? Can a student retake after passing?
13. Drip: which lessons/courses release on a schedule, and by which rule (date, days after enrollment, days after cohort start, after the previous lesson)? Does a new day start at midnight Tehran time, or at a set hour?
14. For video-only students with no cohort, "days after cohort start" has no start day — OK to count from their enrollment date?
15. If you move a cohort's start date, should lessons a student already opened stay open? (We say yes.) If a cancelled student returns, do days count from the first or the new enrollment?
16. Which staff should be able to preview locked lessons: all instructors, or only those of that course?
17. Assignments: allowed file types and maximum size; maximum number of files; is a late submission penalised; for a required assignment with no pass mark, is "graded" enough?
