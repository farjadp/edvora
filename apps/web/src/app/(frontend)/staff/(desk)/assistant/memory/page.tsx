import { formatJalali, toPersianDigits } from '@edvora/core'
import type { Metadata } from 'next'
import { ActionForm } from '../../../../../../components/staff/assistant/AssistantForms'
import { AssistantHeader } from '../../../../../../components/staff/assistant/AssistantTabs'
import { Card, fieldInput } from '../../../../../../components/staff/ui'
import { requireAi } from '../../../../../../lib/ai/pageAccess'
import { loadAiConfig } from '../../../../../../lib/ai/settings'
import type { AiMemory, User } from '../../../../../../payload-types'
import { addMemoryAction, decideMemoryAction } from '../actions'

export const metadata: Metadata = { title: 'حافظه · دستیار هوشمند' }

const who = (u: AiMemory['proposedBy']) => (u && typeof u === 'object' ? ((u as User).name ?? (u as User).email) : '—')

function MemoryRow({ m }: { m: AiMemory }) {
  const pending = m.status === 'proposed'
  return (
    <li className="grid gap-3 border-b border-line pb-4" data-memory={m.id}>
      <ActionForm action={decideMemoryAction} submit={pending ? 'تأیید' : 'ذخیرهٔ ویرایش'} className="grid gap-2">
        <input type="hidden" name="id" value={m.id} />
        <input type="hidden" name="decision" value="approve" />
        <label className="grid gap-1 text-sm font-bold">
          {pending ? 'متن پیشنهادی (پیش از تأیید می‌توانید ویرایش کنید)' : 'متن یادداشت'}
          <textarea name="text" defaultValue={m.text} rows={2} maxLength={800} className={fieldInput} />
        </label>
        <span className="text-xs text-muted">
          {pending ? 'پیشنهاد' : 'تأیید'} · {who(pending ? m.proposedBy : m.decidedBy)} · {formatJalali(m.decidedAt ?? m.createdAt)}
        </span>
      </ActionForm>
      <div className="flex flex-wrap gap-2">
        {pending ? (
          <ActionForm action={decideMemoryAction} submit="رد" tone="secondary" className="grid gap-1">
            <input type="hidden" name="id" value={m.id} />
            <input type="hidden" name="decision" value="reject" />
          </ActionForm>
        ) : null}
        <ActionForm action={decideMemoryAction} submit="حذف" tone="danger" className="grid gap-1" confirm="این یادداشت حذف شود؟">
          <input type="hidden" name="id" value={m.id} />
          <input type="hidden" name="decision" value="delete" />
        </ActionForm>
      </div>
    </li>
  )
}

/** E-046 · memory notes: proposed by the assistant from chats, approved / edited / deleted by a manager. */
export default async function AssistantMemory() {
  const s = await requireAi('/staff/assistant/memory', 'manage')
  const find = (status: 'proposed' | 'approved') =>
    s.req.payload.find({ collection: 'ai-memories', where: { and: [{ tenant: { equals: s.tenant.id } }, { status: { equals: status } }] }, sort: '-createdAt', limit: 200, depth: 1, overrideAccess: true })
  const [cfg, proposed, approved] = await Promise.all([loadAiConfig(s.req.payload, s.tenant.id), find('proposed'), find('approved')])
  return (
    <div className="grid max-w-4xl gap-6">
      <AssistantHeader current="memory" name={cfg.name} manage intro={`یادداشت‌های حافظه واقعیت‌های ماندگار آکادمی‌اند (مثلاً سیاست بازپرداخت). ${cfg.name} می‌تواند از دل گفت‌وگوها یادداشت پیشنهاد کند؛ فقط یادداشت‌هایی که شما تأیید کنید در پاسخ‌ها به کار می‌روند و به‌عنوان منبع نشان داده می‌شوند.`} />
      <Card className="grid gap-4">
        <h2 className="text-lg font-black">در انتظار تأیید ({toPersianDigits(proposed.totalDocs)})</h2>
        {proposed.docs.length ? <ul className="grid gap-4">{proposed.docs.map((m) => <MemoryRow key={m.id} m={m} />)}</ul> : <p className="text-muted">پیشنهادی در انتظار نیست.</p>}
      </Card>
      <Card className="grid gap-4">
        <h2 className="text-lg font-black">یادداشت‌های تأییدشده ({toPersianDigits(approved.totalDocs)})</h2>
        {approved.docs.length ? <ul className="grid gap-4">{approved.docs.map((m) => <MemoryRow key={m.id} m={m} />)}</ul> : <p className="text-muted">هنوز یادداشتی تأیید نشده است.</p>}
      </Card>
      <Card className="grid gap-4">
        <h2 className="text-lg font-black">افزودن یادداشت</h2>
        <ActionForm action={addMemoryAction} submit="افزودن و تأیید">
          <label className="grid gap-1 text-sm font-bold">
            متن
            <textarea name="text" rows={3} maxLength={800} required minLength={5} className={fieldInput} placeholder="مثلاً: شهریه تا ۱۴ روز پس از ثبت‌نام قابل بازپرداخت است." />
          </label>
        </ActionForm>
      </Card>
    </div>
  )
}
