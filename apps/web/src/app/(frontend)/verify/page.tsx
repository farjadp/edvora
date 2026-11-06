import { formatJalali, normalizeCertificateCode } from '@edvora/core'
import type { Metadata } from 'next'
import { docOf } from '../../../lib/ids'
import { getPayloadClient } from '../../../lib/payload'
import { getCurrentTenant } from '../../../lib/tenant'
import type { Cohort, Course } from '../../../payload-types'

export const metadata: Metadata = { title: 'استعلام گواهی' }

type Props = { searchParams: Promise<{ code?: string }> }

export default async function VerifyPage({ searchParams }: Props) {
  const raw = (await searchParams).code?.slice(0, 40) ?? ''
  const code = raw ? normalizeCertificateCode(raw) : ''
  const tenant = await getCurrentTenant()

  let cert: Awaited<ReturnType<typeof lookup>> = null
  if (code) cert = await lookup(tenant.id, code)

  return (
    <div className="mx-auto max-w-2xl px-4 pt-14 md:px-8">
      <h1 className="text-3xl font-black md:text-4xl">استعلام گواهی</h1>
      <p className="mt-3 leading-8 text-muted">کد گواهی را همان‌طور که روی گواهی یا لینکدین آمده وارد کنید.</p>

      <form className="mt-6 flex gap-2">
        <input
          name="code"
          defaultValue={raw}
          dir="ltr"
          required
          placeholder={`${tenant.certificatePrefix}-MBA-181`}
          className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 font-latin outline-none focus:border-brand"
        />
        <button className="h-12 rounded-xl bg-brand px-6 font-bold text-brand-ink">استعلام</button>
      </form>

      {code ? (
        cert ? (
          <div className="mt-8 overflow-hidden rounded-3xl border border-line bg-surface">
            <div className={cert.status === 'valid' ? 'bg-ok px-6 py-3 text-sm font-bold text-white' : 'bg-danger px-6 py-3 text-sm font-bold text-white'}>
              {cert.status === 'valid' ? '✓ این گواهی معتبر است' : '✕ این گواهی باطل شده است'}
            </div>
            <dl className="grid gap-5 p-6 sm:grid-cols-2">
              <Item label="کد گواهی" value={<span dir="ltr" className="font-latin">{cert.code}</span>} />
              <Item label="نام دارنده" value={cert.holderName} />
              <Item label="دوره" value={cert.course} />
              {cert.cohort ? <Item label="ورودی" value={cert.cohort} /> : null}
              <Item label="تاریخ صدور" value={formatJalali(cert.issuedAt)} />
              {cert.finalProject ? <Item label="پروژه نهایی" value={cert.finalProject} /> : null}
            </dl>
            <p className="border-t border-line px-6 py-4 text-xs text-muted">صادرکننده: {tenant.name}</p>
          </div>
        ) : (
          <div role="alert" className="mt-8 rounded-3xl border border-line bg-surface p-6">
            <p className="font-bold">گواهی‌ای با این کد پیدا نشد.</p>
            <p className="mt-2 text-sm leading-7 text-muted">کد را دوباره بررسی کنید. اگر فکر می‌کنید اشتباهی رخ داده، با آکادمی تماس بگیرید.</p>
          </div>
        )
      ) : null}
    </div>
  )
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-bold">{value}</dd>
    </div>
  )
}

/** Returns only fields that are safe to show publicly. */
async function lookup(tenantId: number, code: string) {
  const payload = await getPayloadClient()
  const res = await payload.find({
    collection: 'certificates',
    where: { and: [{ tenant: { equals: tenantId } }, { code: { equals: code } }] },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })
  const c = res.docs[0]
  if (!c) return null
  return {
    code: c.code ?? code,
    holderName: c.holderName,
    course: docOf<Course>(c.course)?.title ?? '',
    cohort: docOf<Cohort>(c.cohort)?.title ?? null,
    issuedAt: c.issuedAt,
    finalProject: c.finalProject ?? null,
    status: c.status ?? 'valid',
  }
}
