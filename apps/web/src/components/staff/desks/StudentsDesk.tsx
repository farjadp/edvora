import { formatJalali } from '@edvora/core'
import { DataTable, DonutWithLegend, EmptyState, EntityCell, FilterBar, FilterSearch, FilterSelect, KpiCard, KpiGrid, MiniBar, Pagination, Panel, Pill, QuickActions, type Column } from '@edvora/ui/console'
import type { PayloadRequest, Where } from 'payload'
import { PERIOD_DAYS, PAGE_SIZE, count, deltaOf, fa, one, pageParam, pagerOf, sortHref, sortOf, sparkLabel, staffAccess, staffCtx, trend } from '../../../lib/consoleData'
import { ENROLLMENT_STATUS, pill } from '../../../lib/consoleLabels'
import { docOf } from '../../../lib/ids'
import type { StaffSession } from '../../../lib/staff'
import type { Cohort, Course, Enrollment, User } from '../../../payload-types'
import { DeskPage, MainSide, PageHeader, consoleBtn } from '../Desk'

const BASE = '/staff/students'
type Props = { s: StaffSession & { user: User; req: PayloadRequest }; sp: Record<string, string | string[] | undefined> }

/** Students desk: enrolments with progress, filters and a status split. Data: enrollments (+ lessons for progress), this academy only. */
export async function StudentsDesk({ s, sp }: Props) {
  const c = staffCtx(s)
  const q = one(sp.q).trim()
  const status = one(sp.status)
  const page = pageParam(sp.page)
  const sorted = sortOf(one(sp.sort), ['createdAt', 'status'], '-createdAt')
  const params = { q: q || undefined, status: status || undefined, sort: one(sp.sort) || undefined }
  const where: Where[] = [{ tenant: { equals: s.tenant.id } }]
  if (status in ENROLLMENT_STATUS) where.push({ status: { equals: status } })
  if (q) where.push({ or: [{ 'user.name': { contains: q } }, { 'user.email': { contains: q } }, { 'user.phone': { contains: q } }] })

  const [enrol, certs, list, mix] = await Promise.all([
    trend(c, 'enrollments'),
    trend(c, 'certificates'),
    s.req.payload.find({ collection: 'enrollments', where: { and: where }, sort: sorted.sort, page, limit: PAGE_SIZE, depth: 1, overrideAccess: false, req: s.req }).catch(() => null),
    Promise.all(Object.keys(ENROLLMENT_STATUS).map(async (k) => ({ k, n: await count(c, 'enrollments', { status: { equals: k } }) }))),
  ])

  // Lessons per course, for the progress bar (one query for the courses on this page).
  const courseIds = [...new Set((list?.docs ?? []).map((e) => docOf<Course>(e.course)?.id ?? (typeof e.course === 'number' ? e.course : null)).filter((x): x is number => x !== null))]
  const lessonCount = new Map<number, number>()
  if (courseIds.length) {
    const ls = await s.req.payload
      .find({ collection: 'lessons', where: { and: [{ tenant: { equals: s.tenant.id } }, { course: { in: courseIds } }] }, depth: 0, limit: 5000, pagination: false, select: { course: true } as never, overrideAccess: false, req: s.req })
      .catch(() => null)
    for (const l of (ls?.docs ?? []) as unknown as { course: number | Course }[]) {
      const id = typeof l.course === 'object' ? l.course.id : l.course
      lessonCount.set(id, (lessonCount.get(id) ?? 0) + 1)
    }
  }

  const total = mix.reduce((n, m) => n + (m.n ?? 0), 0)
  const segs = mix.filter((m) => (m.n ?? 0) > 0).map((m) => ({ label: ENROLLMENT_STATUS[m.k]!.label, value: m.n ?? 0, display: fa(m.n ?? 0) }))
  const activeN = mix.find((m) => m.k === 'active')?.n ?? 0
  const doneN = mix.find((m) => m.k === 'completed')?.n ?? 0

  const columns: Column<Enrollment>[] = [
    {
      key: 'user',
      header: 'دانشجو',
      cell: (e) => {
        const u = docOf<User>(e.user)
        return <EntityCell icon="student" title={u?.name || u?.email || '—'} code={u?.email} />
      },
    },
    { key: 'course', header: 'دوره', cell: (e) => <span className="block max-w-44 truncate">{docOf<Course>(e.course)?.title ?? '—'}</span> },
    { key: 'cohort', header: 'گروه', cell: (e) => <span className="block max-w-36 truncate text-muted">{docOf<Cohort>(e.cohort)?.title ?? '—'}</span> },
    {
      key: 'progress',
      header: 'پیشرفت',
      cell: (e) => {
        const cid = docOf<Course>(e.course)?.id ?? (typeof e.course === 'number' ? e.course : 0)
        const lessons = lessonCount.get(cid) ?? 0
        const done = (e.completedLessons ?? []).length
        if (!lessons) return <span className="text-muted">—</span>
        const pct = Math.min(100, (done / lessons) * 100)
        return (
          <span className="flex w-32 items-center gap-2">
            <MiniBar pct={pct} label={`${fa(done)} از ${fa(lessons)} جلسه`} className="flex-1" />
            <span className="text-xs text-muted">{fa(Math.round(pct))}٪</span>
          </span>
        )
      },
    },
    {
      key: 'status',
      header: 'وضعیت',
      sort: sortHref(BASE, params, 'status', sorted),
      cell: (e) => {
        const p = pill(ENROLLMENT_STATUS, e.status)
        return <Pill tone={p.tone}>{p.label}</Pill>
      },
    },
    { key: 'createdAt', header: 'ثبت‌نام', sort: sortHref(BASE, params, 'createdAt', sorted), cell: (e) => <span className="whitespace-nowrap text-muted">{formatJalali(e.enrolledAt ?? e.createdAt, 'd MMM yyyy')}</span> },
  ]
  const pager = list ? pagerOf(BASE, params, list.page ?? 1, list.totalPages, list.totalDocs) : null
  const acc = staffAccess(s)

  return (
    <DeskPage desk="students">
      <PageHeader
        title="دانشجویان"
        subtitle={`ثبت‌نام‌ها و پیشرفت دانشجویان ${s.tenant.name}. آمار ${fa(PERIOD_DAYS)} روز گذشته در برابر ${fa(PERIOD_DAYS)} روز قبل.`}
        actions={
          <a href="/admin/collections/users" className={consoleBtn.secondary}>
            فهرست کاربران <span aria-hidden>↗</span>
          </a>
        }
      />
      <KpiGrid>
        <KpiCard label="ثبت‌نام فعال" value={fa(activeN)} icon="student" progress={total ? { pct: (activeN / total) * 100, text: `${fa(Math.round((activeN / total) * 100))}٪ از کل ثبت‌نام‌ها`, tone: 'ok' } : undefined} />
        {enrol ? <KpiCard label="ثبت‌نام تازه" value={fa(enrol.current)} icon="enrol" delta={deltaOf(enrol.current, enrol.previous)} spark={{ values: enrol.spark, label: sparkLabel('ثبت‌نام‌ها') }} /> : null}
        <KpiCard label="تکمیل‌شده" value={fa(doneN)} icon="check" progress={total ? { pct: (doneN / total) * 100, text: `${fa(Math.round((doneN / total) * 100))}٪ از کل ثبت‌نام‌ها`, tone: 'brand' } : undefined} />
        {certs ? <KpiCard label="گواهی صادرشده" value={fa(certs.current)} icon="certificate" delta={deltaOf(certs.current, certs.previous)} spark={{ values: certs.spark, label: sparkLabel('گواهی‌ها'), tone: 2 }} href="/admin/collections/certificates" /> : null}
      </KpiGrid>

      <FilterBar action={BASE} resetHref={BASE}>
        <FilterSearch label="جست‌وجوی دانشجو" placeholder="نام، ایمیل یا شمارهٔ تلفن" defaultValue={q} />
        <FilterSelect name="status" label="وضعیت ثبت‌نام" defaultValue={status} options={[{ value: '', label: 'همه' }, ...Object.entries(ENROLLMENT_STATUS).map(([value, v]) => ({ value, label: v.label }))]} />
      </FilterBar>

      <MainSide
        main={
          <Panel title="ثبت‌نام‌ها" subtitle={list ? `نمایش ${fa(list.docs.length)} از ${fa(list.totalDocs)} نتیجه` : undefined} headingId="h-enrol">
            {list ? (
              <>
                <DataTable caption="فهرست ثبت‌نام‌ها" columns={columns} rows={list.docs} rowKey={(e) => String(e.id)} empty={<EmptyState icon="student" title="ثبت‌نامی پیدا نشد." description="جست‌وجو یا فیلتر را تغییر دهید." action={<a href={BASE} className={consoleBtn.secondary}>پاک کردن فیلتر</a>} />} />
                {pager?.show ? <Pagination summary={pager.summary} pages={pager.pages} prev={pager.prev} next={pager.next} /> : null}
              </>
            ) : (
              <EmptyState icon="lock" title="فهرست ثبت‌نام‌ها برای نقش شما فعال نیست." />
            )}
          </Panel>
        }
        side={
          <>
            <Panel title="وضعیت ثبت‌نام‌ها" headingId="h-mix">
              {segs.length ? <DonutWithLegend segments={segs} centerValue={fa(total)} centerLabel="ثبت‌نام" label="سهم هر وضعیت از ثبت‌نام‌ها" /> : <EmptyState icon="student" title="هنوز ثبت‌نامی نیست." />}
            </Panel>
            <Panel title="میان‌برها" headingId="h-quick">
              <QuickActions
                items={[
                  ...(acc.create.users ? [{ key: 'user', icon: 'users' as const, title: 'کاربر تازه', hint: 'افزودن دانشجو یا همکار', href: '/admin/collections/users/create' }] : []),
                  { key: 'enrol', icon: 'enrol' as const, title: 'همهٔ ثبت‌نام‌ها', hint: 'فهرست کامل در تنظیمات', href: '/admin/collections/enrollments' },
                ]}
              />
            </Panel>
          </>
        }
      />
    </DeskPage>
  )
}
