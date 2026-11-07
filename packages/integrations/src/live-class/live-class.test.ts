import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createLiveClassProvider, createMockLiveClassProvider, type LiveEvent } from '.'

const fixedNow = new Date('2026-11-06T10:00:00Z')
const make = (now = () => fixedNow) =>
  createMockLiveClassProvider({ mockRoomUrl: 'http://localhost:3000/live/mock', secret: 's3cret', now })
/** Mock state is process-wide, so every test uses its own room id. */
const roomId = () => `tenant-1:${randomUUID()}`
const room = (externalRoomId: string) => ({
  externalRoomId,
  title: 'کلاس برند',
  startsAt: fixedNow.toISOString(),
  durationMin: 90,
  record: true,
})

describe('mock live-class provider', () => {
  it('creates rooms idempotently and deterministically, across provider instances', async () => {
    const id = roomId()
    const a = await make().createRoom(room(id))
    const b = await make().createRoom({ ...room(id), title: 'other' }) // a new instance, as with a per-request factory
    expect(b).toEqual(a)
    const c = await make().createRoom(room(roomId()))
    expect(c.providerRoomId).not.toBe(a.providerRoomId)
  })

  it('issues per-user tickets that keep the role and expire', async () => {
    let now = fixedNow
    const p = make(() => now)
    const r = await p.createRoom(room(roomId()))
    const ticket = await p.getJoinTicket({ ...r, externalUserId: 'u7', displayName: 'سارا', role: 'attendee', ttlSec: 60 })
    expect(ticket).toMatchObject({ kind: 'redirect', expiresAt: '2026-11-06T10:01:00.000Z' })
    if (ticket.kind !== 'redirect') return
    const token = new URL(ticket.url).searchParams.get('t') ?? ''
    expect(p.readTicket(token)).toEqual({ providerRoomId: r.providerRoomId, externalUserId: 'u7', role: 'attendee', displayName: 'سارا' })

    // A student cannot upgrade their own ticket to moderator.
    const [body, sig] = token.split('.')
    const forged = Buffer.from(Buffer.from(body!, 'base64url').toString().replace('attendee', 'moderator')).toString('base64url')
    expect(p.readTicket(`${forged}.${sig}`)).toBeNull()

    now = new Date(fixedNow.getTime() + 61_000)
    expect(p.readTicket(token)).toBeNull()
  })

  it('ends rooms; joining needs a fresh createRoom with a new createTime', async () => {
    const p = make()
    const id = roomId()
    const r = await p.createRoom(room(id))
    await p.getJoinTicket({ ...r, externalUserId: 'teacher', displayName: 'استاد', role: 'moderator' })
    expect((await p.getRoomStatus(r.providerRoomId)).running).toBe(true)
    await p.endRoom(r.providerRoomId)
    await p.endRoom(r.providerRoomId) // safe twice
    expect((await p.getRoomStatus(r.providerRoomId)).running).toBe(false)
    await expect(p.getJoinTicket({ ...r, externalUserId: 'u', displayName: 'x', role: 'attendee' })).rejects.toThrow(/createRoom/)

    const again = await p.createRoom(room(id))
    expect(again.providerRoomId).toBe(r.providerRoomId)
    expect(again.createTime).not.toBe(r.createTime)
    await expect(p.getJoinTicket({ ...r, externalUserId: 'u', displayName: 'x', role: 'attendee' })).rejects.toThrow(/Stale/)
    await expect(p.getJoinTicket({ ...again, externalUserId: 'u', displayName: 'x', role: 'attendee' })).resolves.toMatchObject({ kind: 'redirect' })
  })

  it('lists, fetches and deletes recordings', async () => {
    const p = make()
    const id = roomId()
    const r = await p.createRoom(room(id))
    const rec = p.addRecording(r.providerRoomId, 5400)
    expect(rec).toMatchObject({ format: 'mp4', durationSec: 5400, externalRoomId: id })
    expect(await p.listRecordings(r.providerRoomId)).toHaveLength(1)
    expect(await p.getRecording(rec.providerRecordingId)).toEqual(rec)
    await p.deleteRecording(rec.providerRecordingId)
    expect(await p.getRecording(rec.providerRecordingId)).toBeNull()
  })

  it('verifies webhook signatures and validates event shapes', async () => {
    const p = make()
    const at = fixedNow.toISOString()
    const req = p.signWebhook([
      { type: 'participant.joined', eventId: 'e1', occurredAt: at, providerRoomId: 'r', externalUserId: 'u7', role: 'attendee' },
      { type: 'recording.ready', eventId: 'rec-1', occurredAt: at, providerRoomId: 'r', providerRecordingId: 'rec-1' },
      {
        type: 'attendance.summary',
        eventId: 'sum-1',
        occurredAt: at,
        providerRoomId: 'r',
        attendees: [{ externalUserId: 'u7', joinedAt: at, durationSec: 3000 }],
      },
    ])
    const parsed = await p.parseWebhook(req)
    expect(parsed.ok && parsed.events.map((e) => e.type)).toEqual(['participant.joined', 'recording.ready', 'attendance.summary'])

    expect(await p.parseWebhook({ ...req, rawBody: req.rawBody.replace('u7', 'u8') })).toEqual({ ok: false, reason: 'bad-signature' })
    expect(await p.parseWebhook({ ...req, headers: {} })).toEqual({ ok: false, reason: 'bad-signature' })

    // Correctly signed but wrong shape (role not in the enum) → unparseable, never trusted.
    const wrongShape = [{ type: 'participant.joined', eventId: 'e', occurredAt: at, providerRoomId: 'r', externalUserId: 'u', role: 'admin' }]
    expect(await p.parseWebhook(p.signWebhook(wrongShape as unknown as LiveEvent[]))).toEqual({ ok: false, reason: 'unparseable' })
  })
})

describe('createLiveClassProvider', () => {
  it('defaults to mock, needs a secret, rejects unknown providers', () => {
    expect(createLiveClassProvider({ provider: undefined, mockRoomUrl: 'http://x/live', mockSecret: 's' }).name).toBe('mock')
    expect(() => createLiveClassProvider({ provider: 'mock', mockRoomUrl: 'http://x/live' })).toThrow(/SECRET/)
    expect(() => createLiveClassProvider({ provider: 'zoom', mockRoomUrl: 'http://x/live', mockSecret: 's' })).toThrow(/Unknown/)
  })
})
