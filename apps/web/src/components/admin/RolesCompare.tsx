import { DASHBOARD_WIDGETS, LANDING_OPTIONS, MENU_SECTIONS, PERMISSION_DESCRIPTIONS, PERMISSION_GROUPS, PERMISSION_GROUP_LABELS, ROLE_TEMPLATES, satisfies, type PermissionGroup } from '@edvora/core'
import { toPersianDigits } from '@edvora/core/digits'
import { DefaultTemplate } from '@payloadcms/next/templates'
import type { AdminViewServerProps } from 'payload'
import { redirect } from 'next/navigation'
import { getAdminConsoleContext } from '../../lib/adminTenant'
import type { Role } from '../../payload-types'

const GROUPS = (Object.keys(PERMISSION_GROUPS) as PermissionGroup[]).filter((g) => g !== 'platform')
const fa = (n: number) => toPersianDigits(String(n))
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const labelOf = (list: readonly { value: string; fa: string }[], v: string) => list.find((o) => o.value === v)?.fa ?? v

function listOf(values: readonly string[] | null | undefined, cat: readonly { value: string; fa: string }[], empty: string): string {
  const v = values ?? []
  return v.length === 0 ? empty : v.map((x) => labelOf(cat, x)).join('، ')
}

const landingOf = (v: string | null | undefined) => (!v || v === 'auto' ? 'خودکار' : labelOf(LANDING_OPTIONS, v))

/** Built-in templates first (catalogue order), then custom roles by name; archived roles last. */
function rank(r: Role): [number, number, string] {
  const t = ROLE_TEMPLATES.findIndex((x) => x.key === r.template)
  return [r.archived ? 1 : 0, t === -1 ? ROLE_TEMPLATES.length : t, r.name]
}
const byRank = (a: Role, b: Role) => {
  const [x, y] = [rank(a), rank(b)]
  return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2], 'fa')
}

function hoursOf(r: Role): string {
  const h = r.security?.loginHours
  if (!h?.enabled || h.from == null || h.to == null) return '—'
  return `${fa(h.from)} تا ${fa(h.to)}`
}

/**
 * /admin/roles-compare (E-039, ADR 016): who can do what across one academy's roles. Rows = permissions (grouped,
 * with descriptions) plus the security and experience settings; columns = roles. Read with the viewer's own access
 * (`overrideAccess: false`), so it shows only roles the viewer may read, and only in the selected academy.
 */
export async function RolesCompare({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, permissions, visibleEntities, locale } = initPageResult
  const payload = req.payload
  if (!req.user) redirect(`${payload.config.routes.admin}/login?redirect=${encodeURIComponent('/admin/roles-compare')}`)

  const ctx = await getAdminConsoleContext(payload)
  const scopeTenants = ctx?.scope.kind === 'academy' ? [ctx.scope.tenantId] : ctx?.scope.kind === 'mine' ? ctx.scope.tenantIds : []
  const asked = Number(one(searchParams?.academy))
  const tenantId = Number.isInteger(asked) && asked > 0 ? asked : scopeTenants.length === 1 ? scopeTenants[0]! : null

  let roles: Role[] = []
  let academy: string | null = null
  let failed = false
  if (tenantId !== null) {
    try {
      const [res, tenant] = await Promise.all([
        payload.find({ collection: 'roles', where: { tenant: { equals: tenantId } }, sort: 'name', depth: 0, limit: 100, pagination: false, overrideAccess: false, user: req.user, req }),
        payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, overrideAccess: false, user: req.user, req, disableErrors: true }),
      ])
      roles = [...res.docs].sort(byRank)
      academy = tenant?.name ?? null
      if (!tenant) roles = []
    } catch (err) {
      payload.logger.error({ err, msg: 'roles compare: load failed' })
      failed = true
    }
  }
  const has = (r: Role, p: string) => !r.archived && (r.permissions ?? []).some((g) => satisfies(g, p))

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
      viewType="roles-compare"
    >
      <section className="ed-cmp" aria-labelledby="ed-cmp-title">
        <header className="ed-cmp__head">
          <div>
            <p className="c-eyebrow">{academy ?? 'نقش‌ها'}</p>
            <h1 id="ed-cmp-title" className="ed-cmp__title">
              مقایسهٔ نقش‌ها
            </h1>
            <p className="c-muted">چه کسی چه کاری می‌تواند بکند. نقش‌های بایگانی‌شده هیچ دسترسی‌ای نمی‌دهند.</p>
          </div>
          <a className="c-btn" href={`${payload.config.routes.admin}/collections/roles`}>
            بازگشت به نقش‌ها
          </a>
        </header>

        {tenantId === null ? (
          <p className="ed-cmp__empty">برای مقایسه، یک آکادمی را از انتخاب‌گر بالای منو برگزینید.</p>
        ) : failed ? (
          <p className="ed-cmp__empty" role="alert">
            بارگذاری نقش‌ها انجام نشد. صفحه را دوباره باز کنید.
          </p>
        ) : roles.length === 0 ? (
          <p className="ed-cmp__empty">در این آکادمی نقشی برای نمایش به شما نیست.</p>
        ) : (
          <div className="ed-cmp__scroll" tabIndex={0} role="region" aria-label="جدول مقایسهٔ نقش‌ها">
            <table className="ed-cmp__table" data-testid="roles-compare">
              <caption className="ed-perms__sr">دسترسی‌ها و تنظیمات هر نقش در {academy}</caption>
              <thead>
                <tr>
                  <th scope="col" className="ed-cmp__corner">
                    دسترسی
                  </th>
                  {roles.map((r) => (
                    <th key={r.id} scope="col" data-archived={r.archived ? 'true' : undefined}>
                      <a href={`${payload.config.routes.admin}/collections/roles/${r.id}`}>{r.name}</a>
                      <span className="ed-cmp__sub">
                        {r.archived ? 'بایگانی' : `${fa((r.permissions ?? []).length)} دسترسی`}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="ed-cmp__section">
                  <th scope="rowgroup" colSpan={roles.length + 1}>
                    امنیت و تجربهٔ کاربری
                  </th>
                </tr>
                <tr>
                  <th scope="row">تأیید دومرحله‌ای اجباری</th>
                  {roles.map((r) => (
                    <td key={r.id}>{r.security?.require2fa ? 'بله' : '—'}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">حداکثر مدت نشست</th>
                  {roles.map((r) => (
                    <td key={r.id}>{r.security?.maxSessionHours ? `${fa(r.security.maxSessionHours)} ساعت` : '—'}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">ساعت‌های مجاز ورود</th>
                  {roles.map((r) => (
                    <td key={r.id}>{hoursOf(r)}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">صفحهٔ شروع</th>
                  {roles.map((r) => (
                    <td key={r.id}>{landingOf(r.experience?.landing)}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">بخش‌های منو</th>
                  {roles.map((r) => (
                    <td key={r.id}>{listOf(r.experience?.menuSections, MENU_SECTIONS, 'همه')}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">ویجت‌های داشبورد</th>
                  {roles.map((r) => (
                    <td key={r.id}>{listOf(r.experience?.dashboardWidgets, DASHBOARD_WIDGETS, 'همه')}</td>
                  ))}
                </tr>
                {GROUPS.map((g) => [
                  <tr key={`g-${g}`} className="ed-cmp__section">
                    <th scope="rowgroup" colSpan={roles.length + 1}>
                      {PERMISSION_GROUP_LABELS[g].fa}
                    </th>
                  </tr>,
                  ...PERMISSION_GROUPS[g].map((p) => (
                    <tr key={p}>
                      <th scope="row">
                        <span className="ed-perms__desc">{PERMISSION_DESCRIPTIONS[p as keyof typeof PERMISSION_DESCRIPTIONS].fa}</span>
                        <code className="ed-perms__key" dir="ltr">
                          {p}
                        </code>
                      </th>
                      {roles.map((r) => (
                        <td key={r.id} data-on={has(r, p) ? 'true' : undefined}>
                          {has(r, p) ? (
                            <span className="ed-cmp__yes" aria-label="دارد">
                              ✓
                            </span>
                          ) : (
                            <span className="ed-cmp__no" aria-label="ندارد">
                              ·
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </DefaultTemplate>
  )
}
