import { describe, expect, it } from 'vitest'
import {
  applyAttendance,
  closeAttendance,
  emptyAttendance,
  externalRoomId,
  hostCanStart,
  isStaleEvent,
  joinState,
  parseExternalRoomId,
} from './live'

const start = '2026-11-10T14:30:00Z' // 18:00 Tehran
const at = (iso: string) => new Date(iso)
const s = { startsAt: start, durationMin: 90 }

describe('joinState', () => {
  it('is early until 10 minutes before, open until end + 30 min grace, then ended', () => {
    expect(joinState(s, at('2026-11-10T14:19:59Z')).state).toBe('early')
    expect(joinState(s, at('2026-11-10T14:20:00Z')).state).toBe('open')
    expect(joinState(s, at('2026-11-10T16:29:59Z')).state).toBe('open')
    expect(joinState(s, at('2026-11-10T16:30:00Z')).state).toBe('ended')
  })
  it('respects a custom window, cancellation and a moderator-ended room', () => {
    expect(joinState({ ...s, joinWindowMin: 0 }, at('2026-11-10T14:29:00Z')).state).toBe('early')
    expect(joinState({ ...s, status: 'cancelled' }, at('2026-11-10T14:40:00Z')).state).toBe('cancelled')
    expect(joinState({ ...s, status: 'ended' }, at('2026-11-10T14:40:00Z')).state).toBe('ended')
  })
  it('reports when the window opens', () => {
    const r = joinState(s, at('2026-11-10T10:00:00Z'))
    expect(r.state === 'early' && r.opensAt.toISOString()).toBe('2026-11-10T14:20:00.000Z')
  })
})

describe('hostCanStart', () => {
  it('opens 30 minutes early for the host and never after end or cancel', () => {
    expect(hostCanStart(s, at('2026-11-10T13:59:59Z'))).toBe(false)
    expect(hostCanStart(s, at('2026-11-10T14:00:00Z'))).toBe(true)
    expect(hostCanStart({ ...s, status: 'ended' }, at('2026-11-10T14:40:00Z'))).toBe(false)
    expect(hostCanStart({ ...s, status: 'cancelled' }, at('2026-11-10T14:40:00Z'))).toBe(false)
  })
})

describe('room ids', () => {
  it('round-trips tenant and session ids and rejects anything else', () => {
    expect(externalRoomId(3, 42)).toBe('3:42')
    expect(parseExternalRoomId('3:42')).toEqual({ tenantId: 3, liveSessionId: 42 })
    for (const bad of ['iba:42', '3:', '3:42:1', '', null, undefined, ' 3:42']) expect(parseExternalRoomId(bad)).toBeNull()
  })
})

describe('isStaleEvent', () => {
  it('drops events older than 24 h and unparseable dates', () => {
    const now = at('2026-11-10T12:00:00Z')
    expect(isStaleEvent('2026-11-09T12:00:01Z', now)).toBe(false)
    expect(isStaleEvent('2026-11-09T11:59:59Z', now)).toBe(true)
    expect(isStaleEvent('nonsense', now)).toBe(true)
  })
})

describe('attendance', () => {
  const j = (t: string) => ({ type: 'participant.joined' as const, occurredAt: t })
  const l = (t: string) => ({ type: 'participant.left' as const, occurredAt: t })

  it('sums intervals across a reconnect and keeps first join / last leave', () => {
    let r = emptyAttendance()
    r = applyAttendance(r, j('2026-11-10T14:30:00Z'))
    r = applyAttendance(r, j('2026-11-10T14:31:00Z')) // duplicate join: no restart
    r = applyAttendance(r, l('2026-11-10T15:00:00Z'))
    r = applyAttendance(r, j('2026-11-10T15:05:00Z'))
    r = applyAttendance(r, l('2026-11-10T15:50:00Z'))
    expect(r).toMatchObject({ joinedAt: '2026-11-10T14:30:00Z', leftAt: '2026-11-10T15:50:00Z', openSince: null, minutes: 75 })
  })

  it('handles out-of-order leave without a join', () => {
    const r = applyAttendance(emptyAttendance(), l('2026-11-10T15:00:00Z'))
    expect(r).toMatchObject({ joinedAt: null, leftAt: '2026-11-10T15:00:00Z', minutes: 0 })
  })

  it('closes open intervals when the room ends', () => {
    const r = closeAttendance(applyAttendance(emptyAttendance(), j('2026-11-10T14:30:00Z')), '2026-11-10T16:00:00Z')
    expect(r).toMatchObject({ minutes: 90, openSince: null, leftAt: '2026-11-10T16:00:00Z' })
  })

  it('lets the end-of-class summary win, and keeps manual corrections', () => {
    let r = applyAttendance(emptyAttendance(), j('2026-11-10T14:30:00Z'))
    r = applyAttendance(r, { type: 'summary', joinedAt: '2026-11-10T14:29:00Z', leftAt: '2026-11-10T16:00:00Z', durationSec: 5000 })
    expect(r).toMatchObject({ source: 'summary', minutes: 83, openSince: null })
    expect(applyAttendance(r, l('2026-11-10T17:00:00Z'))).toEqual(r)

    const manual = { ...emptyAttendance(), minutes: 60, source: 'manual' as const }
    expect(applyAttendance(manual, { type: 'summary', joinedAt: start, durationSec: 10 })).toEqual(manual)
  })
})
