import { formatJalali, toPersianDigits } from '@edvora/core'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { sandboxConfig } from '../../../../access/sandbox'
import { Card, btnDanger, linkClass } from '../../../../components/staff/ui'
import { requirePlatformAdmin } from '../../../../lib/sandbox/ops'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: { absolute: 'آکادمی‌های آزمایشی · ادورا' }, robots: { index: false, follow: false } }

const STATUS_FA: Record<string, string> = { creating: 'در حال ساخت', active: 'فعال', failed: 'ناموفق', purged: 'حذف شده' }

/** /demo/ops — Edvora super-admin only (O1): count vs cap, list, delete now, leads export. 404 for everyone else. */
export default async function DemoOpsPage() {
  const admin = await requirePlatformAdmin()
  if (!admin) notFound()
  const { payload } = admin
  const cfg = sandboxConfig()
  const now = new Date()
  const [rows, leads] = await Promise.all([
    payload.find({ collection: 'demo-sandboxes', sort: '-createdAt', limit: 100, depth: 0, overrideAccess: true }),
    payload.count({ collection: 'demo-leads', overrideAccess: true }),
  ])
  const active = rows.docs.filter((d) => (d.status === 'active' || d.status === 'creating') && new Date(d.expiresAt) > now).length
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8">
      <h1 className="text-2xl font-black">آکادمی‌های آزمایشی</h1>
      <Card>
        <p className="leading-8">
          فعال: {toPersianDigits(active)} از {toPersianDigits(cfg.maxActive)} · ساخت: {cfg.enabled ? 'روشن' : 'خاموش (SANDBOX_ENABLED)'} · سرنخ‌ها:{' '}
          {toPersianDigits(leads.totalDocs)} ·{' '}
          <a className={linkClass} href="/demo/ops/leads.csv">
            خروجی CSV سرنخ‌ها
          </a>
        </p>
      </Card>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[44rem] text-start text-sm">
          <thead className="bg-sunken text-muted">
            <tr>
              <th className="p-3 text-start">نامک</th>
              <th className="p-3 text-start">وضعیت</th>
              <th className="p-3 text-start">ساخت</th>
              <th className="p-3 text-start">پایان</th>
              <th className="p-3 text-start">زمان ساخت</th>
              <th className="p-3 text-start">IP (هش)</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.docs.map((d) => {
              const live = d.status === 'active' && new Date(d.expiresAt) > now
              const tenantId = typeof d.tenant === 'object' && d.tenant ? d.tenant.id : d.tenant
              return (
                <tr key={d.id} className="border-t border-line">
                  <td className="p-3 font-latin" dir="ltr">
                    {d.tenantSlug ?? '—'}
                  </td>
                  <td className="p-3">{live ? 'فعال' : d.status === 'active' ? 'تمام‌شده (در مهلت)' : (STATUS_FA[d.status] ?? d.status)}</td>
                  <td className="p-3">{formatJalali(d.createdAt, 'd MMM HH:mm')}</td>
                  <td className="p-3">{formatJalali(d.expiresAt, 'd MMM HH:mm')}</td>
                  <td className="p-3">{d.buildMs ? `${toPersianDigits(d.buildMs)} ms` : '—'}</td>
                  <td className="p-3 font-latin text-xs" dir="ltr">
                    {d.ipHash.slice(0, 10)}
                  </td>
                  <td className="p-3">
                    {tenantId ? (
                      <form method="post" action="/demo/ops/purge">
                        <input type="hidden" name="tenant" value={tenantId} />
                        <button type="submit" className={`${btnDanger()} h-9 px-3 text-sm`}>
                          حذف همین حالا
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
