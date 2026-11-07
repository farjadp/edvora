/**
 * Provider-agnostic live-class contract (ADR 012).
 *
 * Edvora owns the schedule, the enrollment check and attendance; the provider owns media.
 * Everything a provider returns is normalised into these types so `apps/web` never imports
 * provider-specific shapes. Pick the provider per tenant with `LIVE_CLASS_PROVIDER`
 * (`mock` now; `bigbluebutton` in Phase 3; `skyroom` / `livekit` possible later).
 *
 * Rules:
 * - All timestamps are ISO-8601 UTC strings.
 * - `externalRoomId` is ours: `<tenantId>:<liveSessionId>` (ids, not slugs: slugs can change and leak the academy name).
 * - `externalUserId` is our user id; providers echo it back in webhooks so attendance maps to a user.
 * - Call `createRoom` right before every `getJoinTicket`. Some providers (BigBlueButton) create meetings lazily and
 *   end them when empty; `createRoom` is idempotent while the meeting runs and re-creates it otherwise.
 * - A join ticket is handed out only by the join route handler after it has checked tenant, enrollment and the join
 *   window, as a 303 redirect (ADR 005), never embedded in page HTML. Not every provider can expire tickets
 *   (`expiresAt: null`), so the route is the real gate.
 * - Nothing secret goes into `meta`, `title` or `webhookUrl`: some providers show them to participants.
 */

export type LiveRole = 'moderator' | 'attendee'

export type LiveCapability =
  | 'screenShare'
  | 'whiteboard'
  | 'slides'
  | 'chat'
  | 'polls'
  | 'breakoutRooms'
  | 'handRaise'
  | 'waitingRoom'
  | 'recording'
  | 'recordingMp4'
  /** Recordings can be listed/fetched through the API (Skyroom: no). */
  | 'recordingApi'
  /** participant.joined / participant.left webhooks. */
  | 'attendanceWebhooks'
  /** An authoritative end-of-class attendance report (`attendance.summary`). */
  | 'attendanceSummary'
  /** Join tickets expire on the provider side (BBB: no; Skyroom, LiveKit: yes). */
  | 'ticketExpiry'
  | 'endRoom'
  | 'roomStatus'
  | 'e2ee'
  | 'embedIframe'

export type RoomBranding = {
  logoUrl?: string
  bannerText?: string
  /** CSS colour, e.g. `#0f5132`. */
  bannerColor?: string
  /** A stylesheet we host (same origin as the tenant), never a third-party CDN. */
  customStyleUrl?: string
}

export type CreateRoomInput = {
  /** `<tenantId>:<liveSessionId>`. Re-creating with the same id while it runs returns the same room. */
  externalRoomId: string
  title: string
  /** Scheduled start (UTC). Providers that don't schedule ignore it. */
  startsAt: string
  durationMin: number
  /** Hard cap on participants; provider default when omitted. */
  maxParticipants?: number
  record: boolean
  /** Students wait for moderator approval before entering. */
  waitingRoom?: boolean
  /** Shown to everyone on entry (Persian text allowed). */
  welcomeMessage?: string
  /** Per-tenant look, taken from the tenant's settings. */
  branding?: RoomBranding
  /** Slides to pre-load (URLs the provider can fetch, e.g. presigned object-storage links). */
  presentations?: { url: string; filename: string }[]
  /** Our webhook URL for this room, e.g. `https://<tenant-host>/api/live/webhook/<provider>`. No secrets in it. */
  webhookUrl?: string
  /** Small, non-secret tags echoed back by some providers. */
  meta?: Record<string, string>
}

export type LiveRoom = {
  /** Provider's id (BBB meetingID, LiveKit room name, Skyroom room id). Store it on the liveSession. */
  providerRoomId: string
  externalRoomId: string
  /** Provider's instance marker (BBB `createTime`): changes each time the meeting is re-created. Pass it to join. */
  createTime?: string
  createdAt: string
}

export type JoinInput = {
  providerRoomId: string
  externalRoomId: string
  /** From the `LiveRoom` just returned by `createRoom`. */
  createTime?: string
  externalUserId: string
  /** Name shown in the room (Persian allowed). */
  displayName: string
  role: LiveRole
  /** Requested ticket lifetime in seconds (default 120), where the provider supports it. */
  ttlSec?: number
  /** UI language hint, e.g. `fa`. */
  locale?: string
}

export type JoinTicket =
  /** Redirect the browser to `url` (BBB, Skyroom). `expiresAt: null` = the provider does not expire it. */
  | { kind: 'redirect'; url: string; expiresAt: string | null }
  /** Our own client page connects to `serverUrl` with `token` (LiveKit). Needs a classroom page in apps/web. */
  | { kind: 'token'; serverUrl: string; token: string; expiresAt: string }

export type RoomStatus = {
  running: boolean
  /** Omitted when the provider can't report it. */
  participantCount?: number
  moderatorCount?: number
}

export type LiveRecording = {
  providerRecordingId: string
  providerRoomId: string
  externalRoomId: string
  startedAt: string
  endedAt: string
  durationSec: number
  /** `mp4` = one file we copy to object storage and play through the protected player (Phase 2 B). */
  format: 'mp4' | 'hls' | 'provider-playback'
  /** Where to fetch it. May be short-lived; copy, don't link. */
  url: string
  sizeBytes?: number
}

export type AttendanceEntry = {
  externalUserId: string
  role?: LiveRole
  joinedAt: string
  leftAt?: string
  durationSec: number
}

type EventBase = {
  /**
   * Unique per event, stable across retries. Providers without an id derive it deterministically
   * (e.g. BBB: hash of type + meetingId + userId + timestamp; recording: `record_id`).
   */
  eventId: string
  occurredAt: string
  providerRoomId: string
  externalRoomId?: string
}

export type LiveEvent =
  | (EventBase & { type: 'room.started' | 'room.ended' })
  | (EventBase & { type: 'participant.joined' | 'participant.left'; externalUserId: string; role?: LiveRole })
  /** Fetch details with `getRecording`; one room can produce several recordings. */
  | (EventBase & { type: 'recording.ready'; providerRecordingId: string })
  /** Authoritative end-of-class report; wins over joined/left events, which can arrive out of order. */
  | (EventBase & { type: 'attendance.summary'; attendees: AttendanceEntry[] })

export type WebhookRequest = {
  /**
   * Public URL the provider called. Rebuild it from the tenant's base URL, not `req.url`: proxies
   * change scheme/host and some providers (BBB) sign the URL.
   */
  url: string
  /** Lower-cased header names. */
  headers: Record<string, string | undefined>
  /** The raw body exactly as received; signatures are computed over it. */
  rawBody: string
}

export type ParsedWebhook =
  | { ok: true; events: LiveEvent[] }
  /**
   * The route answers 401 (bad-signature) / 400 (unparseable) / 204 (unsupported) and logs; never throws.
   * Callers also drop events whose `occurredAt` is older than 24 h (replay guard; BBB checksums carry no timestamp)
   * and dedupe on (tenant, provider, eventId).
   */
  | { ok: false; reason: 'bad-signature' | 'unparseable' | 'unsupported' }

/**
 * Every live-class provider implements this.
 * Webhook routes find the liveSession by (provider, providerRoomId) first, load that tenant's credentials,
 * verify with them, then check the event's externalRoomId matches the record.
 */
export interface LiveClassProvider {
  readonly name: string
  readonly capabilities: ReadonlySet<LiveCapability>
  /** Idempotent on `externalRoomId` while the room runs. */
  createRoom(input: CreateRoomInput): Promise<LiveRoom>
  /** Call only after Edvora checked tenant, enrollment and the join window. */
  getJoinTicket(input: JoinInput): Promise<JoinTicket>
  getRoomStatus(providerRoomId: string): Promise<RoomStatus>
  /** Ends the class for everyone. Safe on a room that already ended. */
  endRoom(providerRoomId: string): Promise<void>
  listRecordings(providerRoomId: string): Promise<LiveRecording[]>
  getRecording(providerRecordingId: string): Promise<LiveRecording | null>
  deleteRecording(providerRecordingId: string): Promise<void>
  /** Verifies the signature and normalises events. */
  parseWebhook(req: WebhookRequest): Promise<ParsedWebhook>
}
