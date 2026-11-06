import { courseProgress, formatJalali, formatToman, rial, toPersianDigits } from '@edvora/core'
import type { Metadata } from 'next'
import type { Where } from 'payload'
import Link from 'next/link'
import { docOf, idOf } from '../../../lib/ids'
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

  const learning = await Promise.all(
    enrollments.docs.map(async (e) => {
      const course = docOf<Course>(e.course)
      const lessons = course ? await getLessons(course.id) : []
      const done = (e.completedLessons ?? []).map((l) => String(idOf(l)))
      const progress = courseProgress(done, lessons.map((l) => String(l.id)))
      const nextLesson = lessons.find((l) => !done.includes(String(l.id))) ?? lessons[0]
      return { e, course, cohort: docOf<Cohort>(e.cohort), progress, nextLesson, total: lessons.length }
    }),
  )

  return (
    <div className="mx-auto max-w-7xl px-4 pt-10 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">خوش آمدید</p>
          <h1 className="text-3xl font-black">{user.name || 'دانشجوی عزیز'}</h1>
        </div>
        <form action="/logout" method="post">
          <button className="rounded-xl border border-line px-4 py-2 text-sm hover:bg-sunken">خروج</button>
        </form>
      </div>

      <section className="pt-10">
        <h2 className="mb-4 text-xl font-black">ادامه یادگیری</h2>
        {learning.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">
            هنوز در دوره‌ای ثبت‌نام نکرده‌اید.{' '}
            <Link href="/#programs" className="font-bold text-brand">
              دوره‌ها را ببینید
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {learning.map(({ e, course, cohort, progress, nextLesson, total }) => (
              <div key={e.id} className="rounded-2xl border border-line bg-surface p-6">
                <p className="text-sm text-muted">{cohort?.title ?? 'دوره'}</p>
                <h3 className="mt-1 text-lg font-bold">{course?.title}</h3>
                <progress
                  value={progress}
                  max={100}
                  aria-label="پیشرفت دوره"
                  className="mt-4 block h-2 w-full appearance-none overflow-hidden rounded-full bg-sunken [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-sunken [&::-webkit-progress-value]:bg-brand"
                />
                <p className="mt-2 text-xs text-muted">
                  {toPersianDigits(progress)}٪ · {toPersianDigits(total)} جلسه
                </p>
                {course ? (
                  <Link href={`/learn/${course.slug}`} className="mt-4 me-3 inline-block text-sm font-bold text-brand hover:underline">
                    جلسات، آزمون‌ها و تکالیف
                  </Link>
                ) : null}
                {course && nextLesson ? (
                  <Link href={`/learn/${course.slug}/${nextLesson.id}`} className="mt-4 inline-block rounded-xl bg-brand px-4 py-2 text-sm font-bold text-brand-ink">
                    ▶ {nextLesson.title}
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {certificates.docs.length ? (
        <section className="pt-12">
          <h2 className="mb-4 text-xl font-black">گواهی‌های من</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {certificates.docs.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-2xl border border-line bg-surface p-6">
                <div>
                  <p className="font-bold">{docOf<Course>(c.course)?.title}</p>
                  <p dir="ltr" className="mt-1 text-end font-latin text-sm text-muted">{c.code}</p>
                </div>
                <Link href={`/verify?code=${encodeURIComponent(c.code ?? '')}`} className="text-sm font-bold text-brand">
                  صفحه استعلام
                </Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="pt-12">
        <h2 className="mb-4 text-xl font-black">سفارش‌ها و اقساط</h2>
        {orders.docs.length === 0 ? (
          <p className="text-muted">سفارشی ندارید.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
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
