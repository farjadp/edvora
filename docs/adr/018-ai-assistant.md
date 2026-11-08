# ADR 018 — AI assistant for academy staff («دستیار هوشمند»)

**Status:** proposed (2026-11-08, E-046). Decisions 1–3 below are Farjad's (2026-11-08); the rest is the design.

## Context
Academy staff want an assistant in `/admin` and `/staff` that answers from the academy's own documents and data and
can do small jobs for them (create a coupon, fix a course field). It handles student data and can change records, so
it has to follow the same rules as a person: tenant isolation, permissions (ADR 006), four-eyes on money, an audit trail.
Production runs on an Iranian host, and OpenAI, Anthropic and Google refuse requests from Iranian IPs.

## Decision

### 1. Act only with confirmation (Farjad)
- **Read tools** run at once, but only through the Payload local API **as the signed-in user**
  (`user`, `overrideAccess: false`), so collection `access` and scope (own leads, own courses) apply unchanged.
  Every query also filters by `tenant`.
- **Write tools never write.** They store a **proposal** (`ai-actions`, status `pending`, 30 min expiry) and the chat
  shows a confirm card listing the exact change. Only the person who asked can press confirm (`confirmDecision` in
  `packages/core/src/ai/actions.ts`). The action then runs through the local API as that user, so the collection's
  `access`, `guard` and audit hooks run as if they had made the change by hand. The proposal, its confirmation or
  rejection and the result are written to `audit-logs` (`ai.action.proposed|confirmed|rejected|failed`).
- **Money:** approvals (`payments.manual.approve`, `refunds.approve`) are never in the tool catalogue and
  `confirmDecision` refuses any action that needs them. The assistant can at most prepare a *request* that a second
  person approves on the finance desk (ADR 006, E-045). The first write actions are `coupon.create`, `course.update`
  (text fields only; price needs `pricing.edit`) and `lead.note` (follow-up date/note on a lead in the user's scope).

### 2. Providers (Farjad)
One active provider and model per academy: **OpenAI**, **Anthropic Claude**, **Google Gemini**, or a **custom
OpenAI-compatible endpoint** (base URL + key, for Iranian gateways such as AvalAI or GapGPT). Each lives in
`packages/integrations/src/ai/` behind one `AiProvider` interface (streamed chat with tool calls, embeddings,
connection test) with a **mock** that CI and e2e use. All calls are server-side `fetch`; no SDKs, no browser calls.
`AI_PROVIDER_OVERRIDE=mock` (env) forces the mock for every academy (CI, e2e, local dev).

### 3. Per academy (Farjad)
Settings, keys, documents, chunks, chats, memory notes and proposals all carry `tenant` and are in
`multiTenantPlugin.collections`; the raw `ai_chunks` table has `tenant_id` and every query filters on it.
The API key is **write-only**: sealed with AES-256-GCM (`sealAiKey`, key from `AI_SECRETS_KEY`, else derived from
`PAYLOAD_SECRET`), stored in a field nobody can read through the API, and shown back only as "set · ends with 1a2b".
A **test connection** button calls the provider server-side and reports ok / the error text.

### Data flow (one chat turn)
```
browser ──POST /api/ai/chat (message, page context)──▶ Next route handler (server only)
  1 auth: Payload session + Host tenant; needs `ai.use` in that academy; per-user rate limit; monthly budget
  2 build prompt: system rules + approved memory notes + top-k chunks (docs, memory, own past chats)
                  + current page/record summary (read as the user) + last 12 messages
  3 redact (privacy policy) ──▶ provider (stream) ──▶ text deltas / tool calls
  4 read tool  → local API as the user → redact → back to the model (≤ 4 rounds)
    write tool → `ai-actions` proposal → confirm card in the chat
  5 save messages, citations, token usage; stream NDJSON events to the browser
browser ──POST /api/ai/actions/:id (confirm|reject)──▶ checks → local API as the user → audit
```

### What leaves the server (and only to the academy's chosen provider)
The system prompt, approved memory notes, the retrieved document passages, a summary of the page the person is on,
the conversation, and tool results — **after redaction**. Never: API keys, passwords, sessions, other academies' data,
other staff members' chats, records the person cannot read.

### Privacy defaults (`ai-settings.privacy`)
| Data | Default | How |
| --- | --- | --- |
| Names | **sent** | Needed for "what is Ali's status?". When off, name fields in tool results become `[نام]`. Free-text names in a message cannot be detected reliably; the UI says so. |
| National code | **redacted** | 10-digit codes with a valid checksum, and `nationalCode` fields → `[کد ملی]` |
| Mobile / phone | **redacted** | Iranian mobiles in any digit set and `+98`/`0098` forms, `mobile`/`phone` fields → `[تلفن]` |
| Email | **redacted** | addresses and `email` fields → `[ایمیل]` |
| Card / IBAN | **always redacted** | 16-digit card numbers (Luhn) and `IR` + 24 digits; no switch |

Redaction (`packages/core/src/ai/redact.ts`) runs on every string that leaves the server, including the person's own
message. The UI shows the active policy in the chat panel.

### "Learning" is retrieval, not training
Nothing is sent to train a model. The assistant "knows" the academy through retrieval: uploaded documents (PDF,
Excel/CSV, Word, text — parsed on the server, chunked, embedded), **memory notes** (the assistant may propose
"remember that our refund policy is …"; a person with `ai.manage` approves, edits or deletes it; only approved notes are
used) and the person's own saved chats. Answers cite their sources as `[1]`, `[2]`, linked under the answer.
The UI says this in plain Persian.

### Vectors: pgvector in the same Postgres
`ai_chunks` is a raw table (not a Payload collection) created by the migration and, in dev, by `ensureChunkStore()`:
`embedding vector` when the `vector` extension is available, else `double precision[]` with cosine similarity in
application code (so a host without pgvector still works, slower). The table is excluded from Payload's dev schema
push (`tablesFilter: ['*', '!ai_chunks']`). The column is dimension-less because providers differ (OpenAI 1536,
Gemini 768, local 1024); every row stores `embedding_model` and search only compares rows of the active model. Exact
scan is fine for an academy's few thousand chunks; an HNSW index per dimension can come later.
Anthropic has no embeddings API: with Claude, or when embedding fails, a local hashed n-gram embedding
(`local-hash-v2-1024`: hashed words and in-word trigrams, stop words dropped) is used — keyword-like, no outside call. Search keeps passages above a similarity of 0.12 for the local embedding and 0.3 for provider embeddings.

### Permissions
Two new academy keys: `ai.use` (use the assistant) and `ai.manage` (settings, key, knowledge base, memory approval).
"Which roles can use it" is the role editor: granting `ai.use` to a role. The settings page lists which roles hold it.
Academy admin gets both (template = all academy keys); the migration adds them to existing academy-admin roles.

### Limits
Per-user rate limit (default 20 messages/min, 300/day, counted from `ai-messages`, so it holds across processes) and
an academy budget per calendar month: tokens, or cost in rials from the academy's own per-million-token prices
(integer rials, shown with `formatToman`). Over the limit, the chat says so; nothing is sent.

### Errors
Provider failures, parsing errors and embedding errors are logged and shown as a friendly message; they never throw
into page rendering or break a save. A failed document stays in the list with its error.

## Iran access note
From an Iranian server, `api.openai.com`, `api.anthropic.com` and `generativelanguage.googleapis.com` refuse requests
(sanctions, geo-blocking on their side). Options, in order: (a) **custom endpoint** with an Iranian gateway (AvalAI,
GapGPT, …) that resells these models, billed in toman; (b) a relay outside Iran under Edvora's control (adds a hop
that sees the traffic — needs its own decision); (c) the big three directly only when the app is hosted outside Iran
(the Railway demo). Using a gateway means the academy's prompts pass through that company: the privacy defaults
above matter most in that case, and the academy should know who the gateway is.

## Consequences
- New collections: `ai-settings`, `ai-conversations`, `ai-messages`, `ai-documents`, `ai-memories`, `ai-actions`;
  raw table `ai_chunks`; two permission keys; CI Postgres image becomes `pgvector/pgvector:pg16`.
- Uploaded documents are visible (through answers) to everyone with `ai.use` in the academy. The upload screen says so.
- Each new write action needs: a core definition with its permission, a server executor that uses the local API as the
  user, and a test. Money approvals stay out.
- Costs are the provider's; the budget limit is the guard.
- Prompt injection: an uploaded document or a record could contain text that tries to steer the model. The damage is
  bounded by design: read tools only return what the person may already read, and every write is a proposal the
  person reads and confirms. Managers should still upload only trusted documents.
