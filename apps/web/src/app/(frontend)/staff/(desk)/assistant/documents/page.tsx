import { formatJalali, toPersianDigits } from '@edvora/core'
import type { Metadata } from 'next'
import { ActionForm, UploadForm } from '../../../../../../components/staff/assistant/AssistantForms'
import { AssistantHeader } from '../../../../../../components/staff/assistant/AssistantTabs'
import { Card, Notice } from '../../../../../../components/staff/ui'
import { embeddingModelFor } from '../../../../../../lib/ai/embed'
import { requireAi } from '../../../../../../lib/ai/pageAccess'
import { ACCEPTED } from '../../../../../../lib/ai/parse'
import { loadAiConfig } from '../../../../../../lib/ai/settings'
import { deleteDocumentAction, reindexAction } from '../actions'

export const metadata: Metadata = { title: 'اسناد دانش · دستیار هوشمند' }

const STATUS = { processing: 'در حال پردازش', ready: 'آماده', failed: 'ناموفق' } as const
const kb = (n: number) => toPersianDigits(Math.max(1, Math.round(n / 1024)).toLocaleString('en-US'))

/** E-046 · knowledge base: upload (parsed, chunked and embedded on the server), list, delete, re-index. ai.manage. */
export default async function AssistantDocuments() {
  const s = await requireAi('/staff/assistant/documents', 'manage')
  const payload = s.req.payload
  const [cfg, docs] = await Promise.all([
    loadAiConfig(payload, s.tenant.id),
    payload.find({ collection: 'ai-documents', where: { tenant: { equals: s.tenant.id } }, sort: '-createdAt', limit: 200, depth: 0, overrideAccess: true }),
  ])
  const model = embeddingModelFor(cfg)
  const stale = docs.docs.filter((d) => d.status === 'ready' && d.embeddingModel && d.embeddingModel !== model).length

  return (
    <div className="grid max-w-5xl gap-6">
      <AssistantHeader current="documents" manage />
      <Card className="grid gap-4">
        <h2 className="text-lg font-black">بارگذاری سند</h2>
        <p className="leading-8 text-muted">
          متن فایل روی سرور خوانده، به بخش‌های کوچک تقسیم و برای جست‌وجو نمایه می‌شود. خود فایل نگه داشته نمی‌شود. هر کسی که به دستیار دسترسی دارد می‌تواند از محتوای این اسناد پاسخ بگیرد؛ اطلاعات محرمانهٔ دانشجویان را بارگذاری نکنید.
        </p>
        <UploadForm accept={ACCEPTED} />
      </Card>

      {stale ? (
        <Notice tone="warn">
          {toPersianDigits(stale)} سند با مدل نمایه‌سازی دیگری ساخته شده و تا بازسازی نمایه در جست‌وجو دیده نمی‌شود.
        </Notice>
      ) : null}

      <Card className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-black">اسناد ({toPersianDigits(docs.totalDocs)})</h2>
          <ActionForm action={reindexAction} submit="بازسازی نمایه با مدل فعلی" tone="secondary" className="grid gap-2" />
        </div>
        <p className="text-sm text-muted">مدل نمایه‌سازی فعلی: {model}</p>
        {docs.docs.length === 0 ? (
          <p className="text-muted">هنوز سندی بارگذاری نشده است.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-start text-muted">
                  <th className="p-2 text-start">عنوان</th>
                  <th className="p-2 text-start">وضعیت</th>
                  <th className="p-2 text-start">بخش‌ها</th>
                  <th className="p-2 text-start">تاریخ</th>
                  <th className="p-2 text-start">
                    <span className="sr-only">حذف</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {docs.docs.map((d) => (
                  <tr key={d.id} className="border-b border-line align-top">
                    <td className="p-2">
                      <span className="font-bold">{d.title}</span>
                      <span className="block text-xs text-muted" dir="ltr">
                        {d.filename} · {kb(d.size ?? 0)} KB
                      </span>
                    </td>
                    <td className="p-2">
                      {STATUS[d.status]}
                      {d.error ? <span className="block text-xs text-danger">{d.error}</span> : null}
                    </td>
                    <td className="p-2">{toPersianDigits(d.chunkCount ?? 0)}</td>
                    <td className="p-2">{formatJalali(d.createdAt)}</td>
                    <td className="p-2">
                      <ActionForm action={deleteDocumentAction} submit="حذف" tone="danger" className="grid gap-1" confirm={`«${d.title}» و نمایه‌اش حذف شود؟ این کار برگشت‌پذیر نیست.`}>
                        <input type="hidden" name="id" value={d.id} />
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
