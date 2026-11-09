import 'server-only'
import {
  DEFAULT_REMINDER_TEXTS,
  OPEN_LEAD_STATUSES,
  STALE_SENDING_MS,
  academyOrigin,
  afterFailure,
  decideSend,
  endOfTehranDay,
  followupDigest,
  formatJalali,
  formatToman,
  instalmentReminders,
  instalmentWindow,
  isQuietTime,
  liveReminders,
  liveWindow,
  maskPhone,
  mustUseMockSms,
  nextSendableAt,
  readReminderSettings,
  rial,
  sandboxState,
  toPersianDigits,
  type DueReminder,
  type ReminderSettings,
} from '@edvora/core'
import { renderTemplate } from '@edvora/core/settings'
import { createMockSmsProvider, type SmsProvider } from '@edvora/integrations/sms'
import { sql } from '@payloadcms/db-postgres'
import type { Payload, Where } from 'payload'
import { env } from '../../env'
import type { SmsLog, Tenant, User } from '../../payload-types'
import { idOf } from '../ids'
import { getSmsFor, messageFor } from '../providers'

/**
 * E-016 SMS reminders worker (ADR 020). Called by the cron route (`POST /api/cron/reminders`) every few minutes.
 * Safe to run as often as you like:
 *  - every reminder has an idempotency key (core) stored in `sms-log.key` (unique), inserted BEFORE the send, so a
 *    rerun or a second instance can never send the same reminder twice;
 *  - quiet hours (Tehran) defer without writing anything, so the first run after quiet hours sends;
 *  - failures are retried with back-off up to MAX_SEND_ATTEMPTS, never past the reminder's expiry;
 *  - a row left in `sending` by a crash is marked `unknown` and NOT retried (at most once beats twice).
 * Every query is filtered by tenant. Errors are logged and counted, never thrown out of a tenant's run.
 */

export type ReminderRunOptions = { now?: Date; tenantSlug?: string }
export type ReminderRunReport = {
  now: string
  tenants: number
  sent: number
  skipped: number
  deferred: number
  failed: number
  dead: number
  retried: number
  duplicates: number
  errors: string[]
}

type TenantCtx = { tenant: Tenant; settings: ReminderSettings; origin: string; sms: SmsProvider }
type Person = { id: number; mobile: string | null; name: string; optedOut: boolean; active: boolean }

const PAGE = 500
let mockSms: SmsProvider | undefined

function personOf(u: Pick<User, 'id' | 'phone' | 'name' | 'firstName' | 'smsReminders' | 'status'>): Person {
  return {
    id: u.id,
    mobile: u.phone ?? null,
    name: (u.firstName || u.name || '').trim(),
    optedOut: u.smsReminders === false,
    active: (u.status ?? 'active') === 'active',
  }
}

const USER_SELECT = { phone: true, name: true, firstName: true, smsReminders: true, status: true } as const

async function loadPeople(payload: Payload, ids: number[]): Promise<Map<number, Person>> {
  const out = new Map<number, Person>()
  const unique = [...new Set(ids)]
  for (let i = 0; i < unique.length; i += PAGE) {
    const res = await payload.find({ collection: 'users', where: { id: { in: unique.slice(i, i + PAGE) } }, pagination: false, depth: 0, overrideAccess: true, select: USER_SELECT })
    for (const u of res.docs) out.set(u.id, personOf(u as User))
  }
  return out
}

async function providerFor(tenant: Tenant): Promise<SmsProvider> {
  // ADR 013 + E-016: sandboxes and `demo` only ever reach the mock, whatever SMS_PROVIDER or their settings say.
  if (mustUseMockSms(tenant)) return (mockSms ??= createMockSmsProvider())
  return (await getSmsFor(tenant.id)).sms
}

function text(ctx: TenantCtx, rule: DueReminder['rule'], vars: Record<string, string>): string {
  const all = { academy: ctx.tenant.name, ...vars }
  const fallback = renderTemplate(DEFAULT_REMINDER_TEXTS[rule], all).trim()
  return messageFor(ctx.tenant, rule, all, fallback).slice(0, 480)
}

/** Unique-key insert. `null` = the key already exists (a rerun or another instance got there first). */
async function claim(payload: Payload, data: Record<string, unknown>): Promise<SmsLog | null> {
  try {
    return await payload.create({ collection: 'sms-log', data: data as never, overrideAccess: true, depth: 0 })
  } catch (err) {
    const exists = await payload.count({ collection: 'sms-log', where: { key: { equals: data.key as string } }, overrideAccess: true })
    if (exists.totalDocs > 0) return null
    throw err
  }
}

async function attempt(payload: Payload, sms: SmsProvider, row: Pick<SmsLog, 'id' | 'expiresAt'>, to: string, body: string, attempts: number, now: Date, r: ReminderRunReport) {
  let result: { ok: true; messageId: string } | { ok: false; error: string }
  try {
    result = await sms.send({ to, text: body })
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  if (result.ok) {
    await payload.update({ collection: 'sms-log', id: row.id, overrideAccess: true, data: { status: 'sent', sentAt: now.toISOString(), provider: sms.name, providerMessageId: result.messageId || null, error: null, nextAttemptAt: null } })
    r.sent++
    return
  }
  const next = afterFailure(attempts, now, row.expiresAt)
  console.error(`[reminders] send ${row.id} failed (attempt ${attempts}): ${result.error}`)
  await payload.update({
    collection: 'sms-log',
    id: row.id,
    overrideAccess: true,
    data: { status: next.status, provider: sms.name, error: result.error.slice(0, 300), nextAttemptAt: next.status === 'failed' ? next.nextAttemptAt.toISOString() : null },
  })
  if (next.status === 'failed') r.failed++
  else r.dead++
}

async function deliver(
  payload: Payload,
  ctx: TenantCtx,
  due: DueReminder,
  who: Person | undefined,
  body: string,
  ref: { collection: string; id: number },
  now: Date,
  r: ReminderRunReport,
) {
  const decision = decideSend(due, { mobile: who?.mobile, optedOut: who?.optedOut, active: who?.active }, now, ctx.settings)
  if (decision.action === 'defer') {
    r.deferred++
    return
  }
  // Cheap pre-check; the unique key in `claim` is the real guarantee.
  const seen = await payload.count({ collection: 'sms-log', where: { key: { equals: due.key } }, overrideAccess: true })
  if (seen.totalDocs > 0) {
    r.duplicates++
    return
  }
  const base = {
    tenant: ctx.tenant.id,
    key: due.key,
    rule: due.rule,
    stage: due.stage,
    recipient: who?.id ?? null,
    toMasked: who?.mobile ? maskPhone(who.mobile) : '—',
    refCollection: ref.collection,
    refId: ref.id,
    expiresAt: due.expiresAt.toISOString(),
  }
  if (decision.action === 'skip') {
    const row = await claim(payload, { ...base, status: 'skipped', error: decision.reason, attempts: 0 })
    if (row) r.skipped++
    else r.duplicates++
    return
  }
  const to = who!.mobile!
  const row = await claim(payload, { ...base, to, text: body, status: 'sending', attempts: 1 })
  if (!row) {
    r.duplicates++
    return
  }
  await attempt(payload, ctx.sms, row, to, body, 1, now, r)
}

// ---------------------------------------------------------------- Rules

async function runInstalments(payload: Payload, ctx: TenantCtx, now: Date, r: ReminderRunReport) {
  if (!ctx.settings.instalment.enabled) return
  const w = instalmentWindow(now, ctx.settings)
  const where: Where = {
    and: [
      { tenant: { equals: ctx.tenant.id } },
      { status: { equals: 'partially_paid' } },
      { 'instalments.dueDate': { greater_than_equal: w.from.toISOString() } },
      { 'instalments.dueDate': { less_than: w.to.toISOString() } },
    ],
  }
  for (let page = 1; ; page++) {
    const res = await payload.find({ collection: 'orders', where, limit: PAGE, page, depth: 1, overrideAccess: true, select: { user: true, course: true, status: true, source: true, instalments: true } })
    const people = await loadPeople(payload, res.docs.map((o) => idOf(o.user)).filter((x): x is number => x !== null))
    for (const o of res.docs) {
      const course = typeof o.course === 'object' && o.course ? o.course.title : ''
      const who = people.get(idOf(o.user) ?? -1)
      for (const i of o.instalments ?? []) {
        const dues = instalmentReminders({ tenantId: ctx.tenant.id, orderId: o.id, orderStatus: o.status, orderSource: o.source, index: i.index, dueDate: i.dueDate, status: i.status }, now, ctx.settings)
        for (const due of dues) {
          const body = text(ctx, due.rule, { name: who?.name ?? '', course, amount: formatToman(rial(i.amount)), dueDate: formatJalali(i.dueDate), link: `${ctx.origin}/pay/${o.id}` })
          await deliver(payload, ctx, due, who, body, { collection: 'orders', id: o.id }, now, r)
        }
      }
    }
    if (!res.hasNextPage) break
  }
}

async function runLive(payload: Payload, ctx: TenantCtx, now: Date, r: ReminderRunReport) {
  if (!ctx.settings.live.enabled) return
  const w = liveWindow(now, ctx.settings)
  const sessions = await payload.find({
    collection: 'live-sessions',
    where: { and: [{ tenant: { equals: ctx.tenant.id } }, { status: { equals: 'scheduled' } }, { startsAt: { greater_than: w.from.toISOString() } }, { startsAt: { less_than_equal: w.to.toISOString() } }] },
    pagination: false,
    depth: 1,
    overrideAccess: true,
    select: { title: true, course: true, cohort: true, startsAt: true, status: true },
  })
  for (const s of sessions.docs) {
    const courseId = idOf(s.course)
    const cohortId = idOf(s.cohort)
    if (courseId === null) continue
    const enrolWhere: Where = {
      and: [{ tenant: { equals: ctx.tenant.id } }, { status: { equals: 'active' } }, cohortId !== null ? { cohort: { equals: cohortId } } : { course: { equals: courseId } }],
    }
    const enrolments = await payload.find({ collection: 'enrollments', where: enrolWhere, pagination: false, depth: 0, overrideAccess: true, select: { user: true } })
    const userIds = enrolments.docs.map((e) => idOf(e.user)).filter((x): x is number => x !== null)
    const people = await loadPeople(payload, userIds)
    const course = typeof s.course === 'object' && s.course ? s.course.title : s.title
    for (const uid of new Set(userIds)) {
      for (const due of liveReminders({ tenantId: ctx.tenant.id, sessionId: s.id, startsAt: s.startsAt, status: s.status }, uid, now, ctx.settings)) {
        const who = people.get(uid)
        const body = text(ctx, due.rule, { name: who?.name ?? '', course, startsAt: formatJalali(s.startsAt, "EEEE d MMMM 'ساعت' HH:mm"), link: `${ctx.origin}/live/${s.id}` })
        await deliver(payload, ctx, due, who, body, { collection: 'live-sessions', id: s.id }, now, r)
      }
    }
  }
}

async function runFollowups(payload: Payload, ctx: TenantCtx, now: Date, r: ReminderRunReport) {
  if (!ctx.settings.followup.enabled) return
  const counts = new Map<number, number>()
  const where: Where = {
    and: [
      { tenant: { equals: ctx.tenant.id } },
      { status: { in: [...OPEN_LEAD_STATUSES] } },
      { advisor: { exists: true } },
      { nextFollowUpAt: { less_than: endOfTehranDay(now).toISOString() } },
    ],
  }
  for (let page = 1; ; page++) {
    const res = await payload.find({ collection: 'leads', where, limit: PAGE, page, depth: 0, overrideAccess: true, select: { advisor: true } })
    for (const l of res.docs) {
      const a = idOf(l.advisor)
      if (a !== null) counts.set(a, (counts.get(a) ?? 0) + 1)
    }
    if (!res.hasNextPage) break
  }
  const people = await loadPeople(payload, [...counts.keys()])
  for (const [advisorId, dueCount] of counts) {
    const due = followupDigest({ tenantId: ctx.tenant.id, advisorId, dueCount }, now, ctx.settings)
    if (!due) continue
    const who = people.get(advisorId)
    const body = text(ctx, due.rule, { name: who?.name ?? '', count: toPersianDigits(dueCount), link: `${ctx.origin}/staff/leads` })
    await deliver(payload, ctx, due, who, body, { collection: 'users', id: advisorId }, now, r)
  }
}

// ---------------------------------------------------------------- Retry and housekeeping

/** Rows stuck in `sending` (crash mid-send): mark `unknown`, never resend. */
async function sweepStale(payload: Payload, now: Date, tenantIds: number[] | null) {
  const cutoff = new Date(now.getTime() - STALE_SENDING_MS).toISOString()
  const and: Where[] = [{ status: { equals: 'sending' } }, { updatedAt: { less_than: cutoff } }]
  if (tenantIds) and.push({ tenant: { in: tenantIds } })
  await payload.update({ collection: 'sms-log', where: { and }, overrideAccess: true, data: { status: 'unknown', error: 'interrupted mid-send; not retried', nextAttemptAt: null } })
}

/** Atomic claim of a failed row for one retry (two overlapping runs never retry the same row twice). */
async function claimRetry(payload: Payload, id: number): Promise<boolean> {
  const db = payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows?: unknown[] } | unknown[]> } }
  const res = await db.drizzle.execute(sql`UPDATE "sms_log" SET "status" = 'sending', "attempts" = coalesce("attempts", 0) + 1, "updated_at" = now() WHERE "id" = ${id} AND "status" = 'failed' RETURNING "id"`)
  const rows = Array.isArray(res) ? res : (res.rows ?? [])
  return rows.length === 1
}

async function retryFailed(payload: Payload, ctxs: Map<number, TenantCtx>, now: Date, r: ReminderRunReport) {
  const tenantIds = [...ctxs.keys()]
  if (tenantIds.length === 0) return
  const due = await payload.find({
    collection: 'sms-log',
    where: { and: [{ tenant: { in: tenantIds } }, { status: { equals: 'failed' } }, { nextAttemptAt: { less_than_equal: now.toISOString() } }] },
    limit: 200,
    sort: 'nextAttemptAt',
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })
  for (const row of due.docs) {
    const ctx = ctxs.get(idOf(row.tenant) ?? -1)
    if (!ctx) continue
    try {
      if (row.expiresAt && new Date(row.expiresAt).getTime() <= now.getTime()) {
        await payload.update({ collection: 'sms-log', id: row.id, overrideAccess: true, data: { status: 'dead', error: `${row.error ?? ''} · expired`.slice(0, 300), nextAttemptAt: null } })
        r.dead++
        continue
      }
      if (isQuietTime(now, ctx.settings.quietHours)) {
        await payload.update({ collection: 'sms-log', id: row.id, overrideAccess: true, data: { nextAttemptAt: nextSendableAt(now, ctx.settings.quietHours).toISOString() } })
        r.deferred++
        continue
      }
      const to = (row as SmsLog & { to?: string | null }).to
      if (!to || !row.text) continue
      if (!(await claimRetry(payload, row.id))) continue
      r.retried++
      await attempt(payload, ctx.sms, row, to, row.text, (row.attempts ?? 0) + 1, now, r)
    } catch (err) {
      console.error(`[reminders] retry ${row.id}`, err)
      r.errors.push(`retry ${row.id}`)
    }
  }
}

// ---------------------------------------------------------------- Entry point

export async function runReminders(payload: Payload, opts: ReminderRunOptions = {}): Promise<ReminderRunReport> {
  const now = opts.now ?? new Date()
  const r: ReminderRunReport = { now: now.toISOString(), tenants: 0, sent: 0, skipped: 0, deferred: 0, failed: 0, dead: 0, retried: 0, duplicates: 0, errors: [] }
  const tenants = await payload.find({
    collection: 'tenants',
    where: opts.tenantSlug ? { slug: { equals: opts.tenantSlug } } : {},
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const siteUrl = env().NEXT_PUBLIC_SITE_URL
  const ctxs = new Map<number, TenantCtx>()
  for (const t of tenants.docs) {
    const settings = readReminderSettings(t.reminderSettings)
    if (!settings.enabled) continue
    if (sandboxState({ isSandbox: t.isSandbox, expiresAt: t.expiresAt }, now) === 'expired') continue
    try {
      const origin = academyOrigin((t.domains ?? []).map((d) => d.domain), siteUrl)
      ctxs.set(t.id, { tenant: t, settings, origin, sms: await providerFor(t) })
    } catch (err) {
      console.error(`[reminders] tenant ${t.id} provider`, err)
      r.errors.push(`tenant ${t.slug}: provider`)
    }
  }
  const scope = opts.tenantSlug ? tenants.docs.map((t) => t.id) : null
  if (!scope || scope.length) await sweepStale(payload, now, scope).catch((err) => {
    console.error('[reminders] sweep', err)
    r.errors.push('sweep')
  })
  await retryFailed(payload, ctxs, now, r)
  for (const ctx of ctxs.values()) {
    r.tenants++
    for (const [name, run] of [
      ['instalments', runInstalments],
      ['live', runLive],
      ['followups', runFollowups],
    ] as const) {
      try {
        await run(payload, ctx, now, r)
      } catch (err) {
        console.error(`[reminders] ${ctx.tenant.slug} ${name}`, err)
        r.errors.push(`${ctx.tenant.slug}: ${name}`)
      }
    }
  }
  return r
}
