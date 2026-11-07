/**
 * Private storage for raw WordPress data (ADR 009 pattern, ADR 011 §PII): bundles, pushed chunks and plan files live
 * under `IMPORT_BUNDLES_DIR` (default: next to the submission files, `private-uploads/import-bundles`), outside any
 * public or static path, with random names. Only server code reads them; they are purged 30 days after the job.
 */
import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { privateUploadsDir } from '../privateUploads'

export function importBundlesDir(): string {
  const dir = process.env.IMPORT_BUNDLES_DIR?.trim()
  if (dir) return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir)
  return path.join(path.dirname(privateUploadsDir()), 'import-bundles')
}

const NAME = /^[a-f0-9]{32}(\/[a-z0-9._-]{1,120})?$/

/** Absolute path of a stored name; refuses anything that is not one of our random names (no traversal). */
export function resolveStored(name: string): string {
  if (!NAME.test(name) || name.includes('..')) throw new Error('Invalid stored import file name')
  return path.join(importBundlesDir(), name)
}

export const newStoredName = (): string => randomBytes(16).toString('hex')

export async function writeStored(name: string, data: Uint8Array | string): Promise<void> {
  const file = resolveStored(name)
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  await writeFile(file, data, { mode: 0o600 })
}

export const readStored = (name: string): Promise<Buffer> => readFile(resolveStored(name))
export const streamStored = (name: string) => () => createReadStream(resolveStored(name))

export async function storedExists(name: string): Promise<boolean> {
  try {
    await stat(resolveStored(name))
    return true
  } catch {
    return false
  }
}

/** Removes a stored file or a job's chunk directory. Missing files are fine. */
export async function removeStored(name: string | null | undefined): Promise<void> {
  if (!name) return
  await rm(resolveStored(name), { recursive: true, force: true })
}

/** File name of a pushed chunk inside a job's chunk directory. */
export function chunkName(dir: string, kind: string, seq: number): string {
  return `${dir}/${kind.replace(/[^a-z0-9_.]/g, '_')}.${seq}.ndjson`
}

/** Chunks stored for a push job, derived from the directory listing (no shared index to race on). */
export async function listChunks(dir: string): Promise<{ kind: string; seq: number; file: string }[]> {
  let names: string[] = []
  try {
    names = await readdir(resolveStored(dir))
  } catch {
    return []
  }
  return names
    .map((n) => /^([a-z0-9_.]+)\.(\d+)\.ndjson$/.exec(n))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ kind: m[1]!, seq: Number(m[2]), file: `${dir}/${m[0]}` }))
    .sort((a, b) => (a.kind === b.kind ? a.seq - b.seq : a.kind < b.kind ? -1 : 1))
}
