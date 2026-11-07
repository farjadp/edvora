import 'server-only'
import { formatJalali, formatToman, rial } from '@edvora/core'
import { toPersianDigits } from '@edvora/core/digits'
import type { ActivityItem, AlertItem, BarSeries, DonutSegment, KpiCardProps, KpiDelta, PageLink, QuickAction } from '@edvora/ui/console'
import type { CollectionSlug, Payload, PayloadRequest, TypedUser, Where } from 'payload'
import { ENROLLMENT_STATUS, LEAD_STATUS, ORDER_STATUS, SUBMISSION_STATUS, pill } from './consoleLabels'
import { docOf } from './ids'
import type { Course, Order, User } from '../payload-types'

/**
 * Console data (E-035): real, tenant-filtered numbers for the /staff desks and the /admin dashboard.
 * Every query names the tenant explicitly (AGENTS.md) AND runs with `overrideAccess: false` as the signed-in user, so
 * the collections' own access rules (scoped instructors, advisors' own leads) still apply. Nothing is invented: no
 * data means an empty state. Period for every delta and sparkline: the last 30 days against the 30 days before;
 * sparklines show the last 14 days; the bar chart compares the last 7 days with the 7 before.
 */
export type DataCtx = {
  payload: Payload
  user: TypedUser
  /** Selected academy. Null (platform admin without a selection) = every academy the user may read. */
  tenantId: number | null
  req?: PayloadRequest
}

const DAY = 86_400_000
export const PERIOD_DAYS = 30
export const fa = (n: number | string) => toPersianDigits(String(n))
export const faNum = (n: number) => toPersianDigits(Math.round(n).toLocaleString('en-US').replace(/,/g, '٬'))

const acc = (c: DataCtx) => ({ overrideAccess: false as const, ...(c.req ? { req: c.req } : { user: c.user }) })
export const tenantWhere = (c: DataCtx): Where[] => (c.tenantId != null ? [{ tenant: { equals: c.tenantId } }] : [])
const and = (c: DataCtx, ...w: Where[]): Where => ({ and: [...tenantWhere(c), ...w] })

type Collection = 'orders' | 'enrollments' | 'leads' | 'submissions' | 'certificates' | 'quiz-attempts'

/** Safe count: a collection the user may not read, or any failure, is "no data" (null), never a thrown error. */
export async function count(c: DataCtx, collection: CollectionSlug, ...w: Where[]): Promise<number | null> {
  try {
    const r = await c.payload.count({ collection, where: and(c, ...w), ...acc(c) })
    return r.totalDocs
  } catch (err) {
    c.payload.logger.error({ err, msg: `console: count ${collection} failed` })
    return null
  }
}

export type Trend = {
  /** Last 30 days / the 30 before. */
  current: number
  previous: number
  /** Last 14 days, oldest first. */
  spark: number[]
  /** Last 7 / the 7 before, oldest first. */
  week: number[]
  weekBefore: number[]
}

type Dated = { createdAt: string }

/** One query: createdAt (and an optional weight) of everything in the last 60 days, bucketed by day. */
export async function trend(c: DataCtx, collection: Collection, opts: { where?: Where; weight?: (d: never) => number; now?: Date } = {}): Promise<Trend | null> {
  const now = opts.now ?? new Date()
  const since = new Date(now.getTime() - 2 * PERIOD_DAYS * DAY).toISOString()
  let docs: Dated[]
  try {
    const r = await c.payload.find({
      collection,
      where: and(c, { createdAt: { greater_than_equal: since } }, ...(opts.where ? [opts.where] : [])),
      depth: 0,
      limit: 5000,
      pagination: false,
      ...(opts.weight ? {} : { select: { createdAt: true } as never }),
      ...acc(c),
    })
    docs = r.docs as unknown as Dated[]
  } catch (err) {
    c.payload.logger.error({ err, msg: `console: trend ${collection} failed` })
    return null
  }
  const days = new Array<number>(2 * PERIOD_DAYS).fill(0)
  for (const d of docs) {
    const ago = Math.floor((now.getTime() - new Date(d.createdAt).getTime()) / DAY)
    if (ago >= 0 && ago < days.length) days[ago]! += opts.weight ? opts.weight(d as never) : 1
  }
  const sum = (a: number[]) => a.reduce((n, v) => n + v, 0)
  const oldestFirst = (from: number, to: number) => days.slice(from, to).reverse()
  return {
    current: sum(days.slice(0, PERIOD_DAYS)),
    previous: sum(days.slice(PERIOD_DAYS)),
    spark: oldestFirst(0, 14),
    week: oldestFirst(0, 7),
    weekBefore: oldestFirst(7, 14),
  }
}

export const PERIOD_NOTE = `نسبت به ${fa(PERIOD_DAYS)} روز قبل`

/** This period against the previous one. No baseline = no percentage (never divide by zero or invent one). */
export function deltaOf(current: number, previous: number, goodWhen: 'up' | 'down' = 'up'): KpiDelta {
  if (previous === 0) {
    return { text: current === 0 ? 'بدون رویداد' : 'بدون دورهٔ قبل برای مقایسه', trend: 'flat', tone: 'neutral', note: '' }
  }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return { text: 'بدون تغییر', trend: 'flat', tone: 'neutral', note: PERIOD_NOTE }
  const up = pct > 0
  return { text: `${fa(Math.abs(pct))}٪ ${up ? 'بیشتر' : 'کمتر'}`, trend: up ? 'up' : 'down', tone: up === (goodWhen === 'up') ? 'ok' : 'danger', note: PERIOD_NOTE }
}

export const sparkLabel = (what: string) => `${what}، روند ${fa(14)} روز گذشته`

/* ---------------------------------------------------------------- Pagination / sorting helpers */

export const PAGE_SIZE = 8

export function pageParam(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v)
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1
}
export const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))

/** Link builder that keeps the current filters. */
export function hrefWith(base: string, params: Record<string, string | undefined>, patch: Record<string, string | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `${base}?${s}` : base
}

export function pagerOf(base: string, params: Record<string, string | undefined>, page: number, totalPages: number, totalDocs: number, size = PAGE_SIZE) {
  const from = totalDocs === 0 ? 0 : (page - 1) * size + 1
  const to = Math.min(page * size, totalDocs)
  const first = Math.max(1, Math.min(page - 2, totalPages - 4))
  const last = Math.min(totalPages, first + 4)
  const pages: PageLink[] = []
  for (let p = first; p <= last; p++) pages.push({ label: fa(p), href: hrefWith(base, params, { page: p === 1 ? undefined : String(p) }), current: p === page })
  return {
    summary: totalDocs === 0 ? 'موردی نیست' : `نمایش ${fa(from)} تا ${fa(to)} از ${fa(totalDocs)}`,
    pages: totalPages > 1 ? pages : [],
    prev: page > 1 ? hrefWith(base, params, { page: page - 1 === 1 ? undefined : String(page - 1) }) : null,
    next: page < totalPages ? hrefWith(base, params, { page: String(page + 1) }) : null,
    show: totalPages > 1,
  }
}

/** `-field` = descending. Only whitelisted fields; anything else falls back. */
export function sortOf(raw: string, allowed: readonly string[], fallback: string): { field: string; dir: 'asc' | 'desc'; sort: string } {
  const field = raw.replace(/^-/, '')
  if (!allowed.includes(field)) return { field: fallback.replace(/^-/, ''), dir: fallback.startsWith('-') ? 'desc' : 'asc', sort: fallback }
  return { field, dir: raw.startsWith('-') ? 'desc' : 'asc', sort: raw }
}

/** Header link: first click ascending, next click descending, third clears. */
export function sortHref(base: string, params: Record<string, string | undefined>, field: string, current: { field: string; dir: 'asc' | 'desc' } | null) {
  const active = current?.field === field
  const next = !active ? field : current.dir === 'asc' ? `-${field}` : undefined
  return { href: hrefWith(base, params, { sort: next, page: undefined }), dir: active ? current.dir : null }
}

/* ---------------------------------------------------------------- Overview (staff overview + /admin dashboard) */

export type CollAccess = {
  orders: boolean
  enrollments: boolean
  leads: boolean
  submissions: boolean
  create: { courses: boolean; coupons: boolean; posts: boolean; users: boolean }
}

export type OverviewData = {
  kpis: (KpiCardProps & { key: string })[]
  donut: { segments: (DonutSegment & { display: string })[]; centerValue: string; centerLabel: string } | null
  bars: { what: string; categories: string[]; series: BarSeries[]; empty: boolean } | null
  alerts: AlertItem[]
  quick: QuickAction[]
  activity: ActivityItem[]
  summary: { totalValue: string; rows: { label: string; value: string; pct: number; tone: 'ok' | 'warn' | 'brand' }[]; footer: { label: string; value: string }[] } | null
}

const WEEK_LABELS = ['۶ روز پیش', '۵', '۴', '۳', '۲', 'دیروز', 'امروز']

export async function getOverview(c: DataCtx, a: CollAccess, now = new Date()): Promise<OverviewData> {
  const orderWeight = (o: Pick<Order, 'total'>) => o.total
  const [enrol, sales, leads, subs, openOrders, enrolActive, orderMix, leadsNoFollow, subsWaiting] = await Promise.all([
    a.enrollments ? trend(c, 'enrollments', { now }) : null,
    a.orders ? trend(c, 'orders', { where: { status: { equals: 'paid' } }, weight: orderWeight as never, now }) : null,
    a.leads ? trend(c, 'leads', { now }) : null,
    a.submissions ? trend(c, 'submissions', { now }) : null,
    a.orders
      ? c.payload
          .find({ collection: 'orders', where: and(c, { status: { in: ['pending', 'partially_paid'] } }), depth: 0, limit: 5000, pagination: false, select: { instalments: true, status: true } as never, ...acc(c) })
          .then((r) => r.docs as unknown as Pick<Order, 'instalments'>[])
          .catch(() => null)
      : null,
    a.enrollments
      ? c.payload
          .find({ collection: 'enrollments', where: and(c, { status: { equals: 'active' } }), depth: 0, limit: 5000, pagination: false, select: { course: true } as never, ...acc(c) })
          .then((r) => r.docs as unknown as { course: number | Course }[])
          .catch(() => null)
      : null,
    a.orders
      ? c.payload
          .find({ collection: 'orders', where: and(c, { createdAt: { greater_than_equal: new Date(now.getTime() - PERIOD_DAYS * DAY).toISOString() } }), depth: 0, limit: 5000, pagination: false, select: { total: true, status: true } as never, ...acc(c) })
          .then((r) => r.docs as unknown as Pick<Order, 'total' | 'status'>[])
          .catch(() => null)
      : null,
    a.leads ? count(c, 'leads', { status: { equals: 'new' } }, { nextFollowUpAt: { exists: false } }) : null,
    a.submissions ? count(c, 'submissions', { status: { equals: 'submitted' } }) : null,
  ])

  const overdue = openOrders
    ? openOrders.reduce((n, o) => n + (o.instalments ?? []).filter((i) => i.status !== 'paid' && new Date(i.dueDate).getTime() < now.getTime()).length, 0)
    : null

  // KPIs ---------------------------------------------------------------
  const kpis: OverviewData['kpis'] = []
  if (enrol) kpis.push({ key: 'enrol', label: 'ثبت‌نام‌های تازه', value: fa(enrol.current), icon: 'enrol', delta: deltaOf(enrol.current, enrol.previous), spark: { values: enrol.spark, label: sparkLabel('ثبت‌نام‌ها') }, href: '/admin/collections/enrollments' })
  if (sales) {
    const paidShare = orderMix && orderMix.length ? (orderMix.filter((o) => o.status === 'paid').length / orderMix.length) * 100 : null
    kpis.push({
      key: 'sales',
      label: 'فروش تسویه‌شده',
      value: formatToman(rial(sales.current), { unit: false }),
      icon: 'card',
      delta: deltaOf(sales.current, sales.previous),
      spark: { values: sales.spark, label: sparkLabel('فروش'), tone: 2 },
      progress: paidShare === null ? undefined : { pct: paidShare, text: `${fa(Math.round(paidShare))}٪ سفارش‌های این دوره پرداخت‌شده`, tone: 'ok' },
      href: '/admin/collections/orders',
      hint: 'تومان',
    })
  }
  if (leads) {
    kpis.push({ key: 'leads', label: 'سرنخ‌های تازه', value: fa(leads.current), icon: 'leads', delta: deltaOf(leads.current, leads.previous), spark: { values: leads.spark, label: sparkLabel('سرنخ‌ها'), tone: 3 }, href: '/admin/collections/leads' })
  }
  if (overdue !== null) {
    kpis.push({ key: 'overdue', label: 'اقساط سررسیدگذشته', value: fa(overdue), icon: 'clock', hint: overdue === 0 ? 'همهٔ اقساط به‌روز است.' : 'هنوز پرداخت نشده؛ همین حالا', href: '/admin/collections/orders' })
  }
  if (subsWaiting !== null && kpis.length < 4) {
    kpis.push({ key: 'grading', label: 'تکلیف در انتظار نمره', value: fa(subsWaiting), icon: 'grading', delta: subs ? deltaOf(subs.current, subs.previous, 'up') : undefined, spark: subs ? { values: subs.spark, label: sparkLabel('تحویل تکالیف'), tone: 4 } : undefined, href: '/admin/collections/submissions' })
  }

  // Donut: active enrolments by course -----------------------------------
  let donut: OverviewData['donut'] = null
  if (enrolActive) {
    const byCourse = new Map<number, number>()
    for (const e of enrolActive) {
      const id = typeof e.course === 'object' ? e.course.id : e.course
      byCourse.set(id, (byCourse.get(id) ?? 0) + 1)
    }
    const top = [...byCourse.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4)
    const titles = new Map<number, string>()
    if (top.length) {
      try {
        const cs = await c.payload.find({ collection: 'courses', where: { id: { in: top.map(([id]) => id) } }, depth: 0, limit: 10, pagination: false, select: { title: true } as never, ...acc(c) })
        for (const d of cs.docs as unknown as Pick<Course, 'id' | 'title'>[]) titles.set(d.id, d.title)
      } catch {
        /* titles fall back to «دوره» */
      }
    }
    const rest = [...byCourse.values()].reduce((n, v) => n + v, 0) - top.reduce((n, [, v]) => n + v, 0)
    const segs: (DonutSegment & { display: string })[] = top.map(([id, v]) => ({ label: titles.get(id) ?? 'دوره', value: v, display: fa(v) }))
    if (rest > 0) segs.push({ label: 'سایر دوره‌ها', value: rest, display: fa(rest) })
    donut = { segments: segs, centerValue: fa(enrolActive.length), centerLabel: 'ثبت‌نام فعال' }
  }

  // Bars: last 7 days vs the 7 before ------------------------------------
  let bars: OverviewData['bars'] = null
  const src = enrol ?? leads
  if (src) {
    bars = {
      what: enrol ? 'ثبت‌نام‌ها' : 'سرنخ‌ها',
      categories: WEEK_LABELS.map((l) => fa(l)),
      series: [
        { label: 'این هفته', values: src.week, tone: 1 },
        { label: 'هفتهٔ قبل', values: src.weekBefore, tone: 4 },
      ],
      empty: [...src.week, ...src.weekBefore].every((v) => v === 0),
    }
  }

  // Alerts: only counts backed by real fields -----------------------------
  const alerts: AlertItem[] = []
  if (overdue) alerts.push({ key: 'overdue', icon: 'clock', title: `${fa(overdue)} قسط سررسیدگذشته`, detail: 'سفارش‌هایی که قسطشان از موعد گذشته و هنوز پرداخت نشده.', pill: { tone: 'danger', label: 'مالی' }, action: { label: 'بررسی', href: '/admin/collections/orders' } })
  if (subsWaiting) alerts.push({ key: 'grading', icon: 'grading', title: `${fa(subsWaiting)} تکلیف در انتظار نمره`, detail: 'تحویل‌هایی که هنوز نمره نگرفته‌اند.', pill: { tone: 'warn', label: 'آموزش' }, action: { label: 'نمره‌دهی', href: '/admin/collections/submissions?where[status][equals]=submitted' } })
  if (leadsNoFollow) alerts.push({ key: 'leads', icon: 'phone', title: `${fa(leadsNoFollow)} سرنخ جدید بدون زمان پیگیری`, detail: 'وضعیت «جدید» و بدون تاریخ پیگیری.', pill: { tone: 'info', label: 'مشتریان' }, action: { label: 'پیگیری', href: '/admin/collections/leads?where[status][equals]=new' } })

  // Quick actions -----------------------------------------------------------
  const quick: QuickAction[] = []
  if (a.create.courses) quick.push({ key: 'course', icon: 'course', title: 'دورهٔ تازه', hint: 'ساخت پیش‌نویس دوره', href: '/admin/collections/courses/create' })
  if (a.create.coupons) quick.push({ key: 'coupon', icon: 'coupon', title: 'کد تخفیف', hint: 'تعریف کد تازه', href: '/admin/collections/coupons/create' })
  if (a.create.posts) quick.push({ key: 'post', icon: 'post', title: 'مقالهٔ تازه', hint: 'نوشتن برای مجله', href: '/admin/collections/posts/create' })
  if (a.create.users) quick.push({ key: 'user', icon: 'users', title: 'کاربر تازه', hint: 'افزودن عضو', href: '/admin/collections/users/create' })

  // Activity: the latest few of each source -----------------------------------
  const events: (ActivityItem & { at: number })[] = []
  const latest = <T,>(collection: Collection, extra?: Where) =>
    c.payload
      .find({ collection, where: and(c, ...(extra ? [extra] : [])), sort: '-createdAt', limit: 5, depth: 1, ...acc(c) })
      .then((r) => r.docs as unknown as (T & { id: number; createdAt: string })[])
      .catch(() => [] as (T & { id: number; createdAt: string })[])
  const [lo, le, ll, ls] = await Promise.all([
    a.orders ? latest<Order>('orders') : [],
    a.enrollments ? latest<{ user: number | User; course: number | Course; status?: string | null }>('enrollments') : [],
    a.leads ? latest<{ name: string; status: string }>('leads') : [],
    a.submissions ? latest<{ user: number | User; status?: string | null }>('submissions') : [],
  ])
  const who = (u: unknown) => docOf<User>(u as User)?.name || docOf<User>(u as User)?.email || 'کاربر'
  const cTitle = (x: unknown) => docOf<Course>(x as Course)?.title
  for (const o of lo) {
    const s = pill(ORDER_STATUS, o.status)
    events.push({ at: +new Date(o.createdAt), key: `o${o.id}`, time: formatJalali(o.createdAt, 'd MMM'), kind: { tone: 'info', label: 'سفارش' }, title: `${who(o.user)}${cTitle(o.course) ? ` · ${cTitle(o.course)}` : ''}`, meta: formatToman(rial(o.total)), status: { tone: s.tone, label: s.label } })
  }
  for (const e of le) {
    const s = pill(ENROLLMENT_STATUS, e.status)
    events.push({ at: +new Date(e.createdAt), key: `e${e.id}`, time: formatJalali(e.createdAt, 'd MMM'), kind: { tone: 'ok', label: 'ثبت‌نام' }, title: `${who(e.user)}${cTitle(e.course) ? ` · ${cTitle(e.course)}` : ''}`, status: { tone: s.tone, label: s.label } })
  }
  for (const l of ll) {
    const s = pill(LEAD_STATUS, l.status)
    events.push({ at: +new Date(l.createdAt), key: `l${l.id}`, time: formatJalali(l.createdAt, 'd MMM'), kind: { tone: 'brand', label: 'سرنخ' }, title: l.name, status: { tone: s.tone, label: s.label } })
  }
  for (const x of ls) {
    const s = pill(SUBMISSION_STATUS, x.status)
    events.push({ at: +new Date(x.createdAt), key: `s${x.id}`, time: formatJalali(x.createdAt, 'd MMM'), kind: { tone: 'warn', label: 'تکلیف' }, title: who(x.user), status: { tone: s.tone, label: s.label } })
  }
  const activity = events.sort((x, y) => y.at - x.at).slice(0, 7).map(({ at: _at, ...rest }) => rest)

  // Financial summary (30 days) ------------------------------------------------
  let summary: OverviewData['summary'] = null
  if (orderMix && orderMix.length) {
    const sumBy = (st: string) => orderMix.filter((o) => o.status === st).reduce((n, o) => n + o.total, 0)
    const paid = sumBy('paid')
    const part = sumBy('partially_paid')
    const pend = sumBy('pending')
    const total = paid + part + pend
    const pct = (v: number) => (total ? (v / total) * 100 : 0)
    summary = {
      totalValue: formatToman(rial(total)),
      rows: [
        { label: 'تسویه‌شده', value: formatToman(rial(paid)), pct: pct(paid), tone: 'ok' },
        { label: 'اقساط در جریان', value: formatToman(rial(part)), pct: pct(part), tone: 'brand' },
        { label: 'در انتظار پرداخت', value: formatToman(rial(pend)), pct: pct(pend), tone: 'warn' },
      ],
      footer: [
        { label: 'تعداد سفارش', value: fa(orderMix.length) },
        { label: 'میانگین هر سفارش', value: formatToman(rial(Math.round(orderMix.reduce((n, o) => n + o.total, 0) / orderMix.length))) },
      ],
    }
  }

  return { kpis: kpis.slice(0, 4), donut, bars, alerts, quick, activity, summary }
}

/* ---------------------------------------------------------------- Staff helpers */

import { meets } from '@edvora/core/staff'
import type { StaffPerms } from '@edvora/core/staff'
import type { StaffSession } from './staff'

/** DataCtx for a settled staff session (the academy comes from the Host header, never from the request body). */
export function staffCtx(s: StaffSession & { user: User; req: PayloadRequest }): DataCtx {
  return { payload: s.req.payload, user: s.req.user as TypedUser, tenantId: s.tenant.id, req: s.req }
}

const has = (who: StaffPerms, ...keys: string[]) => meets(who, { any: keys })

/** What the person may see, from the staff permissions (cosmetic; the queries still run under access rules). */
export function staffAccess(who: StaffPerms): CollAccess {
  return {
    orders: has(who, 'orders.view'),
    enrollments: has(who, 'enrollments.view'),
    leads: has(who, 'leads.view'),
    submissions: has(who, 'submissions.grade'),
    create: { courses: has(who, 'courses.edit'), coupons: has(who, 'coupons.manage'), posts: has(who, 'content.edit'), users: has(who, 'users.create') },
  }
}
export { has }
