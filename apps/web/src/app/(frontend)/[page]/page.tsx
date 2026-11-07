import { toPersianDigits } from '@edvora/core'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { RichText } from '../../../components/RichText'
import type { Media } from '../../../payload-types'
import { getPageBySlug } from '../../../lib/queries'
import { getCurrentTenant } from '../../../lib/tenant'

type Props = { params: Promise<{ page: string }> }

// Only latin slugs are valid page slugs (see the Pages collection); anything else is a 404 without a query.
const slugOf = async (params: Props['params']) => {
  const s = (await params).page
  return /^[a-z0-9-]+$/.test(s) ? s : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = await slugOf(params)
  if (!slug) return {}
  const tenant = await getCurrentTenant()
  const page = await getPageBySlug(tenant.id, slug)
  return page ? { title: page.title, description: page.intro ?? undefined } : {}
}

export default async function ContentPage({ params }: Props) {
  const slug = await slugOf(params)
  if (!slug) notFound()
  const tenant = await getCurrentTenant()
  const page = await getPageBySlug(tenant.id, slug)
  if (!page) notFound()
  const cover = typeof page.cover === 'object' ? (page.cover as Media | null) : null
  const src = cover?.sizes?.hero?.url ?? cover?.url

  return (
    <article className="mx-auto max-w-3xl px-4 pt-10 md:px-8">
      <h1 className="text-3xl font-black leading-tight md:text-4xl">{page.title}</h1>
      {page.intro ? <p className="mt-4 whitespace-pre-line text-lg leading-9 text-muted">{page.intro}</p> : null}
      {src ? <img src={src} alt={cover?.alt ?? ''} className="mt-8 w-full rounded-3xl object-cover" /> : null}
      <div className="mt-4">
        <RichText data={page.body} tenantId={tenant.id} />
      </div>
      {page.slug === 'contact' && (tenant.contact?.phone || tenant.contact?.email || tenant.contact?.address) ? (
        <dl className="mt-8 grid gap-4 rounded-2xl border border-line bg-surface p-6 text-sm">
          {tenant.contact?.phone ? (
            <div>
              <dt className="text-muted">تلفن</dt>
              <dd dir="ltr" className="text-end font-latin text-lg font-bold">{toPersianDigits(tenant.contact.phone)}</dd>
            </div>
          ) : null}
          {tenant.contact?.email ? (
            <div>
              <dt className="text-muted">ایمیل</dt>
              <dd dir="ltr" className="text-end font-latin text-lg font-bold">{tenant.contact.email}</dd>
            </div>
          ) : null}
          {tenant.contact?.address ? (
            <div>
              <dt className="text-muted">نشانی</dt>
              <dd className="text-lg font-bold leading-8">{tenant.contact.address}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {page.faq?.length ? (
        <section className="mt-10 space-y-3">
          {page.faq.map((f) => (
            <details key={f.id ?? f.question} className="group rounded-2xl border border-line bg-surface p-5">
              <summary className="cursor-pointer list-none font-bold marker:hidden">
                <span className="me-2 text-brand group-open:hidden">+</span>
                <span className="me-2 hidden text-brand group-open:inline">−</span>
                {f.question}
              </summary>
              <div className="mt-3 text-muted">
                <RichText data={f.answer} tenantId={tenant.id} />
              </div>
            </details>
          ))}
        </section>
      ) : null}
    </article>
  )
}
