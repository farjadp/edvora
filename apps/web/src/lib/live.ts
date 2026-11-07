import 'server-only'
import {
  applyAttendance,
  closeAttendance,
  emptyAttendance,
  externalRoomId,
  hostCanStart,
  isStaleEvent,
  joinState,
  parseExternalRoomId,
  type AttendanceRecord,
} from '@edvora/core/live'
import type { JoinTicket, LiveClassProvider, LiveEvent, MockLiveClassProvider, WebhookRequest } from '@edvora/integrations/live-class'
import { after } from 'next/server'
import type { Payload } from 'payload'
import type { Attendance, LiveSession, Tenant, User } from '../payload-types'
import { idOf } from './ids'
import { findEnrollment } from './learning'
import { getPayloadClient } from './payload'
import { copyRecording } from './liveRecordings'
import { getLiveClass } from './providers'

/** Live classes (phase-2 §D, ADR 012). Edvora checks who may join; the provider only sees opaque ids. */

/** Context so audit/guards treat our own follow-up writes as system writes. */
const SYSTEM = { context: { liveSystem: true, edvoraSystem: true } }

export type LiveFailure = 'not-found' | 'not-enrolled' | 'early' | 'not-started' | 'ended' | 'cancelled' | 'provider-down' | 'forbidden'

export type LiveResult = { ok: true; ticket: JoinTicket } | { ok: false; reason: LiveFailure }

export async function loadSession(payload: Payload, tenantId: number, id: number): Promise<LiveSession | null> {
  if (!Number.isInteger(id) || id <= 0) return null
  const s = await payload.findByID({ collection: 'live-sessions', id, depth: 0, overrideAccess: true, disableErrors: true })
  return s && idOf(s.tenant) === tenantId ? s : null
}

/** Sessions a student of this course (and cohort) can see: cohort-wide ones plus their own cohort's. */
export async function sessionsForStudent(payload: Payload, tenantId: number, courseId: number, cohortId: number | null): Promise<LiveSession[]> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const res = await payload.find({
    collection: 'live-sessions',
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { course: { equals: courseId } },
        { startsAt: { greater_than: since } },
        { or: [{ cohort: { exists: false } }, ...(cohortId ? [{ cohort: { equals: cohortId } }] : [])] },
      ],
    },
    sort: 'startsAt',
    limit: 20,
    depth: 0,
    overrideAccess: true,
  })
  return res.docs
}

/** Creates (or re-creates) the provider room right before a join; stores the provider ids on the session. */
async function ensureRoom(payload: Payload, provider: LiveClassProvider, tenant: Tenant, session: LiveSession, origin: string) {
  const room = await provider.createRoom({
    externalRoomId: externalRoomId(tenant.id, session.id),
    title: session.title,
    startsAt: session.startsAt,
    durationMin: session.durationMin,
    record: Boolean(session.record),
    waitingRoom: Boolean(session.waitingRoom),
    welcomeMessage: `به کلاس «${session.title}» خوش آمدید.`,
    webhookUrl: `${origin}/live/webhook/${provider.name}`,
  })
  if (session.providerRoomId !== room.providerRoomId || session.createTime !== (room.createTime ?? null) || session.provider !== provider.name) {
    await payload.update({
      collection: 'live-sessions',
      id: session.id,
      data: { provider: provider.name, providerRoomId: room.providerRoomId, createTime: room.createTime ?? null },
      overrideAccess: true,
      ...SYSTEM,
    })
  }
  return room
}

/** D2/D2f: an enrolled student of this academy, inside the join window, after the host has started. */
export async function joinAsStudent(opts: { tenant: Tenant; user: User; sessionId: number; origin: string }): Promise<LiveResult> {
  const payload = await getPayloadClient()
  const session = await loadSession(payload, opts.tenant.id, opts.sessionId)
  if (!session) return { ok: false, reason: 'not-found' }
  const enrollment = await findEnrollment({ payload }, opts.tenant.id, opts.user.id, idOf(session.course) ?? -1)
  const sessionCohort = idOf(session.cohort)
  if (!enrollment || enrollment.status !== 'active' || (sessionCohort && idOf(enrollment.cohort) !== sessionCohort)) {
    return { ok: false, reason: 'not-found' }
  }
  const w = joinState(session)
  if (w.state !== 'open') return { ok: false, reason: w.state }
  if (session.status !== 'live') return { ok: false, reason: 'not-started' }
  return issueTicket(payload, opts.tenant, session, opts.user, 'attendee', opts.origin)
}

/** D3: the host (live.host in scope, checked by the caller) starts the room and joins as moderator. */
export async function startAsHost(opts: { tenant: Tenant; user: User; session: LiveSession; origin: string }): Promise<LiveResult> {
  const payload = await getPayloadClient()
  if (opts.session.status === 'cancelled') return { ok: false, reason: 'cancelled' }
  if (!hostCanStart(opts.session)) return { ok: false, reason: opts.session.status === 'ended' ? 'ended' : 'early' }
  const res = await issueTicket(payload, opts.tenant, opts.session, opts.user, 'moderator', opts.origin)
  if (res.ok && opts.session.status !== 'live') {
    await payload.update({ collection: 'live-sessions', id: opts.session.id, data: { status: 'live' }, overrideAccess: true, ...SYSTEM })
  }
  return res
}

async function issueTicket(payload: Payload, tenant: Tenant, session: LiveSession, user: User, role: 'attendee' | 'moderator', origin: string): Promise<LiveResult> {
  const provider = getLiveClass(origin)
  try {
    const room = await ensureRoom(payload, provider, tenant, session, origin)
    const ticket = await provider.getJoinTicket({
      providerRoomId: room.providerRoomId,
      externalRoomId: room.externalRoomId,
      createTime: room.createTime,
      externalUserId: String(user.id),
      displayName: user.name?.trim() || (role === 'moderator' ? 'مدرس' : 'دانشجو'),
      role,
      locale: 'fa',
    })
    return { ok: true, ticket }
  } catch (err) {
    console.error('[live] provider error', { session: session.id, role }, err)
    return { ok: false, reason: 'provider-down' }
  }
}

/** Host ends the class for everyone; open attendance intervals are closed at that moment. */
export async function endSession(session: LiveSession, origin: string): Promise<void> {
  const payload = await getPayloadClient()
  const provider = getLiveClass(origin)
  if (session.providerRoomId) {
    try {
      await provider.endRoom(session.providerRoomId)
    } catch (err) {
      console.error('[live] endRoom failed', session.id, err)
    }
  }
  await payload.update({ collection: 'live-sessions', id: session.id, data: { status: 'ended' }, overrideAccess: true, ...SYSTEM })
  await closeOpenAttendance(payload, session, new Date().toISOString())
  // The mock has no recording server: pretend it produced one, reported the way BBB's callback would be.
  if (provider.name === 'mock' && session.record && session.providerRoomId && 'addRecording' in provider) {
    const rec = (provider as MockLiveClassProvider).addRecording(session.providerRoomId, session.durationMin * 60, externalRoomId(idOf(session.tenant) ?? 0, session.id))
    await ingestEvents('mock', [{ type: 'recording.ready', eventId: `rec:${rec.providerRecordingId}`, occurredAt: new Date().toISOString(), providerRoomId: session.providerRoomId, providerRecordingId: rec.providerRecordingId }])
  }
}

// --- Provider events → attendance, status, recordings -----------------------------------------------------------

async function closeOpenAttendance(payload: Payload, session: LiveSession, endedAt: string) {
  const open = await payload.find({
    collection: 'attendance',
    where: { and: [{ session: { equals: session.id } }, { openSince: { exists: true } }] },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  for (const row of open.docs) await saveAttendance(payload, session, row, closeAttendance(toRecord(row), endedAt))
}

const toRecord = (a: Attendance): AttendanceRecord => ({
  joinedAt: a.joinedAt ?? null,
  leftAt: a.leftAt ?? null,
  openSince: a.openSince ?? null,
  minutes: a.minutes ?? 0,
  source: a.source ?? 'webhook',
})

async function saveAttendance(payload: Payload, session: LiveSession, row: Attendance | null, rec: AttendanceRecord, userId?: number) {
  const data = { joinedAt: rec.joinedAt, leftAt: rec.leftAt, openSince: rec.openSince, minutes: rec.minutes, source: rec.source }
  if (row) {
    await payload.update({ collection: 'attendance', id: row.id, data, overrideAccess: true, ...SYSTEM })
  } else if (userId) {
    await payload.create({
      collection: 'attendance',
      data: { ...data, session: session.id, user: userId, course: idOf(session.course), cohort: idOf(session.cohort), tenant: idOf(session.tenant) },
      overrideAccess: true,
      ...SYSTEM,
    })
  }
}

async function attendanceRow(payload: Payload, sessionId: number, userId: number): Promise<Attendance | null> {
  const res = await payload.find({
    collection: 'attendance',
    where: { and: [{ session: { equals: sessionId } }, { user: { equals: userId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return res.docs[0] ?? null
}

/** Only students actually enrolled in the session's course get attendance rows (the host and strangers don't). */
async function isStudentOf(payload: Payload, session: LiveSession, userId: number): Promise<boolean> {
  const e = await findEnrollment({ payload }, idOf(session.tenant) ?? -1, userId, idOf(session.course) ?? -1)
  return Boolean(e)
}

/** Records the event id; false when we have already processed it (dedupe on tenant + provider + eventId). */
async function firstTime(payload: Payload, provider: string, session: LiveSession, ev: LiveEvent): Promise<boolean> {
  const tenant = idOf(session.tenant)
  const seen = await payload.find({
    collection: 'live-events',
    where: { and: [{ tenant: { equals: tenant } }, { provider: { equals: provider } }, { eventId: { equals: ev.eventId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (seen.docs.length) return false
  try {
    await payload.create({
      collection: 'live-events',
      data: { provider, eventId: ev.eventId, type: ev.type, session: session.id, occurredAt: ev.occurredAt, tenant },
      overrideAccess: true,
    })
    return true
  } catch {
    return false // lost a race with a concurrent retry: the unique index kept one
  }
}

/**
 * Applies already-verified provider events. Each event is matched to a session by providerRoomId and must agree
 * with its externalRoomId. Never throws: one bad event is logged and skipped.
 */
export async function ingestEvents(providerName: string, events: LiveEvent[], now: Date = new Date()): Promise<{ applied: number; skipped: number }> {
  const payload = await getPayloadClient()
  let applied = 0
  let skipped = 0
  for (const ev of events) {
    try {
      if (isStaleEvent(ev.occurredAt, now)) {
        skipped++
        continue
      }
      const found = await payload.find({
        collection: 'live-sessions',
        where: { and: [{ provider: { equals: providerName } }, { providerRoomId: { equals: ev.providerRoomId } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const session = found.docs[0]
      const ext = parseExternalRoomId(ev.externalRoomId)
      if (!session || (ext && (ext.liveSessionId !== session.id || ext.tenantId !== idOf(session.tenant)))) {
        skipped++
        continue
      }
      if (!(await firstTime(payload, providerName, session, ev))) {
        skipped++
        continue
      }
      await applyEvent(payload, providerName, session, ev)
      applied++
    } catch (err) {
      console.error('[live] event failed', ev.type, ev.eventId, err)
      skipped++
    }
  }
  return { applied, skipped }
}

async function applyEvent(payload: Payload, providerName: string, session: LiveSession, ev: LiveEvent) {
  switch (ev.type) {
    case 'participant.joined':
    case 'participant.left': {
      const userId = Number(ev.externalUserId)
      if (!Number.isInteger(userId) || !(await isStudentOf(payload, session, userId))) return
      const row = await attendanceRow(payload, session.id, userId)
      const next = applyAttendance(row ? toRecord(row) : emptyAttendance(), { type: ev.type, occurredAt: ev.occurredAt })
      await saveAttendance(payload, session, row, next, userId)
      return
    }
    case 'attendance.summary': {
      for (const a of ev.attendees) {
        const userId = Number(a.externalUserId)
        if (!Number.isInteger(userId) || !(await isStudentOf(payload, session, userId))) continue
        const row = await attendanceRow(payload, session.id, userId)
        const next = applyAttendance(row ? toRecord(row) : emptyAttendance(), { type: 'summary', joinedAt: a.joinedAt, leftAt: a.leftAt, durationSec: a.durationSec })
        await saveAttendance(payload, session, row, next, userId)
      }
      return
    }
    case 'room.started':
      if (session.status === 'scheduled') await payload.update({ collection: 'live-sessions', id: session.id, data: { status: 'live' }, overrideAccess: true, ...SYSTEM })
      return
    case 'room.ended':
      if (session.status !== 'cancelled') await payload.update({ collection: 'live-sessions', id: session.id, data: { status: 'ended' }, overrideAccess: true, ...SYSTEM })
      await closeOpenAttendance(payload, session, ev.occurredAt)
      return
    case 'recording.ready': {
      // D4: note it, then copy it into our bucket after the response is sent (E-017). Re-sent events dedupe above.
      const exists = (session.recordings ?? []).some((r) => r.providerRecordingId === ev.providerRecordingId)
      if (!exists) {
        await payload.update({
          collection: 'live-sessions',
          id: session.id,
          data: { recordings: [...(session.recordings ?? []), { providerRecordingId: ev.providerRecordingId, status: 'ready' }] },
          overrideAccess: true,
          ...SYSTEM,
        })
      }
      console.info(`[live] recording ready from ${providerName}`, session.id, ev.providerRecordingId)
      const sessionId = session.id
      after(() => copyRecording(sessionId, ev.providerRecordingId))
      return
    }
  }
}

/** Webhook entry point: verify with the instance's provider, then ingest. Status codes per ADR 012. */
export async function handleWebhook(providerName: string, req: WebhookRequest): Promise<{ status: number }> {
  const provider = getLiveClass(new URL(req.url).origin)
  if (provider.name !== providerName) return { status: 404 }
  const parsed = await provider.parseWebhook(req)
  if (!parsed.ok) {
    console.warn(`[live] webhook rejected (${parsed.reason})`, providerName)
    return { status: parsed.reason === 'bad-signature' ? 401 : parsed.reason === 'unsupported' ? 204 : 400 }
  }
  await ingestEvents(providerName, parsed.events)
  return { status: 200 }
}
