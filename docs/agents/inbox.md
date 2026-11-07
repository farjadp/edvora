# Farjad's inbox (میز کار فرجاد)

Maintained by the `farjad-inbox` agent (`/inbox`). One row per thing Farjad must answer, decide or do. IDs (`F-###`)
never change. Status: `open` → `answered` → `delivered` (or `verify` = may already be resolved, check next sweep).
Sources are where the ask came from; "Deliver to" is where the answer goes.

_Seeded 2026-11-07 by head-of-product from the sessions and PRs of 2026-11-06/07. Run `/inbox` to refresh._

| ID | Type | Ask | Source | Recommendation | Status | Answer · delivered |
| --- | --- | --- | --- | --- | --- | --- |
| F-001 | only-Farjad | IBA preview on Railway: set `PRIVATE_PREVIEW_PASSWORD` on service `web-iba`, then run the import commands in a Terminal tab (DB proxy + backup first) | E-030 session, PR #17, runbook "IBA client preview" | Do it before the IBA meeting; test from an Iranian connection | verify | |
| F-002 | client | Send the 9 quiz/drip/assignment questions to IBA (Persian draft ready) | E-026 handoff, phase-2.md Q9–17 | Send as drafted | open | |
| F-003 | decision | Gamification: week start (Saturday?), streak default (2 days/week), leaderboard at all + min opt-in (8), refund reverses XP?, badge and level names (آغازگر … پیشگام) | E-027/E-028 handoffs, PR #21 | Saturday · 2 days · leaderboard off by default · refund removes XP but not badges · names ok | open | |
| F-004 | decision + only-Farjad | Live classes: Arvan VM 8 vCore/16 GB (~8.7M/month) + object storage + staging VM, who owns the account, who has server access, OK to send vendor questions | E-033 handoff, ADR 012, PR #18/#22 | Approve; Farjad owns the account; name one ops person | open | |
| F-005 | decision | WordPress migration: Studiare theme licence for fixtures, how long uploaded bundles are kept, label for imported certificates | E-032 handoff, PR #19 | 30 days retention · label «منتقل‌شده از سامانهٔ قبلی» | open | |
| F-006 | decision | Admin (E-031): accept remaining axe findings in Payload's own markup? Give the home manifesto a prose layout? | PR #20 body | Accept for now · yes, prose layout | open | |
| F-007 | decision | E-035 uses turquoise/petrol/warm white for /admin + /staff; Seal (paper/ink/gold) is on student panel (#21) and login (#23). Staff/admin only, or student side too? | E-031/E-035 session | Staff/admin only; keep Seal for students | open | |
| F-008 | review | PRs: #21 gamification (CI green, needs rebase), #17 IBA content (e2e failing), #19 WordPress (draft, QA NO-GO being fixed) | GitHub | Merge #21 after rebase; #17 after fix | open | |
| F-009 | decision | E-022 working answers: separate `/staff/login`, recovery codes later (E-022b), 2FA reset needs permission, `/admin` not narrowed yet, no SMS on reset | E-022 handoff | Confirm all five | verify | |
| F-010 | client | Real MBA/DBA fees + instalments + cohort dates (E-001); proof/wording of DBA "Ministry of Science" claim (E-002); testimonial + faculty photo consent (E-003) | board, E-030 handoff | Bundle into one message to IBA | open | |
| F-011 | only-Farjad | Zarinpal + Kavenegar sandbox accounts (E-004); Iranian server for staging/prod (E-005); sanctions lawyer + GitHub vs Gitea (E-006) | board | — | open | |
| F-012 | decision | Housekeeping: stop idle dev servers, nudge stalled E-029 (sandbox, no PR), archive merged chats | head-of-product | Yes to all three | open | |
| F-013 | decision | First release: `main` is ~90 commits behind `develop` | GitHub | After #21 + #17 merge and a QA pass, release to `main` | open | |
| F-014 | FYI | Railway `railway.json` format stops working on 2026-12-01 | E-025 handoff | tech-lead migrates before then | open | |
