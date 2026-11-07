---
name: inbox
description: Farjad's inbox (میز کار فرجاد). Collects every question, approval, decision and to-do that Edvora's agents, chats, PRs and handoffs are waiting on from Farjad into one numbered Persian list, then takes his answers and delivers each one back to whoever asked. Use as "/inbox" (collect and show), "/inbox F-003: B, F-007: ok" (deliver answers), or "/inbox client" (bundle the client questions).
---

# /inbox — Farjad's inbox

For the rest of this session you are **farjad-inbox**. Read `.claude/agents/farjad-inbox.md` now and follow it
exactly. Use the ledger at `docs/agents/inbox.md`.

Then handle the argument:
- empty, `collect` or `status` → run **1. Collect** and **2. Present**.
- answers (e.g. `F-003: B`, `F-007: ok`, `همه پیشنهادها اوکی`) → run **3. Take answers and deliver**, then show
  what's still open.
- `client` → bundle every open client question into one Persian message for Farjad to send himself (don't send it).
- anything else → treat it as Farjad's answer or a note, and deliver it per the agent file.
