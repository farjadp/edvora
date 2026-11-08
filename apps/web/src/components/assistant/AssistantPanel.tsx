'use client'

import { toPersianDigits } from '@edvora/core/digits'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import './assistant.css'

/** E-046 · the chat (ADR 018): streamed answers, cited sources, confirm cards. Talks only to /api/ai/* on this site. */
export type Citation = { n: number; kind: 'document' | 'memory' | 'chat'; title: string }
export type Proposal = { id: number; label: string; summary: string; expiresAt: string; status?: 'pending' | 'executed' | 'rejected' | 'failed' | 'expired'; message?: string; href?: string | null }
export type ChatMessage = { key: string; role: 'user' | 'assistant'; content: string; citations?: Citation[]; proposals?: Proposal[]; memories?: string[]; tools?: string[]; error?: string | null; streaming?: boolean }

export type PanelProps = {
  mode: 'drawer' | 'page'
  conversationId?: number | null
  initialMessages?: ChatMessage[]
  /** Shown under the input: what is redacted before anything is sent. */
  privacyNote: string
  enabled: boolean
  sectionHref?: string
  onClose?: () => void
  /** /admin page path is more useful than the drawer's own location when embedded. */
  headerExtra?: ReactNode
}

const KIND: Record<Citation['kind'], string> = { document: 'سند', memory: 'یادداشت حافظه', chat: 'گفت‌وگوی پیشین' }
const SUGGESTIONS = ['سیاست بازپرداخت شهریه چیست؟', 'فهرست دوره‌های فعال را نشان بده', 'سرنخ‌هایی که امروز باید پیگیری کنم کدام‌اند؟']

let seq = 0
const key = () => `m${Date.now()}-${seq++}`

function ProposalCard({ p, onChange }: { p: Proposal; onChange: (next: Proposal) => void }) {
  const [busy, setBusy] = useState(false)
  const status = p.status ?? 'pending'
  const decide = async (decision: 'confirm' | 'reject') => {
    setBusy(true)
    try {
      const res = await fetch(`/api/ai/actions/${p.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision }) })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; status?: Proposal['status']; message?: string; href?: string | null }
      if (body.ok) onChange({ ...p, status: body.status ?? (decision === 'confirm' ? 'executed' : 'rejected'), message: undefined, href: body.href ?? null })
      else onChange({ ...p, status: body.status ?? status, message: body.message ?? 'ثبت تصمیم ناموفق بود.' })
    } catch {
      onChange({ ...p, message: 'اتصال برقرار نشد؛ دوباره امتحان کنید.' })
    } finally {
      setBusy(false)
    }
  }
  const title = status === 'executed' ? `انجام شد: ${p.label}` : status === 'rejected' ? `رد شد: ${p.label}` : status === 'pending' ? `پیشنهاد: ${p.label}` : `${p.label} (${status === 'expired' ? 'منقضی' : 'ناموفق'})`
  return (
    <div className={`ai-card ${status === 'executed' ? 'ai-card--done' : status === 'pending' ? '' : 'ai-card--off'}`} role="group" aria-label={title} data-proposal={p.id}>
      <h3>{title}</h3>
      <p>{p.summary}</p>
      {status === 'pending' ? (
        <div className="ai-row">
          <button type="button" className="ai-btn ai-btn--primary" disabled={busy} onClick={() => decide('confirm')}>
            تأیید و انجام
          </button>
          <button type="button" className="ai-btn" disabled={busy} onClick={() => decide('reject')}>
            رد
          </button>
          <span className="ai-note">تا تأیید نکنید چیزی تغییر نمی‌کند؛ با دسترسی خود شما انجام و در گزارش ممیزی ثبت می‌شود.</span>
        </div>
      ) : null}
      {status === 'executed' && p.href ? (
        <div className="ai-row">
          <a className="ai-link" href={p.href}>
            دیدن رکورد
          </a>
        </div>
      ) : null}
      {p.message ? (
        <p className="ai-note" role="alert">
          {p.message}
        </p>
      ) : null}
    </div>
  )
}

function Message({ m, onProposal }: { m: ChatMessage; onProposal: (p: Proposal) => void }) {
  if (m.role === 'user')
    return (
      <div className="ai-msg ai-msg--user" dir="auto">
        {m.content}
      </div>
    )
  return (
    <div className="ai-msg ai-msg--assistant" data-role="assistant">
      {m.tools?.length ? (
        <div className="ai-tools" aria-label="کارهای انجام‌شده">
          {m.tools.map((t, i) => (
            <span key={i} className="ai-chip">
              {t}
            </span>
          ))}
        </div>
      ) : null}
      <p className={m.streaming ? 'ai-text ai-cursor' : 'ai-text'} dir="auto">
        {m.content}
      </p>
      {m.proposals?.map((p) => <ProposalCard key={p.id} p={p} onChange={onProposal} />)}
      {m.memories?.map((t, i) => (
        <div key={i} className="ai-card ai-card--off">
          <h3>یادداشت حافظهٔ پیشنهادی</h3>
          <p>{t}</p>
          <p className="ai-note">مدیر آکادمی آن را در «دستیار هوشمند › حافظه» تأیید یا ویرایش می‌کند؛ تا آن زمان استفاده نمی‌شود.</p>
        </div>
      ))}
      {m.error ? (
        <div className="ai-msg--error" role="alert">
          {m.error}
        </div>
      ) : null}
      {m.citations?.length ? (
        <div className="ai-sources">
          منبع‌ها:
          <ol>
            {m.citations.map((c) => (
              <li key={c.n}>
                <b>[{toPersianDigits(c.n)}]</b> {KIND[c.kind]}: {c.title}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  )
}

type Event =
  | { t: 'start'; conversationId: number; title: string }
  | { t: 'text'; d: string }
  | { t: 'tool'; name: string; label: string }
  | { t: 'proposal'; proposal: Proposal }
  | { t: 'memory'; id: number; text: string }
  | { t: 'sources'; citations: Citation[] }
  | { t: 'done'; messageId: number | null }
  | { t: 'error'; message: string }

export function AssistantPanel({ mode, conversationId: initialId = null, initialMessages = [], privacyNote, enabled, sectionHref, onClose, headerExtra }: PanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [conversationId, setConversationId] = useState<number | null>(initialId)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const log = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [messages])
  useEffect(() => {
    box.current?.focus()
  }, [])
  useEffect(() => () => abort.current?.abort(), [])

  const patchLast = useCallback((fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((list) => {
      const out = [...list]
      const i = out.length - 1
      if (i >= 0 && out[i]!.role === 'assistant') out[i] = fn(out[i]!)
      return out
    })
  }, [])

  const updateProposal = (p: Proposal) => setMessages((list) => list.map((m) => (m.proposals?.some((x) => x.id === p.id) ? { ...m, proposals: m.proposals.map((x) => (x.id === p.id ? p : x)) } : m)))

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || busy) return
    setInput('')
    setBusy(true)
    setMessages((list) => [...list, { key: key(), role: 'user', content: message }, { key: key(), role: 'assistant', content: '', streaming: true }])
    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      const page = mode === 'drawer' ? { path: window.location.pathname, title: document.title.slice(0, 200) } : null
      const res = await fetch('/api/ai/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, conversationId, page }), signal: ctrl.signal })
      if (!res.ok || !res.body) {
        patchLast((m) => ({ ...m, streaming: false, error: res.status === 403 ? 'دسترسی شما به دستیار هوشمند در این آکادمی برقرار نیست.' : res.status === 401 ? 'دوباره وارد شوید.' : 'پاسخ دریافت نشد؛ دوباره امتحان کنید.' }))
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        buf += decoder.decode(value ?? new Uint8Array(), { stream: !done })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          let e: Event
          try {
            e = JSON.parse(line) as Event
          } catch {
            continue
          }
          if (e.t === 'start') setConversationId(e.conversationId)
          else if (e.t === 'text') patchLast((m) => ({ ...m, content: m.content + e.d }))
          else if (e.t === 'tool') patchLast((m) => ({ ...m, tools: [...(m.tools ?? []), e.label] }))
          else if (e.t === 'proposal') patchLast((m) => ({ ...m, proposals: [...(m.proposals ?? []), { ...e.proposal, status: 'pending' }] }))
          else if (e.t === 'memory') patchLast((m) => ({ ...m, memories: [...(m.memories ?? []), e.text] }))
          else if (e.t === 'sources') patchLast((m) => ({ ...m, citations: e.citations }))
          else if (e.t === 'error') patchLast((m) => ({ ...m, error: e.message }))
        }
        if (done) break
      }
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') patchLast((m) => ({ ...m, error: 'اتصال قطع شد؛ دوباره امتحان کنید.' }))
    } finally {
      patchLast((m) => ({ ...m, streaming: false }))
      setBusy(false)
      abort.current = null
      box.current?.focus()
    }
  }

  const newChat = () => {
    abort.current?.abort()
    setMessages([])
    setConversationId(null)
    box.current?.focus()
  }

  return (
    <section className={mode === 'drawer' ? 'ai-drawer' : 'ai-page'} aria-label="دستیار هوشمند" role={mode === 'drawer' ? 'dialog' : undefined}>
      <header className="ai-head">
        <h2>
          دستیار هوشمند
          <span className="ai-sub">{mode === 'drawer' ? 'در حد دسترسی‌های شما' : 'پاسخ از اسناد و داده‌های همین آکادمی، در حد دسترسی‌های شما'}</span>
        </h2>
        {headerExtra}
        <button type="button" className="ai-btn ai-btn--quiet" onClick={newChat} disabled={busy && !abort.current}>
          گفت‌وگوی تازه
        </button>
        {sectionHref ? (
          <a className="ai-btn ai-btn--quiet" href={sectionHref}>
            همهٔ گفت‌وگوها
          </a>
        ) : null}
        {onClose ? (
          <button type="button" className="ai-btn ai-btn--quiet" onClick={onClose} aria-label="بستن دستیار">
            ✕
          </button>
        ) : null}
      </header>

      <div className="ai-log" ref={log} aria-live="polite" aria-busy={busy}>
        {messages.length === 0 ? (
          <div className="ai-empty">
            {enabled ? (
              <>
                از دستیار بپرسید یا کاری بخواهید؛ هر تغییری اول به شکل پیشنهاد نشان داده می‌شود و تا شما تأیید نکنید انجام نمی‌شود.
                <ul>
                  {SUGGESTIONS.map((s) => (
                    <li key={s}>
                      <button type="button" onClick={() => send(s)}>
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              'دستیار هوشمند در این آکادمی هنوز روشن نشده است. مدیر آکادمی آن را در «دستیار هوشمند › تنظیمات» روشن می‌کند.'
            )}
          </div>
        ) : (
          messages.map((m) => <Message key={m.key} m={m} onProposal={updateProposal} />)
        )}
      </div>

      <div className="ai-compose">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send(input)
          }}
        >
          <label htmlFor={`ai-input-${mode}`} className="ai-sr">
            پیام به دستیار
          </label>
          <textarea
            id={`ai-input-${mode}`}
            ref={box}
            className="ai-input"
            dir="auto"
            rows={1}
            value={input}
            maxLength={4000}
            placeholder={enabled ? 'پیام خود را بنویسید…' : 'دستیار خاموش است'}
            disabled={!enabled}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void send(input)
              } else if (e.key === 'Escape' && onClose) onClose()
            }}
          />
          {busy ? (
            <button type="button" className="ai-btn" onClick={() => abort.current?.abort()}>
              توقف
            </button>
          ) : (
            <button type="submit" className="ai-btn ai-btn--primary" disabled={!enabled || !input.trim()}>
              بفرست
            </button>
          )}
        </form>
        <p className="ai-honest">
          دستیار با اسناد و یادداشت‌های همین آکادمی پاسخ می‌دهد (بازیابی، نه آموزش مدل). {privacyNote}
        </p>
      </div>
    </section>
  )
}
