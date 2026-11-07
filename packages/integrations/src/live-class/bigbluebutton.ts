import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { IntegrationError } from '../errors'
import { LiveEventSchema } from './schema'
import type {
  AttendanceEntry,
  CreateRoomInput,
  LiveCapability,
  LiveClassProvider,
  LiveEvent,
  LiveRecording,
  LiveRole,
  ParsedWebhook,
  WebhookRequest,
} from './types'

/**
 * BigBlueButton 4.0 adapter (ADR 012). Talks only to the configured BBB server.
 *
 * Sources (checked 2026-11-06 against the v4.0.x-release branch of the docs and code):
 * - API, checksums, create/join/getMeetingInfo/end/getRecordings/deleteRecordings:
 *   https://docs.bigbluebutton.org/development/api
 * - bbb-webhooks (hooks/create, callback format and checksum): https://docs.bigbluebutton.org/development/webhooks
 *   and https://github.com/bigbluebutton/bbb-webhooks (src/out/webhooks/callback-emitter.js, src/process/event.js)
 * - Recording-ready callback (`meta_bbb-recording-ready-url`, form field `signed_parameters`, JWT HS256):
 *   https://docs.bigbluebutton.org/development/api#recording-ready-callback-url and
 *   record-and-playback/core/scripts/post_publish/post_publish_recording_ready_callback.rb
 * - Analytics callback (`meta_analytics-callback-url`, JSON body, `Authorization: Bearer <JWT HS512 {exp}>`):
 *   https://docs.bigbluebutton.org/development/api#learning-analytics-dashboard-callback-url and
 *   record-and-playback/core/scripts/post_events/post_events_analytics_callback.rb
 * - Video (MP4) recording format: https://docs.bigbluebutton.org/development/recording and
 *   record-and-playback/video/scripts/{process,publish}/video.rb
 */

export type BbbChecksumAlgorithm = 'sha1' | 'sha256' | 'sha512'

export type BigBlueButtonOptions = {
  /** `https://bbb.example.ir/bigbluebutton/` (what `bbb-conf --secret` prints) or the `/bigbluebutton/api` URL. */
  baseUrl: string
  /** BBB shared secret (`securitySalt`). Also signs every callback BBB sends us. */
  secret: string
  /** Must be listed in the server's `supportedChecksumAlgorithms`. Default sha256. */
  checksumAlgorithm?: BbbChecksumAlgorithm
  timeoutMs?: number
  now?: () => Date
  /** Non-fatal problems (hook registration). Default `console.warn`. Never receives the secret. */
  warn?: (message: string, details?: unknown) => void
}

const PROVIDER = 'bigbluebutton'

/**
 * BBB ends a meeting `duration` minutes after it was *created*, and Edvora creates it right before the first
 * join (often before the scheduled start). A grace period stops the server from cutting a class that started a
 * little late or overran.
 */
export const BBB_DURATION_GRACE_MIN = 30

/**
 * The `video` format publishes `video-<i>.<ext>` next to its playback page, one file per entry in the preset's
 * `formats`. The stock presets' first (and only enabled) format is `video/mp4` with extension `m4v`
 * (record-and-playback/video/scripts/video.yml). Change this if the server's preset differs.
 */
export const BBB_VIDEO_FILE = 'video-0.m4v'

/** bbb-webhooks events we subscribe to (hooks/create `eventID`, lower-case `data.id` values). */
const HOOK_EVENTS = ['meeting-created', 'meeting-ended', 'user-joined', 'user-left'] as const

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
  // Needs the non-default `video` format enabled on the server (ADR 012).
  'recordingMp4',
  'recordingApi',
  // Needs the separate bbb-webhooks package (>= 3.4.0, see verifyHookChecksum).
  'attendanceWebhooks',
  'attendanceSummary',
  'endRoom',
  'roomStatus',
  'embedIframe',
  // Deliberately absent: 'ticketExpiry' (join URLs do not expire while the meeting runs) and 'e2ee'.
]

/* ------------------------------------------------------------------------------------------------------------ */
/* Checksums and signing                                                                                         */
/* ------------------------------------------------------------------------------------------------------------ */

const hashHex = (alg: string, data: string) => createHash(alg).update(data, 'utf8').digest('hex')

/** API checksum: `hash(callName + queryString + secret)`, hex. https://docs.bigbluebutton.org/development/api#usage */
export function bbbChecksum(callName: string, queryString: string, secret: string, alg: BbbChecksumAlgorithm = 'sha256'): string {
  return hashHex(alg, `${callName}${queryString}${secret}`)
}

/** Constant-time string comparison. Lengths may leak; contents do not. */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  return x.length === y.length && timingSafeEqual(x, y)
}

/** bbb-webhooks picks the algorithm from `hookChecksumAlgorithm` (default sha1); we infer it from the length. */
const HOOK_ALG_BY_LENGTH: Record<number, string> = { 40: 'sha1', 64: 'sha256', 96: 'sha384', 128: 'sha512' }

const base64urlJson = (part: string): unknown => {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  } catch {
    return undefined
  }
}

/**
 * Minimal HS256/HS512 JWT check with node:crypto (no JWT library). Returns the payload, or null when the token is
 * malformed, uses another algorithm, has a wrong signature or is expired.
 */
export function verifyJwt(
  token: string,
  secret: string,
  alg: 'HS256' | 'HS512',
  nowMs: number,
  opts: { requireExp?: boolean } = {},
): Record<string, unknown> | null {
  const parts = token.trim().split('.')
  if (parts.length !== 3) return null
  const [h, p, s] = parts as [string, string, string]
  const header = base64urlJson(h)
  if (!header || typeof header !== 'object' || (header as { alg?: unknown }).alg !== alg) return null
  const expected = createHmac(alg === 'HS256' ? 'sha256' : 'sha512', secret).update(`${h}.${p}`).digest('base64url')
  if (!safeEqual(expected, s.replace(/=+$/, ''))) return null
  const payload = base64urlJson(p)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const exp = (payload as { exp?: unknown }).exp
  if (exp !== undefined && (typeof exp !== 'number' || exp * 1000 < nowMs)) return null
  if (opts.requireExp && exp === undefined) return null
  return payload as Record<string, unknown>
}

/* ------------------------------------------------------------------------------------------------------------ */
/* XML                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------ */

/**
 * BBB answers with small, fixed XML documents (`<response>…</response>`). This parser covers exactly what they
 * use: elements, attributes, text, CDATA, comments, the XML declaration and the five predefined entities plus
 * numeric references. DOCTYPE is rejected, so there is no entity expansion. Not a general XML parser.
 */
export type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string }

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, ref: string) => {
    if (ref.startsWith('#x')) return String.fromCodePoint(Number.parseInt(ref.slice(2), 16))
    if (ref.startsWith('#')) return String.fromCodePoint(Number.parseInt(ref.slice(1), 10))
    return ENTITIES[ref] ?? m
  })
}

export function parseXml(src: string): XmlNode {
  const root: XmlNode = { name: '#document', attrs: {}, children: [], text: '' }
  const stack: XmlNode[] = [root]
  const fail = (why: string): never => {
    throw new Error(`Invalid XML: ${why}`)
  }
  let i = 0
  while (i < src.length) {
    const top = stack[stack.length - 1] ?? fail('stack underflow')
    const lt = src.indexOf('<', i)
    if (lt === -1) {
      top.text += decodeEntities(src.slice(i))
      break
    }
    if (lt > i) top.text += decodeEntities(src.slice(i, lt))
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4)
      if (end === -1) fail('unclosed comment')
      i = end + 3
      continue
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9)
      if (end === -1) fail('unclosed CDATA')
      top.text += src.slice(lt + 9, end)
      i = end + 3
      continue
    }
    if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt + 2)
      if (end === -1) fail('unclosed declaration')
      i = end + 2
      continue
    }
    if (src.startsWith('<!', lt)) fail('DOCTYPE is not allowed')

    // Find the closing '>' outside attribute quotes.
    let j = lt + 1
    let quote: string | null = null
    for (; j < src.length; j++) {
      const c = src[j]
      if (quote) {
        if (c === quote) quote = null
      } else if (c === '"' || c === "'") quote = c
      else if (c === '>') break
    }
    if (j >= src.length) fail('unclosed tag')
    const raw = src.slice(lt + 1, j)
    i = j + 1

    if (raw.startsWith('/')) {
      const name = raw.slice(1).trim()
      if (top.name !== name) fail(`expected </${top.name}>, got </${name}>`)
      stack.pop()
      continue
    }
    const selfClosing = raw.endsWith('/')
    const body = selfClosing ? raw.slice(0, -1) : raw
    const nameMatch = /^([A-Za-z_][\w.:-]*)/.exec(body)
    if (!nameMatch?.[1]) fail('bad tag name')
    const name = nameMatch?.[1] ?? ''
    const attrs: Record<string, string> = {}
    for (const m of body.slice(name.length).matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      if (m[1]) attrs[m[1]] = decodeEntities(m[2] ?? m[3] ?? '')
    }
    const node: XmlNode = { name, attrs, children: [], text: '' }
    top.children.push(node)
    if (!selfClosing) stack.push(node)
  }
  if (stack.length !== 1) fail(`unclosed <${stack[stack.length - 1]?.name}>`)
  return root
}

type Plain = string | { [key: string]: Plain | Plain[] }

/** Tags that are always lists in BBB responses, even with one entry. */
const LIST_TAGS = new Set(['attendee', 'recording', 'format', 'image', 'hook'])
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** Element → plain value for Zod: leaf → trimmed text (empty element → ''), else object; LIST_TAGS → arrays. */
export function xmlToPlain(node: XmlNode): Plain {
  if (node.children.length === 0) return node.text.trim()
  const out: { [key: string]: Plain | Plain[] } = {}
  for (const child of node.children) {
    if (UNSAFE_KEYS.has(child.name)) continue
    const value = xmlToPlain(child)
    if (LIST_TAGS.has(child.name)) {
      const list = out[child.name]
      if (Array.isArray(list)) list.push(value)
      else out[child.name] = [value]
    } else if (!(child.name in out)) out[child.name] = value
  }
  return out
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Response schemas                                                                                              */
/* ------------------------------------------------------------------------------------------------------------ */

/** An empty container element (`<attendees />`) parses as ''. */
const container = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' ? {} : v), schema)
const digits = z.string().regex(/^\d+$/)

const BaseResponse = z.object({
  returncode: z.enum(['SUCCESS', 'FAILED']),
  messageKey: z.string().optional(),
  message: z.string().optional(),
})

const CreateResponse = BaseResponse.extend({ meetingID: z.string().optional(), createTime: digits.optional() })

const MeetingInfoResponse = BaseResponse.extend({
  running: z.enum(['true', 'false']).optional(),
  participantCount: digits.optional(),
  moderatorCount: digits.optional(),
})

const FormatSchema = z.object({
  type: z.string(),
  url: z.string(),
  length: z.string().optional(),
  /** Bytes; added by add_playback_size_to_metadata on newer servers. */
  size: digits.optional(),
})

const RecordingSchema = z.object({
  recordID: z.string().min(1),
  meetingID: z.string().min(1),
  state: z.string().optional(),
  startTime: digits,
  endTime: digits,
  metadata: container(z.record(z.string(), z.unknown())).optional(),
  playback: container(z.object({ format: z.array(FormatSchema).optional() })).optional(),
})

const RecordingsResponse = BaseResponse.extend({
  recordings: container(z.object({ recording: z.array(RecordingSchema).optional() })).optional(),
})

/* bbb-webhooks event (getRaw=false). Shapes from bbb-webhooks src/process/event.js (meetingTemplate/userTemplate). */
const HookEvent = z.object({
  data: z.object({
    type: z.string().optional(),
    id: z.string(),
    attributes: z
      .object({
        meeting: z
          .object({ 'internal-meeting-id': z.string().optional(), 'external-meeting-id': z.string().optional() })
          .optional(),
        user: z
          .object({
            'internal-user-id': z.string().optional(),
            'external-user-id': z.string().optional(),
            role: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
    event: z.object({ ts: z.number() }),
  }),
})

const RecordingReadyPayload = z.object({ meeting_id: z.string().min(1), record_id: z.string().min(1) })

/* Learning Dashboard JSON (data.json from the bbbevents gem). */
const AnalyticsPayload = z.object({
  version: z.string().optional(),
  meeting_id: z.string().min(1),
  internal_meeting_id: z.string().optional(),
  data: z.object({
    start: z.string().optional(),
    finish: z.string().optional(),
    attendees: z.array(
      z.object({
        ext_user_id: z.string().optional(),
        moderator: z.boolean().optional(),
        joins: z.array(z.string()).optional(),
        leaves: z.array(z.string()).optional(),
        duration: z.number().optional(),
      }),
    ),
  }),
})

/* ------------------------------------------------------------------------------------------------------------ */
/* Helpers                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------ */

/** Accepts `…/bigbluebutton`, `…/bigbluebutton/` or `…/bigbluebutton/api`; returns `…/bigbluebutton/api`. */
export function normalizeApiBase(baseUrl: string): string {
  let u: URL
  try {
    u = new URL(baseUrl)
  } catch {
    throw new IntegrationError(PROVIDER, 'BBB_URL is not a valid URL')
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new IntegrationError(PROVIDER, 'BBB_URL must be http(s)')
  const path = u.pathname.replace(/\/+$/, '')
  u.pathname = path.endsWith('/api') ? path : `${path}/api`
  u.search = ''
  u.hash = ''
  return u.toString().replace(/\/+$/, '')
}

const toIso = (value: string | number | undefined): string | null => {
  if (value === undefined || value === '') return null
  const d = new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const bbbRole = (role: string | undefined): LiveRole | undefined =>
  role?.toUpperCase() === 'MODERATOR' ? 'moderator' : role?.toUpperCase() === 'VIEWER' ? 'attendee' : undefined

/** Truncates by code point so a Persian name is never cut inside a surrogate pair. */
const truncate = (s: string, max: number) => Array.from(s).slice(0, max).join('')

const xmlAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

const META_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/

/** Only hex `#RRGGBB` is documented for bannerColor. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

type ValidatedEvents = { ok: true; events: LiveEvent[] } | { ok: false; reason: 'unparseable' | 'unsupported' }

function validated(events: LiveEvent[]): ValidatedEvents {
  if (events.length === 0) return { ok: false, reason: 'unsupported' }
  const out: LiveEvent[] = []
  for (const e of events) {
    const parsed = LiveEventSchema.safeParse(e)
    if (!parsed.success) return { ok: false, reason: 'unparseable' }
    out.push(parsed.data)
  }
  return { ok: true, events: out }
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Provider                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------ */

export type WebhookKind = 'hooks' | 'recording' | 'analytics' | 'ended'

export function createBigBlueButtonProvider(opts: BigBlueButtonOptions): LiveClassProvider {
  if (!opts.baseUrl) throw new IntegrationError(PROVIDER, 'BBB_URL is missing')
  if (!opts.secret) throw new IntegrationError(PROVIDER, 'BBB_SECRET is missing')
  const api = normalizeApiBase(opts.baseUrl)
  const secret = opts.secret
  const alg: BbbChecksumAlgorithm = opts.checksumAlgorithm ?? 'sha256'
  const now = opts.now ?? (() => new Date())
  const timeoutMs = opts.timeoutMs ?? 15_000
  const warn = opts.warn ?? ((message: string, details?: unknown) => console.warn(`[${PROVIDER}] ${message}`, details ?? ''))

  /** Signed API URL. The checksum must be the last parameter (bbb-web strips `&checksum=…` to verify). */
  const signedUrl = (call: string, params: [string, string][]) => {
    const query = new URLSearchParams(params).toString()
    const checksum = bbbChecksum(call, query, secret, alg)
    return `${api}/${call}?${query}${query ? '&' : ''}checksum=${checksum}`
  }

  const call = async (
    name: string,
    params: [string, string][],
    body?: { xml: string },
  ): Promise<Plain> => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    let text: string
    let status: number
    try {
      const res = await fetch(signedUrl(name, params), {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'content-type': 'application/xml', accept: 'application/xml' } : { accept: 'application/xml' },
        body: body?.xml,
        signal: ctrl.signal,
        // BBB never redirects API calls; refusing keeps us on the configured host.
        redirect: 'error',
      })
      status = res.status
      text = await res.text()
    } catch (err) {
      // No URL in the error: it carries the meeting id and a checksum.
      throw new IntegrationError(PROVIDER, `${name}: ${err instanceof Error ? err.message : 'network error'}`)
    } finally {
      clearTimeout(timer)
    }
    let root: XmlNode
    try {
      root = parseXml(text)
    } catch {
      throw new IntegrationError(PROVIDER, `${name}: non-XML response (HTTP ${status})`, text.slice(0, 500))
    }
    const response = root.children.find((n) => n.name === 'response')
    if (!response) throw new IntegrationError(PROVIDER, `${name}: no <response> element (HTTP ${status})`, text.slice(0, 500))
    return xmlToPlain(response)
  }

  const parse = <T extends z.ZodType>(name: string, schema: T, raw: Plain): z.output<T> => {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) throw new IntegrationError(PROVIDER, `${name}: unexpected response`, raw)
    return parsed.data
  }

  const failed = (name: string, r: z.output<typeof BaseResponse>): never => {
    throw new IntegrationError(PROVIDER, `${name} failed: ${r.messageKey ?? 'unknown'}`, { messageKey: r.messageKey, message: r.message })
  }

  const withParams = (url: string, params: Record<string, string>) => {
    const u = new URL(url)
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
    return u.toString()
  }

  /** `meetingEndedURL` is not signed by BBB; we add our own HMAC over (room, nonce). */
  const endedSig = (room: string, nonce: string) => createHmac('sha256', secret).update(`ended|${room}|${nonce}`).digest('base64url')

  const checkMeetingId = (id: string) => {
    // bbb-web MeetingIDConstraint: 2–256 chars, no comma (a comma separates ids in getRecordings).
    if (id.length < 2 || id.length > 256 || id.includes(',')) throw new IntegrationError(PROVIDER, `Invalid meeting id: ${id}`)
  }

  const registerHooks = async (meetingID: string, webhookUrl: string) => {
    // bbb-webhooks dedupes hooks by callbackURL alone, so the URL must be unique per meeting (`room=`).
    const callbackURL = withParams(webhookUrl, { kind: 'hooks', room: meetingID })
    try {
      const r = parse('hooks/create', BaseResponse, await call('hooks/create', [
        ['callbackURL', callbackURL],
        ['meetingID', meetingID],
        ['eventID', HOOK_EVENTS.join(',')],
      ]))
      if (r.returncode !== 'SUCCESS') warn('hooks/create failed', { messageKey: r.messageKey })
    } catch (err) {
      // bbb-webhooks may be missing or down: attendance then comes from the analytics summary only.
      warn('hooks/create failed', err instanceof Error ? err.message : err)
    }
  }

  const presentationsXml = (docs: NonNullable<CreateRoomInput['presentations']>) =>
    `<?xml version="1.0" encoding="UTF-8"?><modules><module name="presentation">${docs
      .map((d) => `<document url="${xmlAttr(d.url)}" filename="${xmlAttr(d.filename)}"/>`)
      .join('')}</module></modules>`

  const mapRecording = (r: z.output<typeof RecordingSchema>): LiveRecording | null => {
    const formats = r.playback?.format ?? []
    const video = formats.find((f) => f.type === 'video')
    const chosen = video ?? formats.find((f) => f.type === 'presentation') ?? formats[0]
    if (!chosen) return null
    const startedAt = toIso(r.startTime)
    const endedAt = toIso(r.endTime)
    if (!startedAt || !endedAt) return null
    const room = r.metadata?.['edvora-room']
    return {
      providerRecordingId: r.recordID,
      providerRoomId: r.meetingID,
      externalRoomId: typeof room === 'string' && room ? room : r.meetingID,
      startedAt,
      endedAt,
      // startTime/endTime are epoch ms; `<length>` is rounded minutes, too coarse.
      durationSec: Math.max(0, Math.round((Number(r.endTime) - Number(r.startTime)) / 1000)),
      format: video ? 'mp4' : 'provider-playback',
      url: video ? new URL(BBB_VIDEO_FILE, video.url.endsWith('/') ? video.url : `${video.url}/`).toString() : chosen.url,
      ...(chosen.size ? { sizeBytes: Number(chosen.size) } : {}),
    }
  }

  const getRecordings = async (params: [string, string][]) => {
    const r = parse('getRecordings', RecordingsResponse, await call('getRecordings', params))
    if (r.returncode !== 'SUCCESS') {
      // Older servers answered FAILED/noRecordings for an empty list.
      if (r.messageKey === 'noRecordings' || r.messageKey === 'notFound') return []
      failed('getRecordings', r)
    }
    return r.recordings?.recording ?? []
  }

  /* --------------------------------------------- webhooks ---------------------------------------------------- */

  type Verdict = { ok: true; events: LiveEvent[] } | { ok: false; reason: 'bad-signature' | 'unparseable' | 'unsupported' }

  /**
   * bbb-webhooks >= 3.4.0 signs `hash(callbackURL + body + secret)` and appends `?checksum=` / `&checksum=` to the
   * registered URL (callback-emitter.js). 3.0–3.3 hashed `JSON.stringify(URLSearchParams)` = "{}" instead of the
   * body (fixed in 3.4.0, "guarantee checksum uniqueness"); we do not accept that form because it does not cover
   * the body. With `bbb.auth2_0: true` the secret is sent as `Authorization: Bearer <secret>` instead.
   */
  const verifyHook = (req: WebhookRequest): boolean => {
    const auth = req.headers.authorization
    if (auth?.startsWith('Bearer ')) return safeEqual(auth.slice(7).trim(), secret)
    const m = /^(.*)[?&]checksum=([0-9a-fA-F]+)$/.exec(req.url)
    if (!m?.[1] || !m[2]) return false
    const hookAlg = HOOK_ALG_BY_LENGTH[m[2].length]
    if (!hookAlg) return false
    return safeEqual(hashHex(hookAlg, `${m[1]}${req.rawBody}${secret}`), m[2].toLowerCase())
  }

  const parseHooks = (req: WebhookRequest): Verdict => {
    if (!verifyHook(req)) return { ok: false, reason: 'bad-signature' }
    const eventField = new URLSearchParams(req.rawBody).get('event')
    if (!eventField) return { ok: false, reason: 'unparseable' }
    let json: unknown
    try {
      json = JSON.parse(eventField)
    } catch {
      return { ok: false, reason: 'unparseable' }
    }
    // v3 sends `event=[{…}]` (an array, several with multiEvent > 1); the 2.x docs show a single object.
    const items = Array.isArray(json) ? json : [json]
    const events: LiveEvent[] = []
    for (const item of items) {
      const parsed = HookEvent.safeParse(item)
      if (!parsed.success) return { ok: false, reason: 'unparseable' }
      const { id, attributes, event } = parsed.data.data
      const meeting = attributes?.meeting
      const providerRoomId = meeting?.['external-meeting-id']
      const occurredAt = toIso(event.ts)
      if (!providerRoomId || !occurredAt) continue
      const meetingKey = meeting?.['internal-meeting-id'] || providerRoomId
      const user = attributes?.user
      const userKey = user?.['internal-user-id'] || user?.['external-user-id'] || ''
      const eventId = hashHex('sha256', `${id}|${meetingKey}|${userKey}|${event.ts}`)
      const base = { eventId, occurredAt, providerRoomId, externalRoomId: providerRoomId }
      if (id === 'meeting-created') events.push({ ...base, type: 'room.started' })
      else if (id === 'meeting-ended') events.push({ ...base, type: 'room.ended' })
      else if (id === 'user-joined' || id === 'user-left') {
        const externalUserId = user?.['external-user-id']
        // Users without our userID (dial-in, bots) cannot be mapped to an enrollment.
        if (!externalUserId) continue
        const role = bbbRole(user?.role)
        events.push({
          ...base,
          type: id === 'user-joined' ? 'participant.joined' : 'participant.left',
          externalUserId,
          ...(role ? { role } : {}),
        })
      }
    }
    return validated(events)
  }

  const parseRecordingReady = (req: WebhookRequest): Verdict => {
    const token = new URLSearchParams(req.rawBody).get('signed_parameters')
    if (!token) return { ok: false, reason: 'bad-signature' }
    const payload = verifyJwt(token, secret, 'HS256', now().getTime())
    if (!payload) return { ok: false, reason: 'bad-signature' }
    const parsed = RecordingReadyPayload.safeParse(payload)
    if (!parsed.success) return { ok: false, reason: 'unparseable' }
    // The JWT carries no timestamp, so occurredAt is when we received it. Fires once per published format.
    return validated([
      {
        type: 'recording.ready',
        eventId: `rec:${parsed.data.record_id}`,
        occurredAt: now().toISOString(),
        providerRoomId: parsed.data.meeting_id,
        externalRoomId: parsed.data.meeting_id,
        providerRecordingId: parsed.data.record_id,
      },
    ])
  }

  /**
   * The analytics callback is authenticated by `Authorization: Bearer <JWT>` (HS512, payload `{exp}` = now + 24 h).
   * The JWT does not cover the body, so the route must still check meeting_id against the stored liveSession.
   */
  const parseAnalytics = (req: WebhookRequest): Verdict => {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) return { ok: false, reason: 'bad-signature' }
    if (!verifyJwt(auth.slice(7), secret, 'HS512', now().getTime(), { requireExp: true })) {
      return { ok: false, reason: 'bad-signature' }
    }
    let json: unknown
    try {
      json = JSON.parse(req.rawBody)
    } catch {
      return { ok: false, reason: 'unparseable' }
    }
    const parsed = AnalyticsPayload.safeParse(json)
    if (!parsed.success) return { ok: false, reason: 'unparseable' }
    const { meeting_id, internal_meeting_id, data } = parsed.data

    // Merge by external id (a user who rejoined may appear more than once).
    const byUser = new Map<string, { role?: LiveRole; joins: string[]; leaves: string[]; duration: number }>()
    for (const a of data.attendees) {
      if (!a.ext_user_id) continue
      const joins = (a.joins ?? []).map((j) => toIso(j)).filter((j): j is string => j !== null)
      const leaves = (a.leaves ?? []).map((l) => toIso(l)).filter((l): l is string => l !== null)
      const prev = byUser.get(a.ext_user_id)
      const role: LiveRole | undefined =
        a.moderator === true || prev?.role === 'moderator' ? 'moderator' : a.moderator === false ? 'attendee' : prev?.role
      byUser.set(a.ext_user_id, {
        ...(role ? { role } : {}),
        joins: [...(prev?.joins ?? []), ...joins],
        leaves: [...(prev?.leaves ?? []), ...leaves],
        duration: (prev?.duration ?? 0) + Math.max(0, Math.round(a.duration ?? 0)),
      })
    }
    const start = toIso(data.start)
    const attendees: AttendanceEntry[] = []
    for (const [externalUserId, u] of byUser) {
      const joinedAt = [...u.joins].sort()[0] ?? start
      if (!joinedAt) continue
      const leftAt = [...u.leaves].sort().at(-1)
      attendees.push({
        externalUserId,
        ...(u.role ? { role: u.role } : {}),
        joinedAt,
        ...(leftAt ? { leftAt } : {}),
        durationSec: u.duration,
      })
    }
    return validated([
      {
        type: 'attendance.summary',
        eventId: `summary:${internal_meeting_id ?? meeting_id}`,
        occurredAt: toIso(data.finish) ?? now().toISOString(),
        providerRoomId: meeting_id,
        externalRoomId: meeting_id,
        attendees,
      },
    ])
  }

  /** GET from bbb-web with `?kind=ended&room=…&n=…&sig=…` plus BBB's own `meetingID` and `recordingmarks`. */
  const parseEnded = (url: URL): Verdict => {
    const room = url.searchParams.get('room')
    const nonce = url.searchParams.get('n')
    const sig = url.searchParams.get('sig')
    if (!room || !nonce || !sig || !safeEqual(endedSig(room, nonce), sig)) return { ok: false, reason: 'bad-signature' }
    return validated([
      { type: 'room.ended', eventId: `ended:${room}:${nonce}`, occurredAt: now().toISOString(), providerRoomId: room, externalRoomId: room },
    ])
  }

  const detectKind = (req: WebhookRequest, url: URL): WebhookKind | null => {
    const kind = url.searchParams.get('kind')
    if (kind === 'hooks' || kind === 'recording' || kind === 'analytics' || kind === 'ended') return kind
    // Fallback for URLs registered without `kind` (e.g. a permanent hook configured on the server).
    const ct = req.headers['content-type'] ?? ''
    if (/^signed_parameters=/.test(req.rawBody)) return 'recording'
    if (ct.includes('application/json')) return 'analytics'
    if (/(^|&)event=/.test(req.rawBody)) return 'hooks'
    return null
  }

  return {
    name: PROVIDER,
    capabilities: new Set(CAPABILITIES),

    async createRoom(input) {
      const meetingID = input.externalRoomId
      checkMeetingId(meetingID)
      const params: [string, string][] = [
        ['name', truncate(input.title.trim() || meetingID, 255)],
        ['meetingID', meetingID],
        ['record', input.record ? 'true' : 'false'],
        ['autoStartRecording', 'false'],
        ['allowStartStopRecording', 'true'],
        // ASK_MODERATOR also holds back VIEWER joins without `guest=true` while bbb-web's `authenticatedGuest=true`
        // (the default); see Meeting.calcGuestStatus in bbb-common-web.
        ['guestPolicy', input.waitingRoom ? 'ASK_MODERATOR' : 'ALWAYS_ACCEPT'],
        ['duration', String(Math.max(1, Math.ceil(input.durationMin)) + BBB_DURATION_GRACE_MIN)],
      ]
      if (input.maxParticipants && input.maxParticipants > 0) params.push(['maxParticipants', String(Math.floor(input.maxParticipants))])
      if (input.welcomeMessage) params.push(['welcome', input.welcomeMessage])
      const b = input.branding
      if (b?.logoUrl) params.push(['logo', b.logoUrl])
      if (b?.bannerText) params.push(['bannerText', b.bannerText])
      if (b?.bannerColor && HEX_COLOR.test(b.bannerColor)) params.push(['bannerColor', b.bannerColor])
      // TODO(E-033): branding.customStyleUrl is a join-time `userdata-bbb_custom_style_url`, but JoinInput has no
      // branding; wire it once the join route passes the tenant style URL.

      // meta_* values are visible to participants: ids only, never secrets (types.ts).
      for (const [key, value] of Object.entries(input.meta ?? {})) {
        const k = key.toLowerCase()
        if (META_KEY.test(k) && k !== 'edvora-room' && !k.startsWith('bbb-') && k !== 'analytics-callback-url') {
          params.push([`meta_${k}`, value])
        }
      }
      params.push(['meta_edvora-room', input.externalRoomId])
      if (input.webhookUrl) {
        const nonce = randomBytes(8).toString('hex')
        params.push(['meta_bbb-recording-ready-url', withParams(input.webhookUrl, { kind: 'recording' })])
        params.push(['meta_analytics-callback-url', withParams(input.webhookUrl, { kind: 'analytics' })])
        // Not a meta_ value, so the HMAC is not shown to participants.
        params.push(['meetingEndedURL', withParams(input.webhookUrl, { kind: 'ended', room: meetingID, n: nonce, sig: endedSig(meetingID, nonce) })])
      }

      const docs = input.presentations?.filter((d) => d.url) ?? []
      const raw = await call('create', params, docs.length ? { xml: presentationsXml(docs) } : undefined)
      const r = parse('create', CreateResponse, raw)
      // duplicateWarning: the meeting is still running; BBB keeps its original settings and createTime.
      if (r.returncode !== 'SUCCESS' || !r.createTime) failed('create', r)
      const createTime = r.createTime ?? ''
      if (input.webhookUrl) await registerHooks(meetingID, input.webhookUrl)
      return {
        providerRoomId: meetingID,
        externalRoomId: input.externalRoomId,
        createTime,
        createdAt: toIso(createTime) ?? now().toISOString(),
      }
    },

    async getJoinTicket(input) {
      checkMeetingId(input.providerRoomId)
      const params: [string, string][] = [
        ['fullName', truncate(input.displayName.trim() || input.externalUserId, 255)],
        ['meetingID', input.providerRoomId],
        ['role', input.role === 'moderator' ? 'MODERATOR' : 'VIEWER'],
        ['userID', input.externalUserId],
      ]
      // Binds the URL to this meeting instance: a re-created meeting rejects it.
      if (input.createTime) params.push(['createTime', input.createTime])
      params.push(['redirect', 'true'])
      if (input.locale) params.push(['userdata-bbb_override_default_locale', input.locale])
      // Built locally, no network. BBB join URLs do not expire while the meeting runs (ADR 012).
      return { kind: 'redirect', url: signedUrl('join', params), expiresAt: null }
    },

    async getRoomStatus(providerRoomId) {
      const r = parse('getMeetingInfo', MeetingInfoResponse, await call('getMeetingInfo', [['meetingID', providerRoomId]]))
      if (r.returncode !== 'SUCCESS') {
        if (r.messageKey === 'notFound') return { running: false }
        failed('getMeetingInfo', r)
      }
      return {
        running: r.running === 'true',
        ...(r.participantCount ? { participantCount: Number(r.participantCount) } : {}),
        ...(r.moderatorCount ? { moderatorCount: Number(r.moderatorCount) } : {}),
      }
    },

    async endRoom(providerRoomId) {
      const r = parse('end', BaseResponse, await call('end', [['meetingID', providerRoomId]]))
      if (r.returncode !== 'SUCCESS' && r.messageKey !== 'notFound') failed('end', r)
    },

    async listRecordings(providerRoomId) {
      checkMeetingId(providerRoomId)
      const list = await getRecordings([['meetingID', providerRoomId]])
      return list
        .filter((r) => r.meetingID === providerRoomId)
        .map(mapRecording)
        .filter((r): r is LiveRecording => r !== null)
    },

    async getRecording(providerRecordingId) {
      if (!providerRecordingId || providerRecordingId.includes(',')) return null
      // recordID also matches by prefix, so insist on an exact match.
      const list = await getRecordings([['recordID', providerRecordingId]])
      const found = list.find((r) => r.recordID === providerRecordingId)
      return found ? mapRecording(found) : null
    },

    async deleteRecording(providerRecordingId) {
      if (!providerRecordingId || providerRecordingId.includes(',')) {
        throw new IntegrationError(PROVIDER, 'deleteRecordings: one recording id only')
      }
      const r = parse('deleteRecordings', BaseResponse, await call('deleteRecordings', [['recordID', providerRecordingId]]))
      if (r.returncode !== 'SUCCESS' && r.messageKey !== 'notFound') failed('deleteRecordings', r)
    },

    async parseWebhook(req): Promise<ParsedWebhook> {
      let url: URL
      try {
        url = new URL(req.url)
      } catch {
        return { ok: false, reason: 'unparseable' }
      }
      switch (detectKind(req, url)) {
        case 'hooks':
          return parseHooks(req)
        case 'recording':
          return parseRecordingReady(req)
        case 'analytics':
          return parseAnalytics(req)
        case 'ended':
          return parseEnded(url)
        default:
          return { ok: false, reason: 'unparseable' }
      }
    },
  }
}
