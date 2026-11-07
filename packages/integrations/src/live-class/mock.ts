import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { IntegrationError } from '../errors'
import { LiveEventSchema, MockTicketSchema } from './schema'
import type { LiveCapability, LiveClassProvider, LiveEvent, LiveRecording, LiveRole, WebhookRequest } from './types'

const SIGNATURE_HEADER = 'x-edvora-live-signature'

type RoomState = { running: boolean; ended: boolean; createTime: string; createdAt: string; externalRoomId: string }

/**
 * Process-wide store so a provider created per request (like `getPayment`) sees rooms made by an earlier request.
 * Dev/CI only: a restart forgets ended state, which the mock tolerates (rooms are re-created on demand).
 */
const rooms = new Map<string, RoomState>()
const recordings = new Map<string, LiveRecording>()

export type MockLiveClassProvider = LiveClassProvider & {
  /** Builds a signed webhook request, as the real provider would send it. For tests and the dev "simulate" button. */
  signWebhook(events: LiveEvent[], url?: string): WebhookRequest
  /** Adds a fake recording so the recording.ready flow can be exercised offline. */
  /** `externalRoomId` lets another module instance (another route bundle) add one without the room in memory. */
  addRecording(providerRoomId: string, durationSec?: number, externalRoomId?: string): LiveRecording
  /** Reads a ticket the mock issued (used by the app's `/live/mock` page). Null if forged or expired. */
  readTicket(token: string): { providerRoomId: string; externalUserId: string; role: LiveRole; displayName: string } | null
}

const CAPABILITIES: LiveCapability[] = [
  'screenShare',
  'whiteboard',
  'slides',
  'chat',
  'polls',
  'breakoutRooms',
  'handRaise',
  'waitingRoom',
  'recording',
  'recordingMp4',
  'recordingApi',
  'attendanceWebhooks',
  'attendanceSummary',
  'ticketExpiry',
  'endRoom',
  'roomStatus',
  'embedIframe',
]

const WebhookBody = z.object({ events: z.array(LiveEventSchema) })

/**
 * Offline provider for local dev, CI and the demo tenant. No network.
 * `mockRoomUrl` is the app page that stands in for the classroom (it reads the ticket with `readTicket`).
 */
export function createMockLiveClassProvider(opts: {
  mockRoomUrl: string
  secret: string
  now?: () => Date
}): MockLiveClassProvider {
  if (!opts.secret) throw new IntegrationError('live:mock', 'LIVE_CLASS_MOCK_SECRET is missing')
  const now = opts.now ?? (() => new Date())

  const sign = (payload: string) => createHmac('sha256', opts.secret).update(payload).digest('base64url')
  const verify = (payload: string, signature: string | undefined) => {
    if (!signature) return false
    const a = Buffer.from(sign(payload))
    const b = Buffer.from(signature)
    return a.length === b.length && timingSafeEqual(a, b)
  }
  /** Deterministic: the same externalRoomId always maps to the same room id, with no shared state needed. */
  const roomIdFor = (externalRoomId: string) => `mock-${sign(`room:${externalRoomId}`).slice(0, 12)}`

  return {
    name: 'mock',
    capabilities: new Set(CAPABILITIES),

    async createRoom(input) {
      const providerRoomId = roomIdFor(input.externalRoomId)
      const existing = rooms.get(providerRoomId)
      if (existing && !existing.ended) {
        return { providerRoomId, externalRoomId: input.externalRoomId, createTime: existing.createTime, createdAt: existing.createdAt }
      }
      // Like BBB: re-creating an ended room starts a new instance with a new createTime.
      const at = now()
      const state: RoomState = {
        running: false,
        ended: false,
        createTime: `${at.getTime()}-${randomUUID().slice(0, 4)}`,
        createdAt: at.toISOString(),
        externalRoomId: input.externalRoomId,
      }
      rooms.set(providerRoomId, state)
      return { providerRoomId, externalRoomId: input.externalRoomId, createTime: state.createTime, createdAt: state.createdAt }
    },

    async getJoinTicket(input) {
      const state = rooms.get(input.providerRoomId)
      if (!state || state.ended) throw new IntegrationError('live:mock', 'Room is not running; call createRoom first')
      if (input.createTime && input.createTime !== state.createTime) {
        throw new IntegrationError('live:mock', 'Stale createTime; call createRoom again')
      }
      const expiresAt = new Date(now().getTime() + (input.ttlSec ?? 120) * 1000).toISOString()
      const body = Buffer.from(
        JSON.stringify({ r: input.providerRoomId, u: input.externalUserId, role: input.role, n: input.displayName, exp: expiresAt }),
      ).toString('base64url')
      if (input.role === 'moderator') state.running = true
      const url = new URL(opts.mockRoomUrl)
      url.searchParams.set('t', `${body}.${sign(body)}`)
      return { kind: 'redirect', url: url.toString(), expiresAt }
    },

    readTicket(token) {
      const [body, signature] = token.split('.')
      if (!body || !verify(body, signature)) return null
      let json: unknown
      try {
        json = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
      } catch {
        return null
      }
      const t = MockTicketSchema.safeParse(json)
      if (!t.success || new Date(t.data.exp).getTime() < now().getTime()) return null
      return { providerRoomId: t.data.r, externalUserId: t.data.u, role: t.data.role, displayName: t.data.n }
    },

    async getRoomStatus(providerRoomId) {
      const state = rooms.get(providerRoomId)
      return { running: Boolean(state?.running && !state.ended) }
    },

    async endRoom(providerRoomId) {
      const state = rooms.get(providerRoomId)
      if (!state) return
      state.running = false
      state.ended = true
    },

    async listRecordings(providerRoomId) {
      return [...recordings.values()].filter((rec) => rec.providerRoomId === providerRoomId)
    },

    async getRecording(providerRecordingId) {
      return recordings.get(providerRecordingId) ?? null
    },

    async deleteRecording(providerRecordingId) {
      recordings.delete(providerRecordingId)
    },

    addRecording(providerRoomId, durationSec = 3600, externalRoomId) {
      const state = rooms.get(providerRoomId)
      if (!state && !externalRoomId) throw new IntegrationError('live:mock', `Unknown room ${providerRoomId}`)
      const end = now()
      const rec: LiveRecording = {
        providerRecordingId: `rec-${randomUUID().slice(0, 8)}`,
        providerRoomId,
        externalRoomId: state?.externalRoomId ?? externalRoomId ?? '',
        startedAt: new Date(end.getTime() - durationSec * 1000).toISOString(),
        endedAt: end.toISOString(),
        durationSec,
        format: 'mp4',
        url: `${new URL(opts.mockRoomUrl).origin}/mock-recordings/${providerRoomId}.mp4`,
      }
      recordings.set(rec.providerRecordingId, rec)
      return rec
    },

    signWebhook(events, url = 'http://localhost/api/live/webhook/mock') {
      const rawBody = JSON.stringify({ events })
      return { url, headers: { [SIGNATURE_HEADER]: sign(rawBody), 'content-type': 'application/json' }, rawBody }
    },

    async parseWebhook(req) {
      if (!verify(req.rawBody, req.headers[SIGNATURE_HEADER])) return { ok: false, reason: 'bad-signature' }
      let json: unknown
      try {
        json = JSON.parse(req.rawBody)
      } catch {
        return { ok: false, reason: 'unparseable' }
      }
      const parsed = WebhookBody.safeParse(json)
      return parsed.success ? { ok: true, events: parsed.data.events } : { ok: false, reason: 'unparseable' }
    },
  }
}
