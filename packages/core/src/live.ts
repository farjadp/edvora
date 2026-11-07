/**
 * Live classes (phase-2 §D, ADR 012). Pure rules: join window, room ids, attendance from provider events.
 * No provider or framework code here.
 */

export type LiveSessionStatus = 'scheduled' | 'live' | 'ended' | 'cancelled'

export type JoinWindowInput = {
  startsAt: string | Date
  durationMin: number
  /** Minutes before the start when the join button opens (phase-2 D2, default 10). */
  joinWindowMin?: number | null
  status?: LiveSessionStatus | null
}

export type JoinState =
  | { state: 'early'; opensAt: Date; startsAt: Date }
  | { state: 'open'; opensAt: Date; closesAt: Date }
  | { state: 'ended'; closesAt: Date }
  | { state: 'cancelled' }

export const DEFAULT_JOIN_WINDOW_MIN = 10
/** Late joiners may still enter this long after the scheduled end (classes run over). */
export const LATE_GRACE_MIN = 30

const toDate = (v: string | Date) => (v instanceof Date ? v : new Date(v))
const addMin = (d: Date, min: number) => new Date(d.getTime() + min * 60_000)

/** Where a session stands for a student at `now`. A moderator-ended session is closed regardless of the clock. */
export function joinState(s: JoinWindowInput, now: Date = new Date()): JoinState {
  if (s.status === 'cancelled') return { state: 'cancelled' }
  const startsAt = toDate(s.startsAt)
  const opensAt = addMin(startsAt, -Math.max(0, s.joinWindowMin ?? DEFAULT_JOIN_WINDOW_MIN))
  const closesAt = addMin(startsAt, Math.max(1, s.durationMin) + LATE_GRACE_MIN)
  if (s.status === 'ended' || now >= closesAt) return { state: 'ended', closesAt }
  if (now < opensAt) return { state: 'early', opensAt, startsAt }
  return { state: 'open', opensAt, closesAt }
}

/** Hosts may open the room earlier than students (to upload slides), from this many minutes before the start. */
export const HOST_EARLY_MIN = 30

export function hostCanStart(s: JoinWindowInput, now: Date = new Date()): boolean {
  if (s.status === 'cancelled' || s.status === 'ended') return false
  const startsAt = toDate(s.startsAt)
  return now >= addMin(startsAt, -HOST_EARLY_MIN) && now < addMin(startsAt, Math.max(1, s.durationMin) + LATE_GRACE_MIN)
}

/** Our opaque room id for providers: ids, not slugs (ADR 012). */
export function externalRoomId(tenantId: number, liveSessionId: number): string {
  return `${tenantId}:${liveSessionId}`
}

export function parseExternalRoomId(v: string | null | undefined): { tenantId: number; liveSessionId: number } | null {
  const m = /^(\d+):(\d+)$/.exec(v ?? '')
  if (!m) return null
  return { tenantId: Number(m[1]), liveSessionId: Number(m[2]) }
}

/** Replay guard: events older than this are ignored (BBB checksums carry no timestamp). */
export const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000

export function isStaleEvent(occurredAt: string, now: Date = new Date()): boolean {
  const t = new Date(occurredAt).getTime()
  return !Number.isFinite(t) || now.getTime() - t > MAX_EVENT_AGE_MS
}

// --- Attendance ---------------------------------------------------------------------------------------------------

export type AttendanceSource = 'webhook' | 'summary' | 'manual' | 'import'

export type AttendanceRecord = {
  joinedAt: string | null
  leftAt: string | null
  /** Start of the current open interval (joined, not yet left). */
  openSince: string | null
  /** Whole minutes present, summed over closed intervals. */
  minutes: number
  source: AttendanceSource
}

export type AttendanceEvent =
  | { type: 'participant.joined' | 'participant.left'; occurredAt: string }
  | { type: 'summary'; joinedAt: string; leftAt?: string | null; durationSec: number }

export const emptyAttendance = (): AttendanceRecord => ({ joinedAt: null, leftAt: null, openSince: null, minutes: 0, source: 'webhook' })

const earlier = (a: string | null, b: string) => (a === null || new Date(b) < new Date(a) ? b : a)
const later = (a: string | null, b: string) => (a === null || new Date(b) > new Date(a) ? b : a)

/**
 * Applies one provider event. Rules:
 * - `summary` (end-of-class report) is authoritative and final: later join/leave events don't change it.
 * - A record a person corrected by hand (`manual`) is never overwritten by the provider.
 * - Duplicate joins don't restart the interval; a leave without a join only moves `leftAt`.
 */
export function applyAttendance(rec: AttendanceRecord, ev: AttendanceEvent): AttendanceRecord {
  if (rec.source === 'manual' || rec.source === 'import') return rec
  if (ev.type === 'summary') {
    return {
      joinedAt: ev.joinedAt,
      leftAt: ev.leftAt ?? rec.leftAt,
      openSince: null,
      minutes: Math.round(Math.max(0, ev.durationSec) / 60),
      source: 'summary',
    }
  }
  if (rec.source === 'summary') return rec
  if (ev.type === 'participant.joined') {
    return { ...rec, joinedAt: earlier(rec.joinedAt, ev.occurredAt), openSince: rec.openSince ?? ev.occurredAt }
  }
  const added = rec.openSince ? Math.max(0, new Date(ev.occurredAt).getTime() - new Date(rec.openSince).getTime()) / 60_000 : 0
  return { ...rec, leftAt: later(rec.leftAt, ev.occurredAt), openSince: null, minutes: rec.minutes + Math.round(added) }
}

/** Closes still-open intervals when the room ends (people who never sent a "left"). */
export function closeAttendance(rec: AttendanceRecord, endedAt: string): AttendanceRecord {
  if (!rec.openSince || rec.source !== 'webhook') return rec
  return applyAttendance(rec, { type: 'participant.left', occurredAt: endedAt })
}
