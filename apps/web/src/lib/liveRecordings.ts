import 'server-only'
import { Readable } from 'node:stream'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { objectKey } from '@edvora/integrations/storage'
import type { Payload } from 'payload'
import type { LiveSession } from '../payload-types'
import { idOf } from './ids'
import { getPayloadClient } from './payload'
import { getLiveClass, getStorage } from './providers'

/**
 * D4 (E-017): copy a finished recording from the provider into our private bucket. Provider links expire and
 * BBB keeps files on the live server's disk, so we copy, never link. Streams end to end (a 3-hour MP4 is 1–3 GB).
 * Idempotent: an already-copied recording is left alone. Never throws; status + error are written on the session.
 */

const SYSTEM = { context: { liveSystem: true, edvoraSystem: true } }
/** Refuse absurd files (misconfigured provider) rather than filling the bucket. */
const MAX_BYTES = 8 * 1024 ** 3
const DOWNLOAD_TIMEOUT_MS = 60 * 60 * 1000

type RecordingRow = NonNullable<LiveSession['recordings']>[number]
type Status = NonNullable<RecordingRow['status']>

async function patchRecording(payload: Payload, sessionId: number, providerRecordingId: string, patch: Partial<RecordingRow>) {
  // Re-read so concurrent copies of different recordings of the same session don't overwrite each other.
  const fresh = await payload.findByID({ collection: 'live-sessions', id: sessionId, depth: 0, overrideAccess: true })
  const rows = fresh.recordings ?? []
  const exists = rows.some((r) => r.providerRecordingId === providerRecordingId)
  const next = exists ? rows.map((r) => (r.providerRecordingId === providerRecordingId ? { ...r, ...patch } : r)) : [...rows, { providerRecordingId, ...patch }]
  await payload.update({ collection: 'live-sessions', id: sessionId, data: { recordings: next }, overrideAccess: true, ...SYSTEM })
}

export async function copyRecording(sessionId: number, providerRecordingId: string): Promise<Status> {
  const payload = await getPayloadClient()
  const set = (status: Status, extra: Partial<RecordingRow> = {}) => patchRecording(payload, sessionId, providerRecordingId, { status, ...extra }).then(() => status)
  try {
    const session = await payload.findByID({ collection: 'live-sessions', id: sessionId, depth: 0, overrideAccess: true, disableErrors: true })
    if (!session) return 'failed'
    const row = session.recordings?.find((r) => r.providerRecordingId === providerRecordingId)
    if (row?.status === 'copied' || row?.status === 'copying') return row.status

    const rec = await getLiveClass().getRecording(providerRecordingId)
    if (!rec || rec.providerRoomId !== session.providerRoomId) return set('failed', { error: 'Recording not found at the provider for this session' })
    // BBB publishes `presentation` before `video`: wait for the MP4 and try again later (staff can press "copy").
    if (rec.format !== 'mp4') return set('waiting', { format: rec.format, url: rec.url, durationSec: rec.durationSec, error: null })

    await set('copying', { format: rec.format, url: rec.url, durationSec: rec.durationSec, error: null })
    const res = await fetch(rec.url, { redirect: 'follow', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
    if (!res.ok || !res.body) return set('failed', { error: `Download failed (HTTP ${res.status})` })
    const length = Number(res.headers.get('content-length') ?? 0) || undefined
    if (length && length > MAX_BYTES) return set('failed', { error: `File too large (${length} bytes)` })

    const key = objectKey(idOf(session.tenant) ?? 0, 'recordings', session.id, `${providerRecordingId}.mp4`)
    const stored = await getStorage().putObject({
      key,
      body: Readable.fromWeb(res.body as unknown as WebReadableStream<Uint8Array>),
      contentType: 'video/mp4',
      size: length,
    })
    if (stored.size === 0) return set('failed', { error: 'Empty file' })
    console.info('[live] recording copied', sessionId, providerRecordingId, stored.size)
    return set('copied', { storageKey: stored.key, sizeBytes: stored.size, copiedAt: new Date().toISOString() })
  } catch (err) {
    console.error('[live] recording copy failed', sessionId, providerRecordingId, err)
    return set('failed', { error: err instanceof Error ? err.message.slice(0, 300) : 'Copy failed' }).catch(() => 'failed' as const)
  }
}

/** Short-lived playback URL for a copied recording. Callers must have checked who is asking. */
export async function recordingUrl(session: LiveSession, providerRecordingId: string): Promise<string | null> {
  const row = session.recordings?.find((r) => r.providerRecordingId === providerRecordingId)
  if (row?.status !== 'copied' || !row.storageKey) return null
  return getStorage().signedGetUrl(row.storageKey, { expiresInSec: 300, downloadName: `${session.title}.mp4` })
}
