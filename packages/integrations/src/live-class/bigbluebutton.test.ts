import { createHash, createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IntegrationError } from '../errors'
import {
  bbbChecksum,
  createBigBlueButtonProvider,
  normalizeApiBase,
  parseXml,
  verifyJwt,
  xmlToPlain,
} from './bigbluebutton'
import { createLiveClassProvider } from '.'
import type { WebhookRequest } from './types'

const SECRET = 'test-shared-secret-not-real'
const BASE = 'https://bbb.example.test/bigbluebutton/'
const API = 'https://bbb.example.test/bigbluebutton/api'
const HOOK_URL = 'https://iba.example.test/api/live/webhook/bigbluebutton'
const fixedNow = new Date('2026-11-06T10:00:00Z')
const ROOM = '7:42'

type Call = { url: URL; method: string; body: string | undefined }
let calls: Call[] = []
let replies: string[] = []

beforeEach(() => {
  calls = []
  replies = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: new URL(String(input)), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : undefined })
      const xml = replies.shift()
      if (xml === undefined) throw new Error('unexpected fetch')
      return new Response(xml, { status: 200, headers: { 'content-type': 'text/xml' } })
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const make = (alg?: 'sha1' | 'sha256' | 'sha512') =>
  createBigBlueButtonProvider({ baseUrl: BASE, secret: SECRET, checksumAlgorithm: alg, now: () => fixedNow, warn: () => {} })

/** Checks the request the way bbb-web's GetChecksumValidator does: strip `&checksum=…`, hash call + query + secret. */
function expectSigned(call: Call, name: string, alg: 'sha1' | 'sha256' | 'sha512' = 'sha256') {
  expect(`${call.url.origin}${call.url.pathname}`).toBe(`${API}/${name}`)
  const raw = call.url.search.slice(1)
  const m = /^(.*?)&?checksum=([0-9a-f]+)$/.exec(raw)
  expect(m).not.toBeNull()
  expect(m![2]).toBe(createHash(alg).update(`${name}${m![1]}${SECRET}`).digest('hex'))
}

/* Response shapes copied from https://docs.bigbluebutton.org/development/api (v4.0.x-release). */
const createXml = (createTime: string, warning = false) => `<response>
  <returncode>SUCCESS</returncode>
  <meetingID>${ROOM}</meetingID>
  <internalMeetingID>640ab2bae07bedc4c163f679a746f7ab7fb5d1fa-${createTime}</internalMeetingID>
  <parentMeetingID>bbb-none</parentMeetingID>
  <createTime>${createTime}</createTime>
  <voiceBridge>70757</voiceBridge>
  <dialNumber>613-555-1234</dialNumber>
  <createDate>Mon Jul 09 17:03:29 UTC 2018</createDate>
  <hasUserJoined>false</hasUserJoined>
  <duration>0</duration>
  <hasBeenForciblyEnded>false</hasBeenForciblyEnded>
  ${warning ? '<messageKey>duplicateWarning</messageKey><message>This conference was already in existence and may currently be in progress.</message>' : '<messageKey></messageKey><message></message>'}
</response>`

const hooksOk = `<response><returncode>SUCCESS</returncode><hookID>1</hookID><permanentHook>false</permanentHook><rawData>false</rawData></response>`
const failedXml = (key: string, message = 'x') =>
  `<response><returncode>FAILED</returncode><messageKey>${key}</messageKey><message>${message}</message></response>`

const meetingInfoXml = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <returncode>SUCCESS</returncode>
  <meetingName>کلاس برند</meetingName>
  <meetingID>${ROOM}</meetingID>
  <internalMeetingID>183f0bf3a0982a127bdb8161e0c44eb696b3e75c-1531241258036</internalMeetingID>
  <createTime>1531241258036</createTime>
  <running>true</running>
  <participantCount>2</participantCount>
  <moderatorCount>1</moderatorCount>
  <attendees>
    <attendee><userID>u1</userID><fullName>استاد</fullName><role>MODERATOR</role></attendee>
    <attendee><userID>u2</userID><fullName>Tom &amp; Jerry</fullName><role>VIEWER</role></attendee>
  </attendees>
  <metadata><edvora-room>${ROOM}</edvora-room></metadata>
  <isBreakout>false</isBreakout>
</response>`

const recordingsXml = `<response>
   <returncode>SUCCESS</returncode>
   <recordings>
      <recording>
         <recordID>ffbfc4cc24428694e8b53a4e144f414052431693-1530718721124</recordID>
         <meetingID>${ROOM}</meetingID>
         <internalMeetingID>ffbfc4cc24428694e8b53a4e144f414052431693-1530718721124</internalMeetingID>
         <name><![CDATA[Fred's Room]]></name>
         <isBreakout>false</isBreakout>
         <published>true</published>
         <state>published</state>
         <startTime>1530718721124</startTime>
         <endTime>1530718810456</endTime>
         <participants>3</participants>
         <metadata>
            <isBreakout>false</isBreakout>
            <meetingName>Fred's Room</meetingName>
            <edvora-room>${ROOM}</edvora-room>
         </metadata>
         <playback>
            <format>
               <type>presentation</type>
               <url>https://bbb.example.test/playback/presentation/2.3/ffbfc4cc24428694e8b53a4e144f414052431693-1530718721124</url>
               <processingTime>7177</processingTime>
               <length>1</length>
               <preview>
                  <images>
                     <image alt="Welcome to" height="136" width="176">https://bbb.example.test/presentation/x/thumbnails/thumb-1.png</image>
                  </images>
               </preview>
            </format>
            <format>
               <type>video</type>
               <url>https://bbb.example.test/playback/video/ffbfc4cc24428694e8b53a4e144f414052431693-1530718721124/</url>
               <processingTime>90000</processingTime>
               <length>1</length>
               <size>1048576</size>
            </format>
         </playback>
      </recording>
      <recording>
         <recordID>ffbfc4cc24428694e8b53a4e144f414052431693-1530278898111</recordID>
         <meetingID>${ROOM}</meetingID>
         <internalMeetingID>ffbfc4cc24428694e8b53a4e144f414052431693-1530278898111</internalMeetingID>
         <name>Fred's Room</name>
         <published>true</published>
         <state>published</state>
         <startTime>1530278898111</startTime>
         <endTime>1530281194326</endTime>
         <participants>7</participants>
         <metadata />
         <playback>
            <format>
               <type>presentation</type>
               <url>https://bbb.example.test/playback/presentation/2.3/ffbfc4cc24428694e8b53a4e144f414052431693-1530278898111</url>
               <processingTime>139458</processingTime>
               <length>33</length>
            </format>
         </playback>
      </recording>
   </recordings>
</response>`

const room = {
  externalRoomId: ROOM,
  title: 'کلاس برند‌سازی',
  startsAt: fixedNow.toISOString(),
  durationMin: 90,
  record: true,
}

describe('checksums', () => {
  it('matches the documented SHA-1 example and the sha256/sha512 variants', () => {
    // https://docs.bigbluebutton.org/development/api#usage
    const q = 'name=Test+Meeting&meetingID=abc123&attendeePW=111222&moderatorPW=333444'
    const s = '639259d4-9dd8-4b25-bf01-95f9567eaf4b'
    expect(bbbChecksum('create', q, s, 'sha1')).toBe('1fcbb0c4fc1f039f73aa6d697d2db9ba7f803f17')
    expect(bbbChecksum('create', q, s, 'sha256')).toBe('da9185f7f333cfdfcd6eeac32dca3777510c4c436020d8b887ba5515bd1d189e')
    expect(bbbChecksum('create', q, s)).toBe('da9185f7f333cfdfcd6eeac32dca3777510c4c436020d8b887ba5515bd1d189e')
    expect(bbbChecksum('create', q, s, 'sha512')).toBe(
      'de73ad61d11a5c801b68d4bd6ec5248546085cefb0b25c85f3c46249ea93a3a4b120f92c0a8a58d7512cb77821884951a3b01245f3435dbbef49fff3cc3988b4',
    )
  })

  it('normalises the base URL', () => {
    expect(normalizeApiBase('https://h.test/bigbluebutton/')).toBe('https://h.test/bigbluebutton/api')
    expect(normalizeApiBase('https://h.test/bigbluebutton/api/')).toBe('https://h.test/bigbluebutton/api')
    expect(() => normalizeApiBase('ftp://h.test/')).toThrow(IntegrationError)
    expect(() => createBigBlueButtonProvider({ baseUrl: BASE, secret: '' })).toThrow(/BBB_SECRET/)
    expect(() => createBigBlueButtonProvider({ baseUrl: '', secret: 's' })).toThrow(/BBB_URL/)
  })
})

describe('xml', () => {
  it('parses BBB responses, entities, CDATA and lists', () => {
    const plain = xmlToPlain(parseXml(meetingInfoXml).children[0]!)
    expect(plain).toMatchObject({ returncode: 'SUCCESS', meetingName: 'کلاس برند', running: 'true' })
    const attendees = (plain as { attendees: { attendee: { fullName: string }[] } }).attendees.attendee
    expect(attendees.map((a) => a.fullName)).toEqual(['استاد', 'Tom & Jerry'])
    expect(xmlToPlain(parseXml('<r><a><![CDATA[x<y]]></a><b>&#1601;&#x627;</b><c/></r>').children[0]!)).toEqual({ a: 'x<y', b: 'فا', c: '' })
  })

  it('rejects malformed XML and DOCTYPE', () => {
    expect(() => parseXml('<a><b></a>')).toThrow(/Invalid XML/)
    expect(() => parseXml('<a>')).toThrow(/unclosed/)
    expect(() => parseXml('<!DOCTYPE x [<!ENTITY e "boom">]><a>&e;</a>')).toThrow(/DOCTYPE/)
  })
})

describe('createRoom', () => {
  it('sends the documented create parameters and registers a per-meeting hook', async () => {
    replies.push(createXml('1531155809613'), hooksOk)
    const r = await make().createRoom({
      ...room,
      waitingRoom: true,
      maxParticipants: 50,
      welcomeMessage: 'خوش آمدید',
      branding: { logoUrl: 'https://iba.example.test/logo.png', bannerText: 'آکادمی', bannerColor: '#0f5132' },
      webhookUrl: HOOK_URL,
      meta: { course: 'c1', 'bbb-recording-ready-url': 'https://evil.test' },
    })
    expect(r).toEqual({
      providerRoomId: ROOM,
      externalRoomId: ROOM,
      createTime: '1531155809613',
      createdAt: new Date(1531155809613).toISOString(),
    })

    const [create, hook] = calls
    expectSigned(create!, 'create')
    expect(create!.method).toBe('GET')
    const p = create!.url.searchParams
    expect(p.get('meetingID')).toBe(ROOM)
    expect(p.get('name')).toBe(room.title)
    expect(p.get('record')).toBe('true')
    expect(p.get('autoStartRecording')).toBe('false')
    expect(p.get('allowStartStopRecording')).toBe('true')
    expect(p.get('guestPolicy')).toBe('ASK_MODERATOR')
    expect(p.get('maxParticipants')).toBe('50')
    expect(p.get('welcome')).toBe('خوش آمدید')
    expect(p.get('duration')).toBe('120') // 90 + 30 min grace
    expect(p.get('logo')).toBe('https://iba.example.test/logo.png')
    expect(p.get('bannerText')).toBe('آکادمی')
    expect(p.get('bannerColor')).toBe('#0f5132')
    expect(p.get('meta_edvora-room')).toBe(ROOM)
    expect(p.get('meta_course')).toBe('c1')
    // A caller's meta cannot redirect our callbacks.
    expect(p.getAll('meta_bbb-recording-ready-url')).toEqual([`${HOOK_URL}?kind=recording`])
    expect(p.get('meta_analytics-callback-url')).toBe(`${HOOK_URL}?kind=analytics`)
    const ended = new URL(p.get('meetingEndedURL')!)
    expect(ended.searchParams.get('kind')).toBe('ended')
    expect(ended.searchParams.get('room')).toBe(ROOM)
    expect(ended.searchParams.get('sig')).toBeTruthy()
    expect(p.get('meta_bbb-recording-ready-url')).not.toContain(SECRET)

    expectSigned(hook!, 'hooks/create')
    expect(hook!.url.searchParams.get('callbackURL')).toBe(`${HOOK_URL}?kind=hooks&room=7%3A42`)
    expect(hook!.url.searchParams.get('meetingID')).toBe(ROOM)
    expect(hook!.url.searchParams.get('eventID')).toBe('meeting-created,meeting-ended,user-joined,user-left')
  })

  it('is idempotent: duplicateWarning returns the running meeting createTime', async () => {
    replies.push(createXml('1700000000000', true))
    const r = await make().createRoom({ ...room, record: false })
    expect(r.createTime).toBe('1700000000000')
    expect(calls).toHaveLength(1) // no webhookUrl, no hook registration
    expect(calls[0]!.url.searchParams.get('guestPolicy')).toBe('ALWAYS_ACCEPT')
    expect(calls[0]!.url.searchParams.get('record')).toBe('false')
  })

  it('posts presentations as the documented XML body', async () => {
    replies.push(createXml('1'))
    await make().createRoom({ ...room, presentations: [{ url: 'https://s3.example.test/a.pdf?X-Sig=1&y=2', filename: 'جلسه "۱".pdf' }] })
    expect(calls[0]!.method).toBe('POST')
    expect(calls[0]!.body).toContain('<modules><module name="presentation"><document url="https://s3.example.test/a.pdf?X-Sig=1&amp;y=2"')
    expect(calls[0]!.body).toContain('filename="جلسه &quot;۱&quot;.pdf"')
    expectSigned(calls[0]!, 'create')
  })

  it('throws IntegrationError on FAILED, bad XML and invalid ids, but survives a failing hook registration', async () => {
    replies.push(failedXml('checksumError', 'Checksums do not match'))
    await expect(make().createRoom(room)).rejects.toThrow(/checksumError/)
    replies.push('<html>502</html')
    await expect(make().createRoom(room)).rejects.toThrow(/non-XML/)
    await expect(make().createRoom({ ...room, externalRoomId: 'a,b' })).rejects.toThrow(/Invalid meeting id/)

    const warn = vi.fn()
    replies.push(createXml('5'), failedXml('createHookError'))
    const p = createBigBlueButtonProvider({ baseUrl: BASE, secret: SECRET, warn })
    await expect(p.createRoom({ ...room, webhookUrl: HOOK_URL })).resolves.toMatchObject({ createTime: '5' })
    expect(warn).toHaveBeenCalledWith('hooks/create failed', { messageKey: 'createHookError' })
  })

  it('uses the configured checksum algorithm', async () => {
    replies.push(createXml('1'))
    await make('sha1').createRoom(room)
    expectSigned(calls[0]!, 'create', 'sha1')
  })
})

describe('getJoinTicket', () => {
  it('builds a signed join URL locally, per role, with no network and no expiry', async () => {
    const p = make()
    const t = await p.getJoinTicket({
      providerRoomId: ROOM,
      externalRoomId: ROOM,
      createTime: '1531155809613',
      externalUserId: 'u7',
      displayName: 'سارا رضایی',
      role: 'attendee',
      locale: 'fa',
    })
    expect(calls).toHaveLength(0)
    expect(t).toMatchObject({ kind: 'redirect', expiresAt: null })
    if (t.kind !== 'redirect') return
    const url = new URL(t.url)
    const call: Call = { url, method: 'GET', body: undefined }
    expectSigned(call, 'join')
    expect(Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'checksum'))).toEqual({
      fullName: 'سارا رضایی',
      meetingID: ROOM,
      role: 'VIEWER',
      userID: 'u7',
      createTime: '1531155809613',
      redirect: 'true',
      'userdata-bbb_override_default_locale': 'fa',
    })

    const mod = await p.getJoinTicket({ providerRoomId: ROOM, externalRoomId: ROOM, externalUserId: 't1', displayName: 'استاد', role: 'moderator' })
    if (mod.kind !== 'redirect') throw new Error('expected redirect')
    const mp = new URL(mod.url).searchParams
    expect(mp.get('role')).toBe('MODERATOR')
    expect(mp.has('createTime')).toBe(false)
    expect(mp.has('userdata-bbb_override_default_locale')).toBe(false)
  })

  it('does not advertise ticket expiry', () => {
    const caps = make().capabilities
    expect(caps.has('ticketExpiry')).toBe(false)
    expect(caps.has('e2ee')).toBe(false)
    expect(caps.has('attendanceSummary')).toBe(true)
  })
})

describe('room status and end', () => {
  it('maps getMeetingInfo and treats notFound as not running', async () => {
    replies.push(meetingInfoXml, failedXml('notFound', 'A meeting with that ID does not exist'), failedXml('checksumError'))
    const p = make()
    await expect(p.getRoomStatus(ROOM)).resolves.toEqual({ running: true, participantCount: 2, moderatorCount: 1 })
    expectSigned(calls[0]!, 'getMeetingInfo')
    await expect(p.getRoomStatus(ROOM)).resolves.toEqual({ running: false })
    await expect(p.getRoomStatus(ROOM)).rejects.toThrow(IntegrationError)
  })

  it('ends a meeting; an unknown meeting is fine', async () => {
    replies.push(
      `<response><returncode>SUCCESS</returncode><messageKey>sentEndMeetingRequest</messageKey><message>A request to end the meeting was sent.</message></response>`,
      failedXml('notFound'),
      failedXml('checksumError'),
    )
    const p = make()
    await p.endRoom(ROOM)
    expectSigned(calls[0]!, 'end')
    expect(calls[0]!.url.searchParams.get('meetingID')).toBe(ROOM)
    await p.endRoom(ROOM)
    await expect(p.endRoom(ROOM)).rejects.toThrow(/checksumError/)
  })
})

describe('recordings', () => {
  it('lists recordings, preferring the video (mp4) format, else presentation playback', async () => {
    replies.push(recordingsXml)
    const list = await make().listRecordings(ROOM)
    expectSigned(calls[0]!, 'getRecordings')
    expect(calls[0]!.url.searchParams.get('meetingID')).toBe(ROOM)
    expect(list).toEqual([
      {
        providerRecordingId: 'ffbfc4cc24428694e8b53a4e144f414052431693-1530718721124',
        providerRoomId: ROOM,
        externalRoomId: ROOM,
        startedAt: new Date(1530718721124).toISOString(),
        endedAt: new Date(1530718810456).toISOString(),
        durationSec: 89,
        format: 'mp4',
        url: 'https://bbb.example.test/playback/video/ffbfc4cc24428694e8b53a4e144f414052431693-1530718721124/video-0.m4v',
        sizeBytes: 1048576,
      },
      {
        providerRecordingId: 'ffbfc4cc24428694e8b53a4e144f414052431693-1530278898111',
        providerRoomId: ROOM,
        externalRoomId: ROOM,
        startedAt: new Date(1530278898111).toISOString(),
        endedAt: new Date(1530281194326).toISOString(),
        durationSec: 2296,
        format: 'provider-playback',
        url: 'https://bbb.example.test/playback/presentation/2.3/ffbfc4cc24428694e8b53a4e144f414052431693-1530278898111',
      },
    ])
  })

  it('handles an empty list', async () => {
    replies.push('<response><returncode>SUCCESS</returncode><recordings></recordings><messageKey>noRecordings</messageKey></response>')
    replies.push(failedXml('noRecordings'))
    await expect(make().listRecordings(ROOM)).resolves.toEqual([])
    await expect(make().listRecordings(ROOM)).resolves.toEqual([])
  })

  it('gets one recording by exact recordID (recordID also matches prefixes)', async () => {
    replies.push(recordingsXml, recordingsXml)
    const p = make()
    const rec = await p.getRecording('ffbfc4cc24428694e8b53a4e144f414052431693-1530278898111')
    expect(calls[0]!.url.searchParams.get('recordID')).toBe('ffbfc4cc24428694e8b53a4e144f414052431693-1530278898111')
    expect(rec?.format).toBe('provider-playback')
    expect(await p.getRecording('ffbfc4cc24428694e8b53a4e144f414052431693')).toBeNull()
    expect(await p.getRecording('a,b')).toBeNull()
  })

  it('deletes a recording; notFound is fine', async () => {
    replies.push('<response><returncode>SUCCESS</returncode><deleted>true</deleted></response>', failedXml('notFound'))
    const p = make()
    await p.deleteRecording('rec-1')
    expectSigned(calls[0]!, 'deleteRecordings')
    expect(calls[0]!.url.searchParams.get('recordID')).toBe('rec-1')
    await p.deleteRecording('rec-1')
    await expect(p.deleteRecording('a,b')).rejects.toThrow(IntegrationError)
  })
})

/* ---------------------------------------------- webhooks ----------------------------------------------------- */

/** As bbb-webhooks >= 3.4.0 sends it (src/out/webhooks/callback-emitter.js). */
function hookRequest(events: unknown[], opts: { alg?: string; secret?: string; callbackURL?: string } = {}): WebhookRequest {
  const callbackURL = opts.callbackURL ?? `${HOOK_URL}?kind=hooks&room=7%3A42`
  const data = new URLSearchParams({ domain: 'bbb.example.test', event: JSON.stringify(events), timestamp: '1762423200500' })
  const body = data.toString()
  const checksum = createHash(opts.alg ?? 'sha1').update(`${callbackURL}${body}${opts.secret ?? SECRET}`).digest('hex')
  return {
    url: `${callbackURL}${callbackURL.includes('?') ? '&' : '?'}checksum=${checksum}`,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    rawBody: body,
  }
}

const userEvent = (id: 'user-joined' | 'user-left', extId: string, role = 'VIEWER', ts = 1762423200000) => ({
  data: {
    type: 'event',
    id,
    attributes: {
      meeting: { 'internal-meeting-id': '183f0bf3a0982a127bdb8161e0c44eb696b3e75c-1762423000000', 'external-meeting-id': ROOM },
      user: { 'internal-user-id': 'w_abc123', 'external-user-id': extId, name: 'سارا', role, presenter: false, guest: false },
    },
    event: { ts },
  },
})

const meetingEvent = (id: 'meeting-created' | 'meeting-ended', ts = 1762423100000) => ({
  data: {
    type: 'event',
    id,
    attributes: { meeting: { 'internal-meeting-id': '183f0bf3a0982a127bdb8161e0c44eb696b3e75c-1762423000000', 'external-meeting-id': ROOM } },
    event: { ts },
  },
})

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
function jwt(payload: unknown, opts: { alg?: 'HS256' | 'HS512'; secret?: string; header?: unknown } = {}) {
  const alg = opts.alg ?? 'HS256'
  const h = b64(opts.header ?? { alg })
  const p = b64(payload)
  const s = createHmac(alg === 'HS256' ? 'sha256' : 'sha512', opts.secret ?? SECRET).update(`${h}.${p}`).digest('base64url')
  return `${h}.${p}.${s}`
}

describe('parseWebhook: bbb-webhooks events', () => {
  it('maps user-joined/left and meeting-created/ended with deterministic event ids', async () => {
    const p = make()
    const req = hookRequest([
      meetingEvent('meeting-created'),
      userEvent('user-joined', 'u7'),
      userEvent('user-left', 't1', 'MODERATOR', 1762423300000),
      { data: { type: 'event', id: 'chat-group-message-sent', attributes: { meeting: { 'external-meeting-id': ROOM } }, event: { ts: 1 } } },
      userEvent('user-joined', ''), // dial-in user without our userID: skipped
      meetingEvent('meeting-ended', 1762426800000),
    ])
    const parsed = await p.parseWebhook(req)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.events.map((e) => e.type)).toEqual(['room.started', 'participant.joined', 'participant.left', 'room.ended'])
    expect(parsed.events[1]).toMatchObject({
      providerRoomId: ROOM,
      externalRoomId: ROOM,
      externalUserId: 'u7',
      role: 'attendee',
      occurredAt: new Date(1762423200000).toISOString(),
    })
    expect(parsed.events[2]).toMatchObject({ externalUserId: 't1', role: 'moderator' })
    const again = await p.parseWebhook(req)
    expect(again.ok && again.events.map((e) => e.eventId)).toEqual(parsed.events.map((e) => e.eventId))
    expect(new Set(parsed.events.map((e) => e.eventId)).size).toBe(4)
    expect(parsed.events[1]!.eventId).toMatch(/^[0-9a-f]{64}$/)
  })

  it('accepts every hookChecksumAlgorithm and the 2.x single-object body', async () => {
    for (const alg of ['sha1', 'sha256', 'sha384', 'sha512']) {
      expect((await make().parseWebhook(hookRequest([userEvent('user-joined', 'u7')], { alg }))).ok).toBe(true)
    }
    const callbackURL = `${HOOK_URL}?kind=hooks`
    const body = new URLSearchParams({ event: JSON.stringify(userEvent('user-left', 'u7')), timestamp: '1' }).toString()
    const checksum = createHash('sha1').update(`${callbackURL}${body}${SECRET}`).digest('hex')
    const single = await make().parseWebhook({ url: `${callbackURL}&checksum=${checksum}`, headers: {}, rawBody: body })
    expect(single.ok && single.events[0]?.type).toBe('participant.left')
  })

  it('accepts auth2_0 Bearer mode', async () => {
    const body = new URLSearchParams({ domain: 'd', event: JSON.stringify([userEvent('user-joined', 'u7')]), timestamp: '1' }).toString()
    const ok = await make().parseWebhook({ url: `${HOOK_URL}?kind=hooks`, headers: { authorization: `Bearer ${SECRET}` }, rawBody: body })
    expect(ok.ok).toBe(true)
    const bad = await make().parseWebhook({ url: `${HOOK_URL}?kind=hooks`, headers: { authorization: `Bearer ${SECRET}x` }, rawBody: body })
    expect(bad).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('rejects bad checksums: tampered body, other secret, other URL, missing, wrong length, legacy "{}" form', async () => {
    const p = make()
    const req = hookRequest([userEvent('user-joined', 'u7')])
    const bad = { ok: false, reason: 'bad-signature' }
    expect(await p.parseWebhook({ ...req, rawBody: req.rawBody.replace('u7', 'u8') })).toEqual(bad)
    expect(await p.parseWebhook(hookRequest([userEvent('user-joined', 'u7')], { secret: 'other' }))).toEqual(bad)
    expect(await p.parseWebhook({ ...req, url: req.url.replace('room=7%3A42', 'room=7%3A43') })).toEqual(bad)
    expect(await p.parseWebhook({ ...req, url: req.url.replace(/&checksum=.*$/, '') })).toEqual(bad)
    expect(await p.parseWebhook({ ...req, url: req.url.replace(/checksum=.*$/, 'checksum=abc123') })).toEqual(bad)
    // Same-length, one hex digit off: exercises the timingSafeEqual path rather than the length guard.
    const flipped = req.url.replace(/([0-9a-f])$/, (d) => (d === '0' ? '1' : '0'))
    expect(await p.parseWebhook({ ...req, url: flipped })).toEqual(bad)
    // bbb-webhooks 3.0–3.3 hashed "{}" instead of the body; that does not authenticate the body, so it is refused.
    const callbackURL = `${HOOK_URL}?kind=hooks&room=7%3A42`
    const legacy = createHash('sha1').update(`${callbackURL}{}${SECRET}`).digest('hex')
    expect(await p.parseWebhook({ ...req, url: `${callbackURL}&checksum=${legacy}` })).toEqual(bad)
  })

  it('signed but unusable bodies are unparseable or unsupported', async () => {
    const p = make()
    expect(await p.parseWebhook(hookRequest([{ data: { id: 'user-joined' } }]))).toEqual({ ok: false, reason: 'unparseable' })
    expect(await p.parseWebhook(hookRequest([meetingEvent('meeting-created', Number.NaN)]))).toEqual({ ok: false, reason: 'unparseable' })
    const only = hookRequest([{ data: { type: 'event', id: 'user-audio-muted', attributes: { meeting: { 'external-meeting-id': ROOM } }, event: { ts: 5 } } }])
    expect(await p.parseWebhook(only)).toEqual({ ok: false, reason: 'unsupported' })
  })
})

describe('parseWebhook: recording-ready callback', () => {
  const recReq = (token: string): WebhookRequest => ({
    url: `${HOOK_URL}?kind=recording`,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    rawBody: new URLSearchParams({ signed_parameters: token }).toString(),
  })

  it('verifies the HS256 JWT and emits recording.ready', async () => {
    const token = jwt({ meeting_id: ROOM, record_id: 'ffbfc4cc-1530718721124' })
    const parsed = await make().parseWebhook(recReq(token))
    expect(parsed).toEqual({
      ok: true,
      events: [
        {
          type: 'recording.ready',
          eventId: 'rec:ffbfc4cc-1530718721124',
          occurredAt: fixedNow.toISOString(),
          providerRoomId: ROOM,
          externalRoomId: ROOM,
          providerRecordingId: 'ffbfc4cc-1530718721124',
        },
      ],
    })
    // Kind detection also works without ?kind (e.g. a URL registered by hand).
    expect((await make().parseWebhook({ ...recReq(token), url: HOOK_URL })).ok).toBe(true)
  })

  it('rejects other secrets, other algorithms, tampering, expiry and missing tokens', async () => {
    const p = make()
    const bad = { ok: false, reason: 'bad-signature' }
    const payload = { meeting_id: ROOM, record_id: 'r1' }
    expect(await p.parseWebhook(recReq(jwt(payload, { secret: 'other' })))).toEqual(bad)
    expect(await p.parseWebhook(recReq(jwt(payload, { alg: 'HS512' })))).toEqual(bad)
    expect(await p.parseWebhook(recReq(jwt(payload, { header: { alg: 'none' } })))).toEqual(bad)
    const [h, , s] = jwt(payload).split('.')
    expect(await p.parseWebhook(recReq(`${h}.${b64({ meeting_id: ROOM, record_id: 'r2' })}.${s}`))).toEqual(bad)
    expect(await p.parseWebhook(recReq(jwt({ ...payload, exp: fixedNow.getTime() / 1000 - 1 })))).toEqual(bad)
    expect(await p.parseWebhook(recReq('not-a-jwt'))).toEqual(bad)
    expect(await p.parseWebhook({ ...recReq('x'), rawBody: '' })).toEqual(bad)
    expect(await p.parseWebhook(recReq(jwt({ meeting_id: ROOM })))).toEqual({ ok: false, reason: 'unparseable' })
  })
})

describe('parseWebhook: analytics callback', () => {
  // Shape from https://docs.bigbluebutton.org/development/api#learning-analytics-dashboard-callback-url
  const body = {
    version: '1.0',
    meeting_id: ROOM,
    internal_meeting_id: '82de1f45d28e38b6ab1e304aa39bfece5700cb64-1769423218203',
    data: {
      metadata: { analytics_callback_url: `${HOOK_URL}?kind=analytics`, is_breakout: 'false', meeting_name: 'کلاس' },
      duration: 5400,
      start: '2026-11-06T13:30:00.000+03:30',
      finish: '2026-11-06T15:00:00.000+03:30',
      attendees: [
        {
          ext_user_id: 't1',
          name: 'استاد',
          moderator: true,
          joins: ['2026-11-06T13:30:05.000+03:30'],
          leaves: ['2026-11-06T15:00:00.000+03:30'],
          duration: 5395,
          engagement: { chats: 1, talks: 9, raisehand: 0, emojis: 0, poll_votes: 0, talk_time: 1800 },
        },
        { ext_user_id: 'u7', name: 'سارا', moderator: false, joins: ['2026-11-06T13:40:00.000+03:30'], leaves: ['2026-11-06T14:00:00.000+03:30'], duration: 1200 },
        { ext_user_id: 'u7', name: 'سارا', moderator: false, joins: ['2026-11-06T14:10:00.000+03:30'], leaves: [], duration: 600 },
        { ext_user_id: '', name: 'dial-in', moderator: false, joins: [], leaves: [], duration: 10 },
      ],
      files: ['presentation.pdf'],
      polls: [],
    },
  }
  const anaReq = (token: string, raw = JSON.stringify(body)): WebhookRequest => ({
    url: `${HOOK_URL}?kind=analytics`,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    rawBody: raw,
  })
  const exp = Math.floor(fixedNow.getTime() / 1000) + 3600
  const token = jwt({ exp }, { alg: 'HS512', header: { alg: 'HS512', typ: 'JWT' } })

  it('verifies the Bearer HS512 JWT and maps attendees', async () => {
    const parsed = await make().parseWebhook(anaReq(token))
    expect(parsed).toEqual({
      ok: true,
      events: [
        {
          type: 'attendance.summary',
          eventId: 'summary:82de1f45d28e38b6ab1e304aa39bfece5700cb64-1769423218203',
          occurredAt: '2026-11-06T11:30:00.000Z',
          providerRoomId: ROOM,
          externalRoomId: ROOM,
          attendees: [
            { externalUserId: 't1', role: 'moderator', joinedAt: '2026-11-06T10:00:05.000Z', leftAt: '2026-11-06T11:30:00.000Z', durationSec: 5395 },
            { externalUserId: 'u7', role: 'attendee', joinedAt: '2026-11-06T10:10:00.000Z', leftAt: '2026-11-06T10:30:00.000Z', durationSec: 1800 },
          ],
        },
      ],
    })
  })

  it('rejects missing, expired, unexpiring, wrong-algorithm and wrong-secret tokens', async () => {
    const p = make()
    const bad = { ok: false, reason: 'bad-signature' }
    expect(await p.parseWebhook({ ...anaReq(token), headers: { 'content-type': 'application/json' } })).toEqual(bad)
    expect(await p.parseWebhook(anaReq(jwt({ exp: exp - 7200 }, { alg: 'HS512' })))).toEqual(bad)
    expect(await p.parseWebhook(anaReq(jwt({}, { alg: 'HS512' })))).toEqual(bad)
    expect(await p.parseWebhook(anaReq(jwt({ exp }, { alg: 'HS256' })))).toEqual(bad)
    expect(await p.parseWebhook(anaReq(jwt({ exp }, { alg: 'HS512', secret: 'other' })))).toEqual(bad)
    expect(await p.parseWebhook(anaReq(token, '{not json'))).toEqual({ ok: false, reason: 'unparseable' })
    expect(await p.parseWebhook(anaReq(token, JSON.stringify({ meeting_id: ROOM })))).toEqual({ ok: false, reason: 'unparseable' })
  })
})

describe('parseWebhook: meetingEndedURL', () => {
  it('verifies our HMAC on the GET callback and tolerates BBB-appended params', async () => {
    replies.push(createXml('9'), hooksOk)
    const p = make()
    await p.createRoom({ ...room, webhookUrl: HOOK_URL })
    const ended = new URL(calls[0]!.url.searchParams.get('meetingEndedURL')!)
    ended.searchParams.append('recordingmarks', 'true')
    ended.searchParams.append('meetingID', ROOM)
    const parsed = await p.parseWebhook({ url: ended.toString(), headers: {}, rawBody: '' })
    expect(parsed.ok && parsed.events[0]).toMatchObject({ type: 'room.ended', providerRoomId: ROOM, externalRoomId: ROOM })
    if (parsed.ok) expect(parsed.events[0]!.eventId).toMatch(/^ended:7:42:[0-9a-f]{16}$/)

    const forged = new URL(ended)
    forged.searchParams.set('room', '7:43')
    expect(await p.parseWebhook({ url: forged.toString(), headers: {}, rawBody: '' })).toEqual({ ok: false, reason: 'bad-signature' })
    forged.searchParams.delete('sig')
    expect(await p.parseWebhook({ url: forged.toString(), headers: {}, rawBody: '' })).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('unknown kinds are unparseable', async () => {
    expect(await make().parseWebhook({ url: `${HOOK_URL}?kind=other`, headers: {}, rawBody: 'x=1' })).toEqual({ ok: false, reason: 'unparseable' })
    expect(await make().parseWebhook({ url: 'not a url', headers: {}, rawBody: '' })).toEqual({ ok: false, reason: 'unparseable' })
  })
})

describe('verifyJwt', () => {
  it('accepts a valid token and rejects bad shapes', () => {
    expect(verifyJwt(jwt({ a: 1 }), SECRET, 'HS256', 0)).toEqual({ a: 1 })
    expect(verifyJwt(`${jwt({ a: 1 })}==`, SECRET, 'HS256', 0)).toEqual({ a: 1 })
    expect(verifyJwt('a.b', SECRET, 'HS256', 0)).toBeNull()
    expect(verifyJwt(jwt([1]), SECRET, 'HS256', 0)).toBeNull()
    expect(verifyJwt(jwt({ exp: 'soon' }), SECRET, 'HS256', 0)).toBeNull()
  })
})

describe('createLiveClassProvider', () => {
  it('builds the BigBlueButton provider', () => {
    const p = createLiveClassProvider({ provider: 'bigbluebutton', baseUrl: BASE, secret: SECRET, checksumAlgorithm: 'sha512' })
    expect(p.name).toBe('bigbluebutton')
    expect(() => createLiveClassProvider({ provider: 'bigbluebutton', baseUrl: BASE, secret: '' })).toThrow(/BBB_SECRET/)
  })
})
