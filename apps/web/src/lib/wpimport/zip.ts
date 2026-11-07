/**
 * Minimal ZIP writer (deflate via node:zlib, no dependency) for serving the WordPress plugin from inside Edvora.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { deflateRawSync } from 'node:zlib'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export type ZipEntry = { name: string; data: Buffer }

export function buildZip(entries: ZipEntry[], date = new Date('2026-01-01T00:00:00Z')): Buffer {
  const dosTime = ((date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2)) & 0xffff
  const dosDate = (((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()) & 0xffff
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const compressed = deflateRawSync(e.data)
    const crc = crc32(e.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // UTF-8 names
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(dosTime, 10)
    local.writeUInt16LE(dosDate, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(e.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, compressed)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(dosTime, 12)
    central.writeUInt16LE(dosDate, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(e.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += 30 + name.length + compressed.length
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}

/** Every file under `dir`, as zip entries prefixed with `prefix/` (sorted, dotfiles skipped). */
export async function zipDirectory(dir: string, prefix: string): Promise<Buffer> {
  const entries: ZipEntry[] = []
  const walk = async (rel: string) => {
    const names = (await readdir(path.join(dir, rel))).filter((n) => !n.startsWith('.')).sort()
    for (const n of names) {
      const r = rel ? `${rel}/${n}` : n
      const full = path.join(dir, r)
      if ((await stat(full)).isDirectory()) await walk(r)
      else entries.push({ name: `${prefix}/${r}`, data: await readFile(full) })
    }
  }
  await walk('')
  return buildZip(entries)
}

/** The plugin source shipped with this build (override with WP_PLUGIN_DIR in container images). */
export function pluginDir(): string {
  const dir = process.env.WP_PLUGIN_DIR?.trim()
  if (dir) return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir)
  return path.resolve(process.cwd(), '../../integrations/wordpress-plugin/edvora-migrator')
}
