import { formatJalali } from '@edvora/core'
import { DataTable, DonutWithLegend, EmptyState, EntityCell, FilterBar, FilterSearch, FilterSelect, KpiCard, KpiGrid, Pagination, Panel, Pill, QuickActions, type Column } from '@edvora/ui/console'
import type { PayloadRequest, Where } from 'payload'
import { PERIOD_DAYS, PAGE_SIZE, count, deltaOf, fa, one, pageParam, pagerOf, sortHref, sortOf, sparkLabel, staffCtx, trend, has } from '../../../lib/consoleData'
import { SUBMISSION_STATUS, pill } from '../../../lib/consoleLabels'
import { docOf } from '../../../lib/ids'
import type { StaffSession } from '../../../lib/staff'
import type { Assignment, Course, Submission, User } from '../../../payload-types'
import { DeskPage, MainSide, PageHeader, consoleBtn } from '../Desk'

const BASE = '/staff/teaching'
type Props = { s: StaffSession & { user: User; req: PayloadRequest }; sp: Record<string, string | string[] | undefined> }

/** Teaching desk: submissions to grade, quiz attempts. Scoped instructors only see what the collections' access allows. */
export async function TeachingDesk({ s, sp }: Props) {
  const c = staffCtx(s)
  const q = one(sp.q).trim()
  const status = one(sp.status) || 'submitted'
  const page = pageParam(sp.page)
  const sorted = sortOf(one(sp.sort), ['submittedAt', 'status'], 'submittedAt')
  const params = { q: q || undefined, status: one(sp.status) || undefined, sort: one(sp.sort) || undefined }
  const where: Where[] = [{ tenant: { equals: s.tenant.id } }]
  if (status in SUBMISSION_STATUS) where.push({ status: { equals: status } })
  if (q) where.push({ or: [{ 'user.name': { contains: q } }, { 'user.email': { contains: q } }] })

  // Submissions/attempts read access also covers one's OWN work as a student; the desk needs the staff permission.
  const grade = has(s, 'submissions.grade')
  const results = has(s, 'enrollments.view', 'quizzes.manage')
  const [subs, attempts, waiting, late, list, mix] = await Promise.all([
    grade ? trend(c, 'submissions') : null,
    results ? trend(c, 'quiz-attempts') : null,
    grade ? count(c, 'submissions', { status: { equals: 'submitted' } }) : null,
    grade ? count(c, 'submissions', { status: { equals: 'submitted' } }, { late: { equals: true } }) : null,
    grade ? s.req.payload.find({ collection: 'submissions', where: { and: where }, sort: sorted.sort, page, limit: PAGE_SIZE, depth: 1, overrideAccess: false, req: s.req }).catch(() => null) : null,
    grade ? Promise.all(Object.keys(SUBMISSION_STATUS).map(async (k) => ({ k, n: await count(c, 'submissions', { status: { equals: k } }) }))) : [],
  ])
  const segs = mix.filter((m) => (m.n ?? 0) > 0).map((m) => ({ label: SUBMISSION_STATUS[m.k]!.label, value: m.n ?? 0, display: fa(m.n ?? 0) }))
  const total = segs.reduce((n, x) => n + x.value, 0)

  const columns: Column<Submission>[] = [
    {
      key: 'user',
      header: 'دانشجو',
      cell: (x) => {
        const u = docOf<User>(x.user)
        return <EntityCell icon="student" title={u?.name || u?.email || '—'} code={`#${x.id}`} href={`/admin/collections/submissions/${x.id}`} />
      },
    },
    { key: 'assignment', header: 'تکلیف', cell: (x) => <span className="block max-w-48 truncate">{docOf<Assignment>(x.assignment)?.title ?? '—'}</span> },
    { key: 'course', header: 'دوره', cell: (x) => <span className="block max-w-40 truncate text-muted">{docOf<Course>(x.course)?.title ?? '—'}</span> },
    { key: 'submittedAt', header: 'تحویل', sort: sortHref(BASE, params, 'submittedAt', sorted), cell: (x) => <span className="whitespace-nowrap text-muted">{x.submittedAt ? formatJalali(x.submittedAt, 'd MMM · HH:mm') : '—'}</span> },
    {
      key: 'status',
      header: 'وضعیت',
      sort: sortHref(BASE, params, 'status', sorted),
      cell: (x) => {
        const p = pill(SUBMISSION_STATUS, x.status)
        return (
          <span className="flex flex-wrap gap-1">
            <Pill tone={p.tone}>{p.label}</Pill>
            {x.late ? <Pill tone="danger">با تأخیر</Pill> : null}
          </span>
        )
      },
    },
    { key: 'score', header: 'نمره', align: 'end', cell: (x) => (x.score != null ? <span className="font-bold">{fa(x.score)}</span> : <span className="text-muted">—</span>) },
    {
      key: 'act',
      header: '',
      align: 'end',
      cell: (x) => (
        <a href={`/admin/collections/submissions/${x.id}`} className={consoleBtn.small}>
          {x.status === 'submitted' ? 'نمره‌دهی' : 'مشاهده'}
        </a>
      ),
    },
  ]
  const pager = list ? pagerOf(BASE, params, list.page ?? 1, list.totalPages, list.totalDocs) : null

  return (
    <DeskPage desk="teaching">
      <PageHeader title="آموزش" subtitle={`تکالیف و آزمون‌های دوره‌های شما. آمار ${fa(PERIOD_DAYS)} روز گذشته در برابر ${fa(PERIOD_DAYS)} روز قبل.`} actions={<a href="/admin/collections/submissions" className={consoleBtn.secondary}>همهٔ تحویل‌ها <span aria-hidden>↗</span></a>} />
      <KpiGrid>
        <KpiCard label="در انتظار نمره" value={waiting === null ? '—' : fa(waiting)} icon="grading" hint={waiting ? 'تحویل‌هایی که هنوز نمره نگرفته‌اند' : 'چیزی برای نمره‌دهی نیست'} />
        <KpiCard label="با تأخیر تحویل‌شده" value={late === null ? '—' : fa(late)} icon="clock" hint="از میان تحویل‌های بی‌نمره" />
        {subs ? <KpiCard label="تحویل تازه" value={fa(subs.current)} icon="assignment" delta={deltaOf(subs.current, subs.previous)} spark={{ values: subs.spark, label: sparkLabel('تحویل تکالیف'), tone: 3 }} /> : null}
        {attempts ? <KpiCard label="تلاش در آزمون" value={fa(attempts.current)} icon="quiz" delta={deltaOf(attempts.current, attempts.previous)} spark={{ values: attempts.spark, label: sparkLabel('تلاش‌های آزمون'), tone: 2 }} /> : null}
      </KpiGrid>

      <FilterBar action={BASE} resetHref={BASE}>
        <FilterSearch label="جست‌وجوی دانشجو" placeholder="نام یا ایمیل دانشجو" defaultValue={q} />
        <FilterSelect name="status" label="وضعیت" defaultValue={status} options={[{ value: '', label: 'همه' }, ...Object.entries(SUBMISSION_STATUS).map(([value, v]) => ({ value, label: v.label }))]} />
      </FilterBar>

      <MainSide
        main={
          <Panel title="تحویل تکالیف" subtitle={list ? `نمایش ${fa(list.docs.length)} از ${fa(list.totalDocs)} نتیجه` : undefined} headingId="h-subs">
            {list ? (
              <>
                <DataTable caption="فهرست تحویل تکالیف" columns={columns} rows={list.docs} rowKey={(x) => String(x.id)} empty={<EmptyState icon="grading" title={status === 'submitted' ? 'تکلیفی در انتظار نمره نیست.' : 'موردی پیدا نشد.'} description="وقتی دانشجویی تکلیفی تحویل دهد، اینجا می‌بینید." />} />
                {pager?.show ? <Pagination summary={pager.summary} pages={pager.pages} prev={pager.prev} next={pager.next} /> : null}
              </>
            ) : (
              <EmptyState icon="lock" title="فهرست تحویل‌ها برای نقش شما فعال نیست." />
            )}
          </Panel>
        }
        side={
          <>
            <Panel title="وضعیت تحویل‌ها" headingId="h-mix">
              {segs.length ? <DonutWithLegend segments={segs} centerValue={fa(total)} centerLabel="تحویل" label="سهم هر وضعیت از تحویل‌ها" /> : <EmptyState icon="assignment" title="هنوز تحویلی ثبت نشده است." />}
            </Panel>
            <Panel title="میان‌برها" headingId="h-quick">
              <QuickActions
                items={[
                  { key: 'assign', icon: 'assignment', title: 'تکالیف', hint: 'تعریف و ویرایش تکلیف', href: '/admin/collections/assignments' },
                  { key: 'quiz', icon: 'quiz', title: 'آزمون‌ها', hint: 'ساخت و ویرایش آزمون', href: '/admin/collections/quizzes' },
                  { key: 'lesson', icon: 'lesson', title: 'جلسات', hint: 'محتوای جلسه‌ها', href: '/admin/collections/lessons' },
                  { key: 'results', icon: 'chart', title: 'نتایج آزمون‌ها', hint: 'تلاش‌های دانشجویان', href: '/admin/collections/quiz-attempts' },
                ]}
              />
            </Panel>
          </>
        }
      />
    </DeskPage>
  )
}
