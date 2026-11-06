# Edvora AI team

**You talk to one agent: the Head of Product.** Tell it what you want in plain words (Persian is fine). It clarifies,
plans the work on the board, briefs the other agents, creates new agents when the team is missing a skill, opens
separate chats for big work, checks the results, and reports back.

```bash
claude --agent head-of-product          # CLI
```
In any session inside this repo (CLI or desktop app): **`/product <what you want>`**, `/product status`, `/product next`.

## Team
Full list with dates and planned agents: [`roster.md`](roster.md).

| Agent | Job | Model |
| --- | --- | --- |
| `head-of-product` | Front desk + orchestration + creates agents | opus |
| `product-manager` | User stories, acceptance criteria, PRDs | sonnet |
| `knowledge-keeper` | Notion + decision log + docs | sonnet |
| `ux-architect` | Flows, wireframes | sonnet |
| `ui-designer` | Screens in code, design system | sonnet |
| `tech-lead` | Architecture, code, review | opus |
| `qa` | Tests, bugs, release GO/NO-GO | sonnet |

## How it works

```
                 Farjad ──"what I want"──►  Head of Product  ──report + decisions──► Farjad
                                               │   ▲
                         briefs (parallel)     │   │ handoffs (checked against "done")
       ┌───────────────┬──────────────┬────────┴───┴───┬──────────────┬───────────────┐
  product-manager  ux-architect   ui-designer      tech-lead          qa      knowledge-keeper
                                                                               (Notion)
       + new agents it creates from agent-template.md when a skill is missing
       + separate chats (own worktree/PR) for big tasks → docs/agents/handoffs/E-###.md
```

Shared state: [`board.md`](board.md) (tasks), [`handoffs/`](handoffs/), Notion (source of truth).

The Head of Product must be the **main session**: subagents can't start other subagents.

## Separate chats
Big or long tasks run as their own session in their own git worktree, opening a PR into `develop`:
- desktop app: the Head of Product proposes the session; you start it with one click;
- CLI: `claude --agent <agent>` and paste the brief it gives you.

## Human approval gates (agents stop and ask you)
Architecture reversals · design direction and major screens · provider contracts/accounts/payments · anything sent to
the client or published · public claims (credentials, prices, dates) · merging to `main` / releases ·
deleting data, content or agents you approved.

## Handoff format
**Task · Output · Decisions made · Open issues · Next owner** — template in [`handoffs/_template.md`](handoffs/_template.md).
New agents: [`agent-template.md`](agent-template.md).
