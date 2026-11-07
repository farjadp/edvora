import { toPersianDigits } from '@edvora/core'
import type { Media, Page, Tenant } from '../payload-types'
import { RichText } from './RichText'

/** A published content page (about, FAQ, regulations…). Rendered by the catch-all route `app/(frontend)/[...wpPath]`. */
export function ContentPage({ page, tenant }: { page: Page; tenant: Tenant }) {
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
