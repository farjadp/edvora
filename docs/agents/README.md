# Edvora AI team

The 7 core agents from Notion page 06, built as Claude Code agents in `.claude/agents/`.
The other 13 agents on page 06 are added when their phase starts — more agents means more handoffs.

| # | Agent | File | Model | Writes code? |
| --- | --- | --- | --- | --- |
| 00 | Orchestrator / PM | `orchestrator.md` | opus | no — plans, delegates, checks |
| 01 | Product Manager | `product-manager.md` | sonnet | no — `docs/product/` |
| 02 | Knowledge Keeper | `knowledge-keeper.md` | sonnet | no — Notion + docs |
| 05 | UX Architect | `ux-architect.md` | sonnet | no — `docs/ux/` |
| 06 | UI Designer | `ui-designer.md` | sonnet | yes — UI, tokens, components |
| 10 | Tech Lead | `tech-lead.md` | opus | yes — everything else |
| 15 | QA | `qa.md` | sonnet | tests only — `e2e/`, `docs/qa/` |

## How orchestration works

```
             Farjad (approval gates)
                    │
            ┌───────▼────────┐        docs/agents/board.md  (shared task board)
            │  Orchestrator  │◄──────►docs/agents/handoffs/ (results from separate chats)
            └───────┬────────┘        Notion                (source of truth)
     subagents      │  (parallel when independent)
  ┌──────┬──────────┼──────────┬───────────┬──────┐
  PM    UX         UI      Tech Lead       QA    Knowledge Keeper
```

Typical flow: **PM** story → **UX** flow/wireframe → **UI** screens → **Tech Lead** spec + build → **QA** tests →
**Farjad** approves → **Knowledge Keeper** updates Notion.

The orchestrator must be the **main session** — subagents can't start other subagents.

## Running it

**One session runs the whole team (recommended for small and medium tasks):**

```bash
claude --agent orchestrator
```

Or, in any session inside this repo: `/orchestrate <goal>`, `/orchestrate next`, `/orchestrate status`.

**Separate chats (for big tasks or ones you want to steer yourself):**

```bash
claude --agent tech-lead      # or product-manager, ux-architect, ui-designer, qa, knowledge-keeper
```

In the desktop app: start a new session in this folder and say *"Use the tech-lead agent for task E-012"*.
Each separate chat reads `board.md`, does its task, writes `docs/agents/handoffs/E-###.md`, and the orchestrator
picks it up on its next run. Two chats that write code must not touch the same files at the same time —
give each one its own git worktree/branch.

## Human approval gates (agents stop and ask)
Architecture reversals · design direction and major screens · provider contracts/accounts/payments · anything sent to
the client or published · public claims (credentials, prices, dates) · production releases and pushes to `main` ·
deleting data.

## Handoff format
1. **Task** 2. **Output** 3. **Decisions made** 4. **Open issues** 5. **Next owner** — template in
`handoffs/_template.md`.
