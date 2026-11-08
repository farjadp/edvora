import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'
import { getAccess, isSystemWrite } from '../access/permissions'
import { isSuperAdmin } from '../access/roles'
import { idOf } from '../lib/ids'

/** Never written to the audit log. */
const SKIP = new Set(['updatedAt', 'createdAt', 'hash', 'salt', 'sessions', 'loginAttempts', 'lockUntil', 'resetPasswordToken', 'resetPasswordExpiration', 'twoFactor', '_verified', '_verificationToken'])
/** Logged as "changed" without the value. */
const REDACT = new Set(['password', 'zarinpalMerchantId', 'nationalCode', 'apiKeySealed'])
const MAX_VALUE = 2000

function normalise(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normalise)
  if (v && typeof v === 'object') {
    if ('id' in v && 'createdAt' in v && 'updatedAt' in v) return (v as { id: unknown }).id // populated relationship
    return Object.fromEntries(Object.entries(v).filter(([k]) => !SKIP.has(k)).map(([k, x]) => [k, normalise(x)]))
  }
  return v
}

function cap(v: unknown): unknown {
  const s = JSON.stringify(v ?? null)
  return s.length > MAX_VALUE ? `[${s.length} chars]` : v
}

export type Changes = Record<string, { from: unknown; to: unknown }>

export function diff(before: Record<string, unknown> | undefined, after: Record<string, unknown>): Changes {
  const out: Changes = {}
  for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after)])) {
    if (SKIP.has(key) || key === 'id') continue
    const a = normalise(before?.[key])
    const b = normalise(after[key])
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue
    out[key] = REDACT.has(key) ? { from: '[redacted]', to: '[redacted]' } : { from: cap(a), to: cap(b) }
  }
  return out
}

function ipOf(req: PayloadRequest): string | null {
  const fwd = req.headers?.get('x-forwarded-for')
  return fwd?.split(',')[0]?.trim() || req.headers?.get('x-real-ip') || null
}

/**
 * Appends one row per academy. Uses the request's transaction: if the audit row cannot be written, the change
 * itself rolls back (staff actions must be accountable).
 */
export async function writeAudit(
  req: PayloadRequest,
  entry: { tenants: number[]; action: string; collection: string; docId: string | number; changes?: Changes; note?: string },
): Promise<void> {
  if (!req.user) return
  for (const tenant of entry.tenants) {
    await req.payload.create({
      collection: 'audit-logs',
      overrideAccess: true,
      req,
      data: {
        tenant,
        actor: req.user.id,
        actorEmail: req.user.email ?? null,
        action: entry.action,
        targetCollection: entry.collection,
        docId: String(entry.docId),
        changes: entry.changes ?? {},
        note: entry.note ?? null,
        ip: ipOf(req),
      },
    })
  }
}

/** Academies a user record is visible in, limited to the actor's own academies (super-admin: all of them). */
async function userTenants(req: PayloadRequest, doc: Record<string, unknown>): Promise<number[]> {
  const target = Array.isArray(doc.tenants) ? doc.tenants.map((t) => idOf((t as { tenant?: unknown }).tenant)).filter((x): x is number => x !== null) : []
  const ctx = await getAccess(req)
  if (ctx?.isPlatformAdmin || isSuperAdmin(req.user)) return target
  const mine = new Set((req.user?.tenants ?? []).map((t) => idOf(t.tenant)))
  return target.filter((t) => mine.has(t))
}

/** afterChange hook: logs every staff create/update with before/after. */
export const auditChange =
  (collection: string): CollectionAfterChangeHook =>
  async ({ doc, previousDoc, operation, req }) => {
    if (!req.user || isSystemWrite(req)) return doc
    const record = doc as Record<string, unknown>
    const changes = diff(operation === 'create' ? undefined : (previousDoc as Record<string, unknown>), record)
    if (operation === 'update' && Object.keys(changes).length === 0) return doc
    const tenants =
      collection === 'users' ? await userTenants(req, record) : collection === 'tenants' ? [Number(record.id)] : [idOf(record.tenant)].filter((x): x is number => x !== null)
    await writeAudit(req, { tenants, action: `${collection}.${operation}`, collection, docId: record.id as number, changes })
    return doc
  }
