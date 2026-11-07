/**
 * `.edvora-bundle` reader/writer (FORMAT.md §1): gzip of NDJSON — manifest line, record lines, signature line.
 * The signature is verified over the whole uncompressed content before any record is parsed or yielded.
 */
import { Readable } from 'node:stream'
import { createGunzip, gzipSync } from 'node:zlib'
import { createHmac } from 'node:crypto'
import { ManifestSchema, SIGNATURE_ALG, SignatureLineSchema, SourceRecordSchema, type Manifest, type ManifestInput, type SourceRecord } from './format'
import { safeEqualHex, signBundle } from './signature'

export type BundleErrorCode =
  | 'not_gzip'
  | 'too_large'
  | 'empty'
  | 'missing_signature'
  | 'bad_signature'
  | 'bad_manifest'
  | 'invalid_record'

export class BundleError extends Error {
  constructor(
    public readonly code: BundleErrorCode,
    message: string,
    public readonly line?: number,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'BundleError'
  }
}

/**
 * A buffer, or a factory that opens the same immutable file again (the reader makes two passes: verify, then
 * parse). Keep bundles in private storage and never rewrite them in place.
 */
export type BundleInput = Uint8Array | (() => AsyncIterable<Uint8Array> | NodeJS.ReadableStream)

export type ReadBundleOptions = {
  /** Gzip-bomb guard on the uncompressed size. Default 2 GiB. */
  maxUncompressedBytes?: number
  /** Called for a record line that fails the envelope schema; default: throw `BundleError('invalid_record')`. */
  onInvalidRecord?: (line: number, issues: unknown) => void
}

export type BundleReader = {
  manifest: Manifest
  /** Record lines counted in the verification pass. */
  recordLines: number
  records(): AsyncIterable<SourceRecord>
}

const NL = 0x0a
const DEFAULT_MAX = 2 * 1024 ** 3

function open(input: BundleInput): AsyncIterable<Uint8Array> {
  if (input instanceof Uint8Array) {
    if (input.byteLength < 2 || input[0] !== 0x1f || input[1] !== 0x8b) throw new BundleError('not_gzip', 'File is not a gzip bundle')
    return Readable.from([Buffer.from(input.buffer, input.byteOffset, input.byteLength)]).pipe(createGunzip())
  }
  const source = input()
  const readable = source instanceof Readable ? source : Readable.from(source as AsyncIterable<Uint8Array>)
  return readable.pipe(createGunzip())
}

/** Splits the decompressed stream into raw lines; each yielded Buffer keeps its trailing `\n` if it had one. */
async function* rawLines(input: BundleInput, maxBytes: number): AsyncGenerator<Buffer> {
  let carry: Buffer = Buffer.alloc(0)
  let total = 0
  try {
    for await (const chunk of open(input)) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      total += buf.byteLength
      if (total > maxBytes) throw new BundleError('too_large', `Bundle exceeds ${maxBytes} bytes uncompressed`)
      let data: Buffer = carry.byteLength ? Buffer.concat([carry, buf]) : buf
      let idx = data.indexOf(NL)
      while (idx >= 0) {
        yield data.subarray(0, idx + 1)
        data = data.subarray(idx + 1)
        idx = data.indexOf(NL)
      }
      carry = Buffer.from(data)
    }
  } catch (err) {
    if (err instanceof BundleError) throw err
    throw new BundleError('not_gzip', `Cannot decompress bundle: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (carry.byteLength) yield carry
}

const isBlank = (b: Buffer) => b.toString('utf8').trim() === ''

function parseJsonLine(buf: Buffer, line: number, code: BundleErrorCode): unknown {
  try {
    return JSON.parse(buf.toString('utf8')) as unknown
  } catch {
    throw new BundleError(code, `Line ${line} is not valid JSON`, line)
  }
}

/**
 * Verifies and opens a bundle. Throws `BundleError` (missing/malformed/wrong signature, bad manifest) before
 * returning, so no record is ever read from an unverified bundle.
 */
export async function readBundle(input: BundleInput, secret: string, opts: ReadBundleOptions = {}): Promise<BundleReader> {
  const maxBytes = opts.maxUncompressedBytes ?? DEFAULT_MAX
  const hmac = createHmac('sha256', Buffer.from(secret, 'utf8'))
  let held: Buffer | null = null
  let first: Buffer | null = null
  let count = 0
  for await (const line of rawLines(input, maxBytes)) {
    if (held) hmac.update(held)
    held = line
    if (count === 0) first = line
    count++
  }
  // The signature must be the last line (one trailing \n allowed); nothing may follow it.
  if (!held || !first) throw new BundleError('empty', 'Bundle is empty')
  if (isBlank(held)) throw new BundleError('missing_signature', 'Bundle ends with a blank line where the signature belongs')
  if (count < 2) throw new BundleError('missing_signature', 'Bundle has no signature line')
  let sigJson: unknown
  try {
    sigJson = JSON.parse(held.toString('utf8')) as unknown
  } catch {
    throw new BundleError('missing_signature', 'Last line is not a signature', count)
  }
  const sig = SignatureLineSchema.safeParse(sigJson)
  if (!sig.success) throw new BundleError('missing_signature', `Last line is not a ${SIGNATURE_ALG} signature`, count, sig.error.issues)
  if (!safeEqualHex(hmac.digest('hex'), sig.data.value)) throw new BundleError('bad_signature', 'Bundle signature does not match')

  const manifestParsed = ManifestSchema.safeParse(parseJsonLine(first, 1, 'bad_manifest'))
  if (!manifestParsed.success || (manifestParsed.data.type !== undefined && manifestParsed.data.type !== 'manifest')) {
    throw new BundleError('bad_manifest', 'First line is not a valid manifest', 1, manifestParsed.success ? undefined : manifestParsed.error.issues)
  }
  const manifest = manifestParsed.data
  const recordLines = count - 2

  async function* records(): AsyncGenerator<SourceRecord> {
    let n = 0
    for await (const line of rawLines(input, maxBytes)) {
      n++
      if (n === 1) continue
      if (n === count) break
      if (isBlank(line)) continue
      const parsed = SourceRecordSchema.safeParse(parseJsonLine(line, n, 'invalid_record'))
      if (parsed.success) {
        yield parsed.data
        continue
      }
      if (opts.onInvalidRecord) opts.onInvalidRecord(n, parsed.error.issues)
      else throw new BundleError('invalid_record', `Line ${n} is not a valid record`, n, parsed.error.issues)
    }
  }
  return { manifest, recordLines, records }
}

/** Uncompressed signed content (manifest + record lines). Exposed for fixtures and the PHP test vector. */
export function bundleBody(manifest: ManifestInput, records: Iterable<SourceRecord>): string {
  const lines = [JSON.stringify({ type: 'manifest', ...manifest })]
  for (const r of records) lines.push(JSON.stringify({ ...r, type: 'record' }))
  return lines.map((l) => `${l}\n`).join('')
}

/** Writes a signed, gzipped bundle (tests/fixtures; the plugin writes real ones). */
export function writeBundle(manifest: ManifestInput, records: Iterable<SourceRecord>, secret: string): Buffer {
  const body = bundleBody(manifest, records)
  const signature = JSON.stringify({ type: 'signature', alg: SIGNATURE_ALG, value: signBundle(secret, body) })
  return gzipSync(Buffer.from(`${body}${signature}\n`, 'utf8'))
}
