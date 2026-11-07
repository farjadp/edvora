import { courseProgress, formatJalali, formatToman, rial, toPersianDigits } from '@edvora/core'
import { Seal, cx } from '@edvora/ui'
import type { Metadata } from 'next'
import type { Where } from 'payload'
import Link from 'next/link'
import { ContinueCard, Header, LevelSection, NoCourses, PathBlock, Section, WeekSection, WelcomeCard, mergeBadges, type LearnItem } from '../../../components/panel/dashboard'
import { greetingName } from '@edvora/core/names'
import { docOf, idOf } from '../../../lib/ids'
import { getStudentDashboardGamification } from '../../../lib/gamificationQueries'
import { getPayloadClient } from '../../../lib/payload'
import { getLessons } from '../../../lib/queries'
import { requireUser } from '../../../lib/session'
import { getCurrentTenant } from '../../../lib/tenant'
import type { Cohort, Course } from '../../../payload-types'

export const metadata: Metadata = { title: 'پنل من' }

const ORDER_STATUS: Record<string, string> = {
  pending: 'در انتظار پرداخت',
  partially_paid: 'پرداخت قسطی',
  paid: 'پرداخت شده',
  failed: 'ناموفق',
  refunded: 'مسترد شده',
  cancelled: 'لغو شده',
}

/** «یک تکلیف و دفاع نهایی باقی مانده است.» → «تا گواهی فقط یک تکلیف و دفاع نهایی مانده است.» */
function remainingLine(text: string): string {
  const m = /^(.*) باقی مانده است\.?$/.exec(text)
  return m ? `تا گواهی فقط ${m[1]} مانده است.` : text
}

export default async function DashboardPage() {
  const user = await requireUser('/dashboard')
  const tenant = await getCurrentTenant()
  const payload = await getPayloadClient()
  const mine: Where = { and: [{ tenant: { equals: tenant.id } }, { user: { equals: user.id } }] }

  const [enrollments, orders, certificates] = await Promise.all([
    payload.find({ collection: 'enrollments', where: mine, depth: 1, limit: 50, overrideAccess: true }),
    payload.find({ collection: 'orders', where: mine, depth: 1, sort: '-createdAt', limit: 20, overrideAccess: true }),
    payload.find({ collection: 'certificates', where: mine, depth: 1, limit: 20, overrideAccess: true }),
  ])

  const gam = await getStudentDashboardGamification().catch((err) => {
    console.error('[dashboard gamification]', err)
    return null
  })
  const viewOf = new Map((gam?.enrollments ?? []).map((x) => [x.view.enrollmentId, x.view]))
  const on = Boolean(gam?.enabled)

  const items: LearnItem[] = (
    await Promise.all(
      enrollments.docs.map(async (e): Promise<LearnItem | null> => {
        const course = docOf<Course>(e.course)
        if (!course) return null
        const lessons = await getLessons(course.id)
        const done = (e.completedLessons ?? []).map((l) => String(idOf(l)))
        const progress = courseProgress(done, lessons.map((l) => String(l.id)))
        const idx = lessons.findIndex((l) => !done.includes(String(l.id)))
        const nextLesson = lessons[idx === -1 ? 0 : idx]
        return {
          id: e.id,
          course: { id: course.id, title: course.title, slug: course.slug },
          cohortTitle: docOf<Cohort>(e.cohort)?.title ?? null,
          progress,
          done: lessons.filter((l) => done.includes(String(l.id))).length,
          total: lessons.length,
          next: nextLesson ? { id: nextLesson.id, title: nextLesson.title, module: nextLesson.module ?? null, minutes: nextLesson.durationMinutes ?? null, number: (idx === -1 ? 0 : idx) + 1 } : null,
          view: viewOf.get(e.id) ?? null,
        }
      }),
    )
  ).filter((x): x is LearnItem => x !== null)

  const name = greetingName(user)
  const primary = items[0]
  const doneAll = items.reduce((n, i) => n + i.done, 0)
  const view = primary?.view ?? null
  const line = !primary
    ? 'برنامهٔ یادگیری خود را انتخاب کنید.'
    : doneAll === 0
      ? 'خوش آمدید. اولین جلسه را شروع کنید.'
      : on && view?.rhythm?.thisWeek.state === 'met'
        ? 'این هفته برنامه را کامل کردید.'
        : primary.progress >= 100 && view?.path.remainingText
          ? remainingLine(view.path.remainingText)
          : primary.progress >= 100 && view?.path.eligible
            ? 'گواهی شما پس از تأیید آکادمی صادر می‌شود.'
            : primary.next
              ? `جلسهٔ بعد منتظر شماست: ${primary.next.title}`
              : 'ادامه دهید.'

  const badges = mergeBadges(items)
  const nextHref = primary?.next ? `/learn/${primary.course.slug}/${primary.next.id}` : null
  const showAside = on && items.length > 0
  const firstVisit = items.length > 0 && doneAll === 0 && (gam?.total?.xp ?? 0) === 0
  const flags = gam?.enrollments[0]?.view.flags
  const logout = (
    <form action="/logout" method="post" className="relative">
      <button className="min-h-11 rounded-xl border border-line bg-bg px-4 text-sm hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">خروج</button>
    </form>
  )

  return (
    <div data-testid="dashboard" data-layout={on ? 'seal' : 'plain'} data-gamification={on ? 'on' : 'off'} className="mx-auto max-w-7xl px-4 pb-16 pt-8 md:px-8 md:pt-12">
      <Header name={name} line={line}>
        {logout}
      </Header>

      {items.length === 0 ? (
        <div className="pt-10">
          <NoCourses />
        </div>
      ) : (
        <div className={cx('mt-8 grid grid-cols-1 gap-x-12 gap-y-10', showAside && 'lg:grid-cols-12')}>
          <div className={cx('grid min-w-0 grid-cols-1 gap-y-6', showAside && 'lg:col-span-8')}>
            {items.map((it) => (
              <ContinueCard key={it.id} item={it} ring={on} />
            ))}
          </div>

          {showAside ? (
            <aside aria-label="ریتم و سطح" className="flex min-w-0 flex-col gap-8 lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1">
              {firstVisit ? <WelcomeCard name={name} /> : flags?.streak ? items.map((it) => <WeekSection key={it.id} item={it} showCourse={items.length > 1} />) : null}
              {gam?.total ? (
                <LevelSection
                  xp={gam.total.xp}
                  level={gam.total.level}
                  badges={badges}
                  showXp={Boolean(flags?.xp)}
                  showLevel={Boolean(flags?.levels)}
                  showBadges={Boolean(flags?.badges)}
                  nextHref={nextHref}
                  formatDate={formatJalali}
                />
              ) : flags?.badges ? (
                <LevelSection xp={0} level={{ level: 1, name: '', next: null, pct: 0 }} badges={badges} showXp={false} showLevel={false} showBadges nextHref={nextHref} formatDate={formatJalali} />
              ) : null}
            </aside>
          ) : null}

          <div className={cx('grid min-w-0 grid-cols-1 gap-y-6 border-t border-line', showAside && 'lg:col-span-8')}>
            {items.map((it) => (
              <PathBlock key={it.id} item={it} gold={on} />
            ))}
          </div>
        </div>
      )}

      {certificates.docs.length ? (
        <Section id="certs" title="گواهی‌های من" className="pt-14">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {certificates.docs.map((c) => (
              <div key={c.id} data-testid="certificate-card" className="flex items-center gap-5 rounded-md border border-line bg-surface p-6">
                <Seal className="size-16" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{docOf<Course>(c.course)?.title}</p>
                  <p dir="ltr" className="mt-1 text-end font-latin text-sm text-muted">
                    {c.code}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                    <Link href={`/dashboard/certificates/${c.id}`} className="inline-flex min-h-11 items-center rounded-sm text-sm font-bold text-brand-text underline-offset-4 hover:underline">
                      مشاهدهٔ گواهی
                    </Link>
                    <Link href={`/verify?code=${encodeURIComponent(c.code ?? '')}`} className="inline-flex min-h-11 items-center rounded-sm text-sm font-bold text-brand-text underline-offset-4 hover:underline">
                      صفحهٔ استعلام
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <section className="pt-14" aria-labelledby="orders">
        <h2 id="orders" className="mb-5 font-display text-2xl font-black">
          سفارش‌ها و اقساط
        </h2>
        {orders.docs.length === 0 ? (
          <div data-testid="empty-orders">
            <p className="font-bold">سفارشی ندارید.</p>
            <p className="mt-1 text-sm text-muted">پرداخت‌های شما اینجا نمایش داده می‌شود.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-line bg-surface">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-sunken text-muted">
                <tr>
                  <th className="p-4 text-start font-medium">دوره</th>
                  <th className="p-4 text-start font-medium">مبلغ کل</th>
                  <th className="p-4 text-start font-medium">اقساط</th>
                  <th className="p-4 text-start font-medium">وضعیت</th>
                  <th className="p-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.docs.map((o) => {
                  const paid = (o.instalments ?? []).filter((i) => i.status === 'paid').length
                  const next = (o.instalments ?? []).find((i) => i.status !== 'paid')
                  return (
                    <tr key={o.id}>
                      <td className="p-4 font-bold">{docOf<Course>(o.course)?.title}</td>
                      <td className="p-4">{formatToman(rial(o.total))}</td>
                      <td className="p-4">
                        {toPersianDigits(paid)} از {toPersianDigits(o.instalments?.length ?? 0)}
                        {next && paid > 0 ? <span className="block text-xs text-muted">سررسید بعدی: {formatJalali(next.dueDate)}</span> : null}
                      </td>
                      <td className="p-4">{ORDER_STATUS[o.status] ?? o.status}</td>
                      <td className="p-4 text-end">
                        {next ? (
                          <form action="/payments/start" method="post">
                            <input type="hidden" name="orderId" value={o.id} />
                            <button className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-bg">پرداخت {formatToman(rial(next.amount))}</button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
