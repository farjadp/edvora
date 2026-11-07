# ADR 014 — Gamification ledger, derived totals and deferred hooks

**Status:** proposed (2026-11-06, E-028) — needs Farjad's review

## Context
E-028 adds XP, levels, a weekly rhythm (streak), badges and a certificate path for students, and outcome-based goals
for advisors and finance (PRD `docs/product/gamification.md`). The PRD asks for one award per source, a daily cap,
reversals that are visible, history kept when the academy turns gamification off, and strict tenant isolation.

## Decision
- **Append-only ledger** `learning-events` (tenant-owned). One row per fact (lesson completed, quiz passed, badge
  earned, weekly goal, reversal). `(tenant, idempotencyKey)` has a unique index: double taps, offline retries and
  racing requests write one row. API create/update/delete are denied; only `apps/web/src/lib/gamification.ts`
  writes, after the caller checked tenant, user and enrollment. A correction is a negative `reversal` row.
- **Derived totals.** XP, level, weekly rhythm, badges and the certificate path are pure functions in
  `@edvora/core/gamification` over ledger rows + course state. `enrollments.gamification` caches the result and is
  rebuilt by `refreshEnrollmentGamification` (idempotent; also writes missing milestone/badge/weekly rows).
- **Switches hide, the ledger records.** Activity rows are written whatever the switches say, so turning the academy
  back on restores everything (PRD G1.3). Badge and weekly-bonus rows are written only while those mechanics are on.
- **Server-confirmed completion.** Lesson XP needs ≥ threshold watched (player beacon, server-clock capped) or the
  lesson's required quiz/assignment done. The manual button records progress (0-XP row) only.
- **Cap scope.** The 150 XP/day cap applies to the student's own actions (lesson, quiz, assignment submit, live).
  Milestones (course complete, defense), the weekly bonus and the instructor's grade bonus are exempt, so a finale
  is never "capped". A grade is not a learning day for the streak.
- **Streak per enrollment.** The rhythm is drip-aware, and drip is per course/cohort, so the streak lives on the
  enrollment. Neutral weeks: nothing released and unfinished, or a break (academy-wide in tenant settings, or the
  cohort's own breaks) touching the week.
- **Level 6 is graduation**, not XP: XP never unlocks a certificate.
- **No shared transactions; hooks defer.** Gamification writes never use the caller's `req`/transaction (an expected
  duplicate key must not abort a grade). Collection hooks (`submissions`, `enrollments`, `certificates`, quiz
  finalize inside another transaction) **defer** the work until after the operation (`deferGamification`): writing
  the enrollment row from a second connection while the first still holds its lock deadlocks (seen in testing).
  Scripts call `flushGamification()` before exit.
- **Follow-up outcomes.** `leads.followUps` is an append-only log written by `recordFollowUpOutcome` (server action,
  runs as the staff user so access + audit apply). Edits in /admin cannot write it; moving a due date without an
  outcome is logged as `date_moved` (due, never done); an admin status change while due is logged as
  `status_changed` (counts, PRD §4.1).

## Consequences
- A refresh runs a handful of queries per enrollment on every panel read; fine at academy scale, revisit with a
  stale-while-revalidate read of the cache if it shows up in profiling.
- Deferred hook work is in-process (no queue). On a crash between the commit and the deferred job, the next panel
  read's refresh catches milestones; activity rows from grading would be missed until the grade is saved again.
  Move to a job queue if/when one exists.
- The daily-cap check is read-then-write: two simultaneous actions at the cap edge can exceed it by one award.
- Refunds/cancellations do not reverse XP yet (PRD open question 8); the reversal path exists.

## Access note (QA-028-03)

Students authenticate with the SMS session, not as Payload users, so the `learning-events` REST endpoint answers them 403. They do not read their own rows through the API; the student UI gets its numbers from server-side queries (`lib/gamificationQueries.ts`), which filter by tenant and user. Only staff with `enrollments.view` (course/cohort scope) can read the ledger over REST; nobody can create, update or delete through it.
