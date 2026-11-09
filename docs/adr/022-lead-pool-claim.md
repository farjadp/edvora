# ADR 022 — Advisor CRM desk: the unassigned lead pool and `leads.claim`

**Status:** proposed (2026-11-09, E-015)

## Context
Leads from the public forms arrive with no advisor. Until now only someone with `leads.view.all` + `leads.assign`
(academy admin, sales manager) could see and hand them out, in `/admin`. The advisor desk (E-015) needs advisors to take
new leads themselves («برمی‌دارم»), while a membership with **ownRecordsOnly** must keep meaning "only my own records".

`leads.view.own` cannot carry this: in core access `own` = `owner equals me`, used for the collection's read/update
filter and for the REST API. Widening it to "mine or nobody's" would open unassigned leads (names, mobiles) to every
advisor through `/api/leads` and to update, which nobody decided.

## Decision
1. **New catalog key `leads.claim`** («دیدن سرنخ‌های بی‌مشاور و برداشتن آن‌ها برای خود»). Added to the `advisor` template
   (so `sales-manager`, built from it, has it too) and to `academy-admin` (every key). A data migration adds it to
   existing roles created from those three templates; custom roles get it only when an admin ticks it.
2. **The pool is server-side only.** `leadPoolAccess` (core) = active membership in this academy holding `leads.claim`,
   **not** `ownRecordsOnly`; a course scope narrows the pool to those courses and a pool lead without a course is then
   outside it (fail closed). The desk reads the pool with `overrideAccess` after that check; `/api/leads` is unchanged.
3. **Claim = conditional update** (`advisor exists: false` in the where clause) as the staff user, with a request
   context flag (`LEAD_DESK_CONTEXT`) that lets "unassigned → me" through the `leads.assign` hook. Guard, audit and
   tenant checks still run. Two advisors clicking together: one wins, the other is told.
4. **Assign** stays `leads.assign`; the target must hold `leads.view` covering the lead as its owner (checked on the
   target's own grants), so a course-scoped advisor cannot be given another course's lead.

## Consequences
- `ownRecordsOnly` now has a visible effect for advisors (access-matrix gap G4).
- Existing IBA advisors gain the pool on deploy (migration) — confirmed by Farjad on 2026-11-09. If the academy later
  prefers manager-only distribution, an admin removes `leads.claim` from the advisor role.
- No schema change for timeline: status/owner history is read from the audit log (`leads.update` diffs); calls from
  `followUps`. `lostReason` is a new select on leads.
