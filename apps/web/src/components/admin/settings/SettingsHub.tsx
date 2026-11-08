import { SETTINGS_GROUP_LABELS, type IntegrationKind, type SettingsGroup } from '@edvora/core/settings'
import { ConsoleIcon } from '@edvora/ui/console'
import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { headers as nextHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import { env } from '../../../env'
import { loadPlatformSettings } from '../../../lib/platformSettings'
import { getSettingsActor, isPlatform, loadIntegrations, loadTenant, pickAcademy, settingsAcademies, viewerIn, type SettingsActor } from '../../../lib/settings'
import { visibleSections, type SettingsSectionDef } from '../../../lib/settingsRegistry'
import { SECTION_COMPONENTS, type SectionData } from './sections'

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const num = (v: string | undefined) => {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}
const GROUP_ORDER: SettingsGroup[] = ['academy', 'site', 'messages', 'integrations', 'modules', 'people', 'platform']

function envStatus(): NonNullable<SectionData['platform']>['env'] {
  const e = env()
  return [
    { label: 'پیامک', value: e.SMS_PROVIDER, configured: e.SMS_PROVIDER === 'mock' || Boolean(e.KAVENEGAR_API_KEY) },
    { label: 'درگاه پرداخت', value: e.PAYMENT_PROVIDER, configured: e.PAYMENT_PROVIDER === 'mock' || Boolean(e.ZARINPAL_MERCHANT_ID) },
    { label: 'کلاس زنده', value: e.LIVE_CLASS_PROVIDER, configured: e.LIVE_CLASS_PROVIDER === 'mock' || Boolean(e.BBB_URL && e.BBB_SECRET) },
    { label: 'فضای ذخیره', value: e.STORAGE_PROVIDER, configured: e.STORAGE_PROVIDER === 'mock' || Boolean(e.S3_ENDPOINT && e.S3_BUCKET) },
    { label: 'ایمیل', value: process.env.SMTP_HOST ? 'smtp' : '—', configured: Boolean(process.env.SMTP_HOST) },
    { label: 'تأیید دومرحله‌ای (env)', value: process.env.STAFF_2FA_REQUIRED === 'true' ? 'required' : 'optional', configured: true },
  ]
}

async function academyChoices(a: SettingsActor): Promise<{ id: number; name: string }[]> {
  const mine = settingsAcademies(a)
  const res = await a.req.payload.find({
    collection: 'tenants',
    where: mine === 'all' ? {} : { id: { in: mine.length ? mine : [-1] } },
    sort: 'name',
    depth: 0,
    limit: 200,
    pagination: false,
    overrideAccess: true,
    select: { name: true },
  })
  return res.docs.map((d) => ({ id: d.id, name: d.name }))
}

/**
 * /admin/settings and /admin/settings/<section> (E-047, ADR 019): the settings hub. Left: the sections this person
 * may open in the academy being edited (registry, permission-filtered, default deny). Right: one section's form,
 * or the overview cards. Links to module screens (payments, AI, roles…) open those screens.
 */
export async function SettingsHub(props: AdminViewServerProps) {
  const { initPageResult, params, searchParams } = props
  const { req, permissions, visibleEntities, locale } = initPageResult
  const payload = req.payload
  const segments = (params?.segments as string[] | undefined) ?? []
  const sectionKey = segments[1] ?? null
  if (!req.user) redirect(`${payload.config.routes.admin}/login?redirect=${encodeURIComponent(`/admin/settings${sectionKey ? `/${sectionKey}` : ''}`)}`)

  const hdrs = await nextHeaders()
  const actor = await getSettingsActor(payload, hdrs)
  const selected = getTenantFromCookie(hdrs, 'number')
  const academy = actor ? pickAcademy(actor, num(one(searchParams?.academy)), typeof selected === 'number' ? selected : null) : null
  const hasCollection = (slug: string) => Boolean(payload.collections[slug as keyof typeof payload.collections])
  const viewer = actor ? viewerIn(actor, academy) : { isPlatformAdmin: false, permissions: [] }
  // Platform sections need no academy; academy sections only show once one is chosen.
  const sections = actor ? visibleSections(viewer, hasCollection).filter((s) => s.scope === 'platform' || academy !== null || viewer.isPlatformAdmin) : []
  const current = sectionKey ? sections.find((s) => s.key === sectionKey && !s.href) ?? null : null
  const forbidden = sectionKey !== null && current === null
  const choices = actor ? await academyChoices(actor) : []
  const tenant = academy !== null ? await loadTenant(payload, academy) : null
  const q = (k: string) => one(searchParams?.[k])
  const academyQs = academy !== null ? `?academy=${academy}` : ''

  let data: SectionData | null = null
  if (actor && current) {
    const platform = isPlatform(actor)
      ? await (async () => {
          const ps = await loadPlatformSettings(payload)
          const fresh = (await payload.findGlobal({ slug: 'platform-settings', depth: 0, overrideAccess: true })) as typeof ps
          const all = await payload.find({ collection: 'tenants', depth: 0, limit: 500, pagination: false, sort: 'name', overrideAccess: true, select: { name: true, slug: true, plan: true, domains: true, features: true, limits: true } })
          return {
            staff2fa: fresh.staff2fa ?? 'env',
            academyProviders: (fresh.academyProviders ?? {}) as Partial<Record<IntegrationKind, boolean | null>>,
            env: envStatus(),
            academies: all.docs,
            editing: num(q('edit')),
          }
        })()
      : { staff2fa: 'env', academyProviders: (await loadPlatformSettings(payload)).academyProviders ?? {}, env: [], academies: [], editing: null }
    const pages =
      current.key === 'legal' && academy !== null
        ? (await payload.find({ collection: 'pages', where: { tenant: { equals: academy } }, depth: 0, limit: 200, pagination: false, overrideAccess: true, select: { title: true } })).docs.map((p) => ({ id: p.id, title: p.title }))
        : []
    data = {
      academy,
      tenant,
      integrations: current.key === 'integrations' && academy !== null ? await loadIntegrations(payload, academy) : {},
      pages,
      platform,
    }
  }

  const byGroup = GROUP_ORDER.map((g) => ({ g, items: sections.filter((s) => s.group === g) })).filter((x) => x.items.length)
  const hrefOf = (s: SettingsSectionDef) => (s.href ? s.href : `/admin/settings/${s.key}${s.scope === 'academy' ? academyQs : ''}`)
  const Section = current ? SECTION_COMPONENTS[current.key] : null

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={payload}
      permissions={permissions}
      searchParams={searchParams}
      user={req.user ?? undefined}
      visibleEntities={visibleEntities}
      viewType="settings"
    >
      <section className="ed-set" aria-labelledby="ed-set-title" data-testid="settings-hub">
        <header className="ed-set__head">
          <div>
            <p className="c-eyebrow">{tenant?.name ?? 'ادورا'}</p>
            <h1 id="ed-set-title" className="ed-set__title">
              تنظیمات{current ? ` · ${current.label}` : ''}
            </h1>
            <p className="c-muted">{current ? current.help : 'همهٔ تنظیمات آکادمی و پلتفرم در یک جا. هر بخش فقط برای کسی که دسترسی‌اش را دارد نمایش داده می‌شود.'}</p>
          </div>
          {choices.length > 1 ? (
            <form method="get" className="ed-set__picker" action={sectionKey ? `/admin/settings/${sectionKey}` : '/admin/settings'}>
              <label htmlFor="ed-set-academy">آکادمی</label>
              <select id="ed-set-academy" name="academy" defaultValue={academy ?? ''} className="ed-set__input">
                <option value="">— انتخاب —</option>
                {choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="c-btn c-btn--small">
                نمایش
              </button>
            </form>
          ) : null}
        </header>

        {!actor || sections.length === 0 ? (
          <p className="ed-set__empty" role="alert" data-testid="settings-denied">
            {choices.length === 0 ? 'شما به هیچ بخشی از تنظیمات دسترسی ندارید.' : 'یک آکادمی را برگزینید.'}
          </p>
        ) : (
          <div className="ed-set__layout">
            <nav className="ed-set__nav" aria-label="بخش‌های تنظیمات">
              {byGroup.map(({ g, items }) => (
                <div key={g} className="ed-set__navgroup">
                  <p className="ed-set__navlabel">{SETTINGS_GROUP_LABELS[g]}</p>
                  <ul>
                    {items.map((s) => (
                      <li key={s.key}>
                        <a href={hrefOf(s)} aria-current={current?.key === s.key ? 'page' : undefined} className="ed-set__navlink" data-section={s.key}>
                          <ConsoleIcon name={s.icon} className="ed-set__ico" />
                          <span>{s.label}</span>
                          {s.href ? <ConsoleIcon name="external" className="ed-set__ext" /> : null}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>

            <div className="ed-set__main">
              {q('saved') ? (
                <p className="c-alert ed-set__ok" role="status" data-testid="settings-saved">
                  ذخیره شد. {q('notice') ?? ''}
                </p>
              ) : null}
              {q('error') ? (
                <p className="c-alert ed-set__err" role="alert" data-testid="settings-error">
                  {q('error')}
                </p>
              ) : null}
              {forbidden ? (
                <p className="ed-set__empty" role="alert" data-testid="settings-denied">
                  این بخش برای شما باز نیست.
                </p>
              ) : Section && data ? (
                Section(data)
              ) : (
                <ul className="ed-set__cards">
                  {sections.map((s) => (
                    <li key={s.key}>
                      <a href={hrefOf(s)} className="ed-set__tile">
                        <ConsoleIcon name={s.icon} className="ed-set__ico" />
                        <span className="ed-set__tile-title">{s.label}</span>
                        <span className="ed-set__tile-help">{s.help}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>
    </DefaultTemplate>
  )
}
