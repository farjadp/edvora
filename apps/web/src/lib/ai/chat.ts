import 'server-only'
import { formatJalali, type AccessContext } from '@edvora/core'
import {
  LIMIT_MESSAGES,
  LOCAL_EMBEDDING_MODEL,
  MEMORY_TOOL,
  MEMORY_TOOL_DEF,
  READ_TOOLS,
  actionForTool,
  budgetDecision,
  citationsIn,
  monthStart,
  pickSources,
  rateDecision,
  redactRecord,
  redactText,
  sourcesBlock,
  systemPrompt,
  toolsFor,
  type Citation,
  type Source,
} from '@edvora/core/ai'
import { AI_ERROR_MESSAGES, AiError, type AiMessage, type AiToolCall } from '@edvora/integrations/ai'
import type { PayloadRequest } from 'payload'
import { writeAudit } from '../../hooks/audit'
import type { Tenant, User } from '../../payload-types'
import { insertChunks, poolOf as pool, searchChunks } from './chunks'
import { embedTexts } from './embed'
import { loadAiConfig, modelFor, providerFor, effectiveProviderName } from './settings'
import { proposeAction, runReadTool, toolResult, type ProposalOut, type ToolCtx } from './tools'

/** NDJSON events streamed to the chat panel. */
export type ChatEvent =
  | { t: 'start'; conversationId: number; title: string }
  | { t: 'text'; d: string }
  | { t: 'tool'; name: string; label: string }
  | { t: 'proposal'; proposal: ProposalOut }
  | { t: 'memory'; id: number; text: string }
  | { t: 'sources'; citations: Citation[] }
  | { t: 'done'; messageId: number | null }
  | { t: 'error'; message: string }

export type TurnInput = {
  req: PayloadRequest
  ctx: AccessContext
  tenant: Tenant
  user: User
  message: string
  conversationId?: number | null
  page?: { path: string; title?: string | null } | null
}

const MAX_ROUNDS = 4
/** Provider embeddings put unrelated text around 0.1–0.25; the local one near 0. */
const minScore = (model: string) => (model === LOCAL_EMBEDDING_MODEL ? 0.12 : 0.3)
const HISTORY = 12

const TOOL_LABELS: Record<string, string> = {
  search_courses: 'جست‌وجوی دوره‌ها',
  search_leads: 'جست‌وجوی سرنخ‌ها',
  search_orders: 'جست‌وجوی سفارش‌ها',
  search_students: 'جست‌وجوی دانشجویان',
  search_knowledge: 'جست‌وجو در اسناد آکادمی',
  propose_coupon: 'آماده‌کردن پیشنهاد کد تخفیف',
  propose_course_update: 'آماده‌کردن پیشنهاد ویرایش دوره',
  propose_lead_followup: 'آماده‌کردن پیشنهاد پیگیری',
  [MEMORY_TOOL]: 'پیشنهاد یادداشت حافظه',
}

const poolOf = (req: PayloadRequest) => pool(req.payload)

async function usageCounts(req: PayloadRequest, tenantId: number, userId: number) {
  const pool = poolOf(req)
  const now = Date.now()
  const [rate, month] = await Promise.all([
    pool.query<{ minute: string; day: string }>(
      `SELECT count(*) FILTER (WHERE created_at >= $3) AS minute, count(*) AS day FROM ai_messages WHERE tenant_id = $1 AND user_id = $2 AND role = 'user' AND created_at >= $4`,
      [tenantId, userId, new Date(now - 60_000), new Date(now - 86_400_000)],
    ),
    pool.query<{ i: string; o: string }>(`SELECT coalesce(sum(input_tokens), 0) AS i, coalesce(sum(output_tokens), 0) AS o FROM ai_messages WHERE tenant_id = $1 AND created_at >= $2`, [tenantId, monthStart()]),
  ])
  return {
    sentLastMinute: Number(rate.rows[0]?.minute ?? 0),
    sentToday: Number(rate.rows[0]?.day ?? 0),
    month: { inputTokens: Number(month.rows[0]?.i ?? 0), outputTokens: Number(month.rows[0]?.o ?? 0) },
  }
}

const PAGE_COLLECTIONS = new Set(['courses', 'cohorts', 'lessons', 'leads', 'orders', 'coupons', 'enrollments', 'users', 'posts', 'pages', 'quizzes', 'assignments', 'live-sessions', 'certificates'])

/** A short, redacted summary of the record the person is looking at (read as them; nothing if they cannot read it). */
async function pageRecord(t: ToolCtx, path: string): Promise<string | null> {
  const m = path.match(/^\/admin\/collections\/([a-z-]+)\/(\d+)/)
  if (!m || !PAGE_COLLECTIONS.has(m[1]!)) return null
  try {
    const doc = (await t.req.payload.findByID({ collection: m[1] as 'courses', id: Number(m[2]), req: t.req, user: t.req.user, overrideAccess: false, depth: 0 })) as unknown as Record<string, unknown>
    const tenant = typeof doc.tenant === 'object' && doc.tenant ? (doc.tenant as { id: unknown }).id : doc.tenant
    if (m[1] !== 'users' && Number(tenant) !== t.tenantId) return null
    const flat = Object.fromEntries(Object.entries(doc).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v) && String(v).length <= 400))
    const s = JSON.stringify({ collection: m[1], ...(redactRecord(flat, t.privacy) as object) })
    return s.length > 1500 ? `${s.slice(0, 1500)}…` : s
  } catch {
    return null
  }
}

function safeArgs(json: string): unknown {
  try {
    return JSON.parse(json || '{}')
  } catch {
    return {}
  }
}

/** One chat turn. Never throws: failures are logged and end the stream with an `error` event. */
export async function* runTurn(input: TurnInput): AsyncGenerator<ChatEvent> {
  const { req, ctx, tenant, user } = input
  const payload = req.payload
  const tenantId = tenant.id
  const userId = Number(user.id)
  const cfg = await loadAiConfig(payload, tenantId)
  if (!cfg.enabled) {
    yield { t: 'error', message: 'دستیار هوشمند در این آکادمی روشن نیست. مدیر آکادمی می‌تواند آن را در «دستیار هوشمند › تنظیمات» روشن کند.' }
    return
  }

  const counts = await usageCounts(req, tenantId, userId)
  const rate = rateDecision(counts, cfg.rate)
  if (!rate.ok) {
    yield { t: 'error', message: LIMIT_MESSAGES[rate.reason] }
    return
  }
  const budget = budgetDecision(counts.month, cfg.budget)
  if (!budget.ok) {
    yield { t: 'error', message: LIMIT_MESSAGES[budget.reason] }
    return
  }

  // Conversation: the person's own, in this academy, or a new one.
  let conversation = input.conversationId
    ? (await payload.find({ collection: 'ai-conversations', where: { and: [{ id: { equals: input.conversationId } }, { tenant: { equals: tenantId } }, { user: { equals: userId } }] }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
    : undefined
  const now = new Date().toISOString()
  if (!conversation) {
    const title = input.message.replace(/\s+/g, ' ').trim().slice(0, 60) || 'گفت‌وگوی تازه'
    conversation = await payload.create({ collection: 'ai-conversations', overrideAccess: true, data: { tenant: tenantId, user: userId, title, pagePath: input.page?.path ?? null, lastMessageAt: now, messageCount: 0 } })
  }
  yield { t: 'start', conversationId: conversation.id, title: conversation.title }

  const prior = await payload.find({ collection: 'ai-messages', where: { and: [{ conversation: { equals: conversation.id } }, { tenant: { equals: tenantId } }] }, sort: '-createdAt', limit: HISTORY, depth: 0, overrideAccess: true })
  await payload.create({ collection: 'ai-messages', overrideAccess: true, data: { tenant: tenantId, conversation: conversation.id, user: userId, role: 'user', content: input.message } })

  const t: ToolCtx = { req, ctx, tenantId, privacy: cfg.privacy }
  const providerName = effectiveProviderName(cfg)
  const model = modelFor(cfg)
  let text = ''
  let inputTokens = 0
  let outputTokens = 0
  const toolsUsed: string[] = []
  const proposals: number[] = []
  const sources: Source[] = []
  let errorMsg: string | null = null

  try {
    const provider = providerFor(cfg)
    const question = redactText(input.message, cfg.privacy)

    // Retrieval: documents, approved memory and the person's own past chats.
    const q = await embedTexts(payload, cfg, [question])
    // Past chats are the weakest source (they may repeat an earlier answer): ranked below documents and memory.
    if (q.vectors[0]) sources.push(...pickSources((await searchChunks(payload, { tenantId, userId, model: q.model, embedding: q.vectors[0] })).map((x) => (x.kind === 'chat' ? { ...x, score: x.score * 0.8 } : x)), 6, minScore(q.model)))

    const record = input.page?.path ? await pageRecord(t, input.page.path) : null
    const tools = toolsFor(ctx, tenantId)
    const system = systemPrompt({
      assistantName: cfg.name,
      academyName: tenant.name,
      userName: cfg.privacy.names ? (user.name ?? null) : null,
      today: formatJalali(new Date()),
      memories: [],
      sources: redactText(sourcesBlock(sources), cfg.privacy),
      page: input.page ? { path: input.page.path, title: input.page.title ? redactText(input.page.title, cfg.privacy) : null, record } : null,
      canPropose: tools.some((x) => x.kind === 'write'),
    })
    const messages: AiMessage[] = [
      ...prior.docs
        .reverse()
        .filter((m) => m.content)
        .map((m): AiMessage => (m.role === 'user' ? { role: 'user', content: redactText(m.content ?? '', cfg.privacy) } : { role: 'assistant', content: redactText(m.content ?? '', cfg.privacy) })),
      { role: 'user', content: question },
    ]

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const calls: AiToolCall[] = []
      let roundText = ''
      for await (const ev of provider.chat({ model, system, messages, tools: tools.map(({ name, description, parameters }) => ({ name, description, parameters })), signal: req.signal ?? undefined })) {
        if (ev.type === 'text') {
          roundText += ev.delta
          yield { t: 'text', d: ev.delta }
        } else if (ev.type === 'tool_call') calls.push(ev.call)
        else if (ev.type === 'usage') {
          inputTokens += ev.inputTokens
          outputTokens += ev.outputTokens
        }
      }
      if (roundText) text += (text ? '\n\n' : '') + roundText
      if (calls.length === 0 || round === MAX_ROUNDS - 1) break
      messages.push({ role: 'assistant', content: roundText, toolCalls: calls, raw: calls[0]?.raw })
      for (const call of calls) {
        toolsUsed.push(call.name)
        yield { t: 'tool', name: call.name, label: TOOL_LABELS[call.name] ?? call.name }
        const args = safeArgs(call.arguments)
        let result: string
        if (call.name === 'search_knowledge') {
          const query = String((args as { query?: unknown }).query ?? '').slice(0, 200)
          const v = query ? await embedTexts(payload, cfg, [redactText(query, cfg.privacy)]) : null
          const found = v?.vectors[0] ? pickSources(await searchChunks(payload, { tenantId, userId, model: v.model, embedding: v.vectors[0], kinds: ['document', 'memory'] }), 4, minScore(v.model)) : []
          const items = found.map((s) => {
            sources.push(s)
            return { n: sources.length, title: s.title, content: s.content.slice(0, 1200) }
          })
          result = toolResult(t, { items, note: 'Cite these as [n].' })
        } else if (call.name === MEMORY_TOOL) {
          const parsed = MEMORY_TOOL_DEF.input.safeParse(args)
          if (!parsed.success) result = toolResult(t, { error: 'invalid input' })
          else {
            const memory = await payload.create({ collection: 'ai-memories', overrideAccess: true, data: { tenant: tenantId, text: parsed.data.text, status: 'proposed', proposedBy: userId, conversation: conversation.id } })
            await writeAudit(req, { tenants: [tenantId], action: 'ai.memory.proposed', collection: 'ai-memories', docId: memory.id, note: parsed.data.text.slice(0, 300) })
            yield { t: 'memory', id: memory.id, text: parsed.data.text }
            result = toolResult(t, { status: 'proposed', note: 'A manager must approve it before it is used.' })
          }
        } else if (actionForTool(call.name)) {
          const out = await proposeAction(t, call.name, args, conversation.id)
          if (out.proposal) {
            proposals.push(out.proposal.id)
            yield { t: 'proposal', proposal: out.proposal }
          }
          result = out.result
        } else if (call.name in READ_TOOLS) result = await runReadTool(t, call.name, args)
        else result = toolResult(t, { error: 'unknown tool' })
        messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: result })
      }
    }
  } catch (err) {
    payload.logger.error({ err, msg: `ai chat failed (${providerName})` })
    errorMsg = err instanceof AiError ? AI_ERROR_MESSAGES[err.code] : 'پاسخ دستیار با خطا روبه‌رو شد؛ دوباره امتحان کنید.'
  }

  const citations = citationsIn(text, sources)
  let messageId: number | null = null
  try {
    const saved = await payload.create({
      collection: 'ai-messages',
      overrideAccess: true,
      data: {
        tenant: tenantId,
        conversation: conversation.id,
        user: userId,
        role: 'assistant',
        content: text,
        citations,
        tools: toolsUsed,
        proposals,
        inputTokens,
        outputTokens,
        provider: providerName,
        model,
        error: errorMsg,
      },
    })
    messageId = saved.id
    await payload.update({ collection: 'ai-conversations', id: conversation.id, overrideAccess: true, data: { lastMessageAt: new Date().toISOString(), messageCount: (conversation.messageCount ?? 0) + 2 } })
  } catch (err) {
    payload.logger.error({ err, msg: 'ai: saving the answer failed' })
  }

  if (citations.length) yield { t: 'sources', citations }
  if (errorMsg) yield { t: 'error', message: errorMsg }
  yield { t: 'done', messageId }

  // Saved chats are a source for the same person later (best effort, after the answer is out).
  if (!errorMsg && text && messageId) {
    try {
      const pair = `پرسش: ${redactText(input.message, cfg.privacy)}\nپاسخ: ${redactText(text, cfg.privacy)}`.slice(0, 2000)
      const e = await embedTexts(payload, cfg, [pair])
      if (e.vectors[0]) await insertChunks(payload, [{ tenantId, sourceType: 'chat', sourceId: conversation.id, ownerId: userId, title: conversation.title, ordinal: messageId, content: pair, model: e.model, embedding: e.vectors[0] }])
    } catch (err) {
      payload.logger.error({ err, msg: 'ai: indexing the chat failed' })
    }
  }
}
