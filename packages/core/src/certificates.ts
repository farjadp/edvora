import { toLatinDigits } from './digits'

/**
 * Certificate codes follow the format already used by Iran Brand Academy graduates on LinkedIn:
 *   BA-MBA-181, BA-DBA-081
 * Generalised for every tenant as  <TENANT_PREFIX>-<PROGRAM>-<SERIAL>.
 */
const CODE_RE = /^([A-Z]{2,6})-([A-Z]{2,8})-(\d{3,6})$/

export type CertificateCodeParts = { prefix: string; program: string; serial: number }

export function buildCertificateCode({ prefix, program, serial }: CertificateCodeParts): string {
  const p = prefix.trim().toUpperCase()
  const g = program.trim().toUpperCase()
  if (!/^[A-Z]{2,6}$/.test(p)) throw new Error(`Invalid certificate prefix: ${prefix}`)
  if (!/^[A-Z]{2,8}$/.test(g)) throw new Error(`Invalid program code: ${program}`)
  if (!Number.isInteger(serial) || serial < 1 || serial > 999_999) throw new Error(`Invalid serial: ${serial}`)
  return `${p}-${g}-${String(serial).padStart(3, '0')}`
}

/** Normalises user input (lowercase, Persian digits, spaces, en-dashes) into a canonical code. */
export function normalizeCertificateCode(input: string): string {
  return toLatinDigits(input)
    .trim()
    .toUpperCase()
    .replace(/[‐-―_\s]+/g, '-')
    .replace(/-+/g, '-')
}

export function parseCertificateCode(input: string): CertificateCodeParts | null {
  const m = CODE_RE.exec(normalizeCertificateCode(input))
  if (!m) return null
  return { prefix: m[1]!, program: m[2]!, serial: Number(m[3]) }
}

export type CertificateStatus = 'valid' | 'revoked'
