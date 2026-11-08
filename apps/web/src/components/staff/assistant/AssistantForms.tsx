'use client'

import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react'
import type { AiActionState } from '../../../app/(frontend)/staff/(desk)/assistant/actions'
import { btnDanger, btnPrimary, btnSecondary, ErrorText, fieldInput, Notice } from '../ui'

type Action = (prev: AiActionState, form: FormData) => Promise<AiActionState>

function Feedback({ state }: { state: AiActionState }) {
  if (!state) return null
  return state.ok ? <Notice tone="ok">{state.message}</Notice> : <ErrorText>{state.message}</ErrorText>
}

/** A form bound to a server action; reloads the page on success when the action asks for it (fresh server data). */
export function ActionForm({ action, children, submit, tone = 'primary', className, confirm }: { action: Action; children?: ReactNode; submit: string; tone?: 'primary' | 'secondary' | 'danger'; className?: string; confirm?: string }) {
  const [state, run, pending] = useActionState<AiActionState, FormData>(action, null)
  const shown = useRef<AiActionState>(null)
  useEffect(() => {
    if (state?.reload && state !== shown.current) {
      shown.current = state
      const t = setTimeout(() => window.location.reload(), state.ok ? 600 : 1500)
      return () => clearTimeout(t)
    }
  }, [state])
  const cls = tone === 'danger' ? btnDanger() : tone === 'secondary' ? btnSecondary() : btnPrimary()
  return (
    <form
      action={run}
      className={className ?? 'grid gap-3'}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault()
      }}
    >
      {children}
      <div>
        <button type="submit" className={cls} disabled={pending}>
          {pending ? 'لطفاً صبر کنید…' : submit}
        </button>
      </div>
      <div aria-live="polite">
        <Feedback state={state} />
      </div>
    </form>
  )
}

/** Multipart upload to /api/ai/documents (route handler, so large files skip the server-action body limit). */
export function UploadForm({ accept }: { accept: string }) {
  const [state, setState] = useState<AiActionState>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        if (!(data.get('file') instanceof File) || (data.get('file') as File).size === 0) {
          setState({ ok: false, message: 'یک فایل انتخاب کنید.' })
          return
        }
        setBusy(true)
        setState(null)
        try {
          const res = await fetch('/api/ai/documents', { method: 'POST', body: data })
          const body = (await res.json().catch(() => ({}))) as { ok?: boolean; chunks?: number; error?: string; message?: string }
          if (body.ok) {
            setState({ ok: true, message: `سند خوانده و در ${new Intl.NumberFormat('fa-IR').format(body.chunks ?? 0)} بخش نمایه شد.` })
            form.reset()
            setTimeout(() => window.location.reload(), 700)
          } else setState({ ok: false, message: body.error ?? body.message ?? 'بارگذاری ناموفق بود.' })
        } catch {
          setState({ ok: false, message: 'اتصال برقرار نشد؛ دوباره امتحان کنید.' })
        } finally {
          setBusy(false)
        }
      }}
    >
      <label className="grid gap-1.5 text-sm font-bold">
        فایل (PDF، Word، Excel، CSV یا متن؛ حداکثر ۱۰ مگابایت)
        <input name="file" type="file" accept={accept} className={fieldInput} required />
      </label>
      <label className="grid gap-1.5 text-sm font-bold">
        عنوان (اختیاری)
        <input name="title" type="text" maxLength={200} className={fieldInput} placeholder="مثلاً آیین‌نامهٔ آموزشی" />
      </label>
      <div>
        <button type="submit" className={btnPrimary()} disabled={busy}>
          {busy ? 'در حال خواندن و نمایه‌سازی…' : 'بارگذاری و نمایه‌سازی'}
        </button>
      </div>
      <div aria-live="polite">
        <Feedback state={state} />
      </div>
    </form>
  )
}
