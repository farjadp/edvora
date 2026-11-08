import { formatJalali, toPersianDigits } from '@edvora/core'
import type { Metadata } from 'next'
import { AssistantPanel, type ChatMessage, type Citation, type Proposal } from '../../../../../components/assistant/AssistantPanel'
import { AssistantHeader } from '../../../../../components/staff/assistant/AssistantTabs'
import { fieldInput, linkClass } from '../../../../../components/staff/ui'
import { requireAi } from '../../../../../lib/ai/pageAccess'
import { targetHref } from '../../../../../lib/ai/proposals'
import { loadAiConfig } from '../../../../../lib/ai/settings'
import { privacyLine } from '../../../../../lib/ai/view'
import type { Where } from 'payload'
import type { AiAction } from '../../../../../payload-types'

export const metadata: Metadata = { title: 'دستیار هوشمند' }

type Search = Promise<{ c?: string; q?: string }>

/** E-046 · «دستیار هوشمند»: the person's own saved conversations (searchable) and the chat. */
export default async function AssistantHome({ searchParams }: { searchParams: Search }) {
  const s = await requireAi('/staff/assistant')
  const { c, q } = await searchParams
  const payload = s.req.payload
  const mine: Where[] = [{ tenant: { equals: s.tenant.id } }, { user: { equals: s.user.id } }]
  const query = q?.trim().slice(0, 100) ?? ''

  let where: Where = { and: mine }
  if (query) {
    const hits = await payload.find({ collection: 'ai-messages', where: { and: [...mine, { content: { like: query } }] }, limit: 200, depth: 0, overrideAccess: true, select: { conversation: true } })
    const ids = [...new Set(hits.docs.map((m) => (typeof m.conversation === 'object' ? m.conversation.id : m.conversation)))]
    where = { and: [...mine, { or: [{ title: { like: query } }, { id: { in: ids.length ? ids : [-1] } }] }] }
  }
  const [cfg, list] = await Promise.all([loadAiConfig(payload, s.tenant.id), payload.find({ collection: 'ai-conversations', where, sort: '-lastMessageAt', limit: 50, depth: 0, overrideAccess: true })])

  const openId = Number(c) || null
  let initial: ChatMessage[] = []
  let open: (typeof list.docs)[number] | undefined
  if (openId) {
    open = (await payload.find({ collection: 'ai-conversations', where: { and: [...mine, { id: { equals: openId } }] }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
    if (open) {
      const msgs = await payload.find({ collection: 'ai-messages', where: { and: [...mine, { conversation: { equals: open.id } }] }, sort: 'createdAt', limit: 200, depth: 1, overrideAccess: true })
      initial = msgs.docs.map((m) => ({
        key: `db${m.id}`,
        role: m.role,
        content: m.content ?? '',
        error: m.error ?? null,
        citations: (m.citations as Citation[] | null) ?? [],
        proposals: (m.proposals ?? [])
          .filter((p): p is AiAction => typeof p === 'object')
          .map((p): Proposal => ({ id: p.id, label: p.kind, summary: p.summary, expiresAt: p.expiresAt, status: p.status, href: p.targetCollection && p.targetId ? targetHref({ collection: p.targetCollection, id: p.targetId }) : null })),
      }))
    }
  }

  return (
    <div className="grid max-w-6xl gap-6">
      <AssistantHeader current="chats" manage={s.manage} />
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="grid content-start gap-3" aria-label="گفت‌وگوهای ذخیره‌شده">
          <form method="get" role="search" className="grid gap-1.5">
            <label htmlFor="ai-q" className="text-sm font-bold">
              جست‌وجو در گفت‌وگوها
            </label>
            <input id="ai-q" name="q" type="search" defaultValue={query} className={fieldInput} placeholder="واژه‌ای از پرسش یا پاسخ" />
          </form>
          <a href="/staff/assistant" className={linkClass}>
            + گفت‌وگوی تازه
          </a>
          {list.docs.length === 0 ? (
            <p className="text-sm leading-7 text-muted">{query ? 'گفت‌وگویی با این واژه پیدا نشد.' : 'هنوز گفت‌وگویی ذخیره نشده است.'}</p>
          ) : (
            <ul className="grid gap-1">
              {list.docs.map((d) => (
                <li key={d.id}>
                  <a
                    href={`/staff/assistant?c=${d.id}${query ? `&q=${encodeURIComponent(query)}` : ''}`}
                    aria-current={d.id === open?.id ? 'page' : undefined}
                    className={`block rounded-lg px-3 py-2 text-sm leading-6 hover:bg-sunken ${d.id === open?.id ? 'bg-wash font-bold' : ''}`}
                  >
                    {d.title}
                    <span className="block text-xs text-muted">
                      {d.lastMessageAt ? formatJalali(d.lastMessageAt) : ''} · {toPersianDigits(d.messageCount ?? 0)} پیام
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <AssistantPanel key={open?.id ?? 'new'} mode="page" conversationId={open?.id ?? null} initialMessages={initial} privacyNote={privacyLine(cfg.privacy)} enabled={cfg.enabled} />
      </div>
    </div>
  )
}
