import { formatJalali, toPersianDigits } from '@edvora/core'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Card, Notice } from '../../../../../components/staff/ui'
import { CreateConnectionForm, RestForm, RevokeButton, UploadBundleForm } from '../../../../../components/staff/import/ImportForms'
import { btnSecondary, linkClass } from '../../../../../components/staff/ui'
import { getPayloadClient } from '../../../../../lib/payload'
import { canRunImport, requireImport } from '../../../../../lib/wpimport/access'
import { MODE_LABELS, STATUS_LABELS } from '../../../../../lib/wpimport/labels'
import { connectionUsable } from '../../../../../lib/wpimport/service'

export const metadata: Metadata = { title: 'انتقال از وردپرس' }

const USABLE_LABEL = { ok: 'فعال', expired: 'منقضی', revoked: 'لغو شده' } as const

/** E-032 · «انتقال از وردپرس»: choose a method, manage connections, list past imports (academy staff, import.view). */
export default async function ImportHome() {
  const s = await requireImport('/staff/import')
  const run = canRunImport(s)
  const payload = await getPayloadClient()
  const [jobs, connections, h] = await Promise.all([
    payload.find({ collection: 'import-jobs', where: { tenant: { equals: s.tenant.id } }, sort: '-createdAt', limit: 30, depth: 0, overrideAccess: true }),
    payload.find({ collection: 'import-connections', where: { tenant: { equals: s.tenant.id } }, sort: '-createdAt', limit: 20, depth: 0, overrideAccess: true }),
    headers(),
  ])
  const host = h.get('host') ?? 'localhost'
  const proto = /^(localhost|127\.0\.0\.1)(:\d+)?$|\.localhost(:\d+)?$/.test(host) ? 'http' : 'https'
  const siteUrl = `${proto}://${host}`

  return (
    <div className="grid max-w-5xl gap-6">
      <header className="grid gap-2">
        <h1 className="text-2xl font-black">انتقال از وردپرس</h1>
        <p className="max-w-3xl leading-8 text-muted">
          کاربران، دوره‌ها، جلسه‌ها، سفارش‌ها، ثبت‌نام‌ها و پیشرفت دانشجویان سایت وردپرسی‌تان را به ادوورا بیاورید. پیش از نوشتن هر چیزی، گزارش کامل نشان داده می‌شود و تا شما تأیید نکنید چیزی وارد نمی‌شود. از سایت وردپرس هیچ چیزی حذف نمی‌شود.
        </p>
      </header>

      {run ? (
        <>
          <Card className="grid gap-4">
            <h2 className="text-lg font-black">۱. افزونهٔ Edvora Migrator (پیشنهادی)</h2>
            <ol className="grid list-decimal gap-2 ps-5 leading-8">
              <li>
                <a href="/staff/import/plugin" className={linkClass}>
                  فایل افزونه را دریافت کنید
                </a>{' '}
                و در وردپرس از «افزونه‌ها › افزودن › بارگذاری» نصب و فعال کنید.
              </li>
              <li>یک اتصال بسازید؛ نشانی، شناسه و کد محرمانه را در «ابزارها › Edvora Migrator» وارد کنید.</li>
              <li>در افزونه «ارسال به ادوورا» را بزنید. اگر میزبان سایت اجازهٔ ارسال نمی‌دهد، «دریافت فایل» را بزنید و فایل را در بخش ۲ بارگذاری کنید.</li>
            </ol>
            <CreateConnectionForm siteUrl={siteUrl} />
          </Card>

          <Card className="grid gap-4">
            <h2 className="text-lg font-black">۲. بارگذاری فایل خروجی افزونه</h2>
            <p className="leading-8 text-muted">فایل با کد اتصالِ همین آکادمی امضا شده باشد؛ فایل آکادمی دیگر پذیرفته نمی‌شود.</p>
            <UploadBundleForm />
          </Card>

          <Card className="grid gap-4">
            <details className="grid gap-4">
              <summary className="cursor-pointer text-lg font-black">۳. بدون افزونه (REST، با محدودیت)</summary>
              <div className="mt-4 grid gap-4">
                <Notice tone="warn">اگر شمارهٔ موبایل دانشجویان در افزونه‌هایی مثل Digits ذخیره شده باشد، این روش آن‌ها را نمی‌بیند و آن دانشجویان نگه داشته می‌شوند. هر وقت ممکن است از افزونه استفاده کنید.</Notice>
                <RestForm />
              </div>
            </details>
          </Card>
        </>
      ) : (
        <Notice>برای شروع انتقال، دسترسی «اجرای انتقال از وردپرس» لازم است. گزارش انتقال‌های قبلی را در زیر می‌بینید.</Notice>
      )}

      <section className="grid gap-3" aria-labelledby="connections-title">
        <h2 id="connections-title" className="text-lg font-black">
          اتصال‌ها
        </h2>
        {connections.docs.length === 0 ? (
          <p className="text-muted">هنوز اتصالی ساخته نشده است.</p>
        ) : (
          <ul className="grid gap-3">
            {connections.docs.map((c) => {
              const state = connectionUsable(c)
              return (
                <li key={c.id} className="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="grid min-w-0 gap-1">
                    <p className="font-bold">
                      {c.label} <span className="text-sm font-normal text-muted">· {USABLE_LABEL[state]}</span>
                    </p>
                    <p dir="ltr" className="truncate text-end font-latin text-sm text-muted">{c.connectionId}</p>
                    <p className="text-sm text-muted">
                      فقط برای همین آکادمی و همین انتقال · ساخته‌شده {formatJalali(c.createdAt)} · {state === 'revoked' ? `لغو در ${formatJalali(c.revokedAt!)}` : `اعتبار تا ${formatJalali(c.expiresAt, 'd MMMM yyyy، HH:mm')}`}
                      {c.lastUsedAt ? ` · آخرین استفاده ${formatJalali(c.lastUsedAt, 'd MMMM، HH:mm')}` : ''}
                    </p>
                  </div>
                  {run && state === 'ok' ? <RevokeButton connectionId={c.connectionId} /> : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="jobs-title">
        <h2 id="jobs-title" className="text-lg font-black">
          انتقال‌ها
        </h2>
        {jobs.docs.length === 0 ? (
          <p className="text-muted">هنوز انتقالی انجام نشده است.</p>
        ) : (
          <ul className="grid gap-3" data-testid="import-jobs">
            {jobs.docs.map((j) => (
              <li key={j.id}>
                <a href={`/staff/import/${j.id}`} className={`${btnSecondary(true)} h-auto min-h-12 justify-between py-3`}>
                  <span className="min-w-0 truncate text-start">
                    {j.label ?? `انتقال ${toPersianDigits(j.id)}`} <span className="font-normal text-muted">· {MODE_LABELS[j.mode] ?? j.mode}</span>
                  </span>
                  <span className="shrink-0 text-sm font-normal text-muted">
                    {STATUS_LABELS[j.status] ?? j.status} · {formatJalali(j.createdAt)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
