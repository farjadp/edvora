/**
 * Push-request replay guard and rate limit (FORMAT.md §5, ADR 011 §Token security), persisted in the database so
 * every app instance sees the same nonces. The store logic is generic over a tiny repository so it is unit-tested
 * without Postgres; `payloadNonceRepo` is the real one (unique index on (connection, nonce) makes insert atomic).
 */
import { NONCE_TTL_SECONDS } from '@edvora/integrations/wordpress'
import { randomBytes } from 'node:crypto'
import type { Payload, PayloadRequest } from 'payload'

export const RATE_LIMIT_PER_MINUTE = 60

export type NonceRepo = {
  /** Inserts (connection, nonce); 'duplicate' when that pair already exists and has not expired. */
  insert(connection: number, nonce: string, expiresAt: Date, accepted: boolean): Promise<'ok' | 'duplicate'>
  /** Rows (accepted or refused) recorded for the connection since `since`. */
  countSince(connection: number, since: Date): Promise<number>
  /** Drops rows that expired before `now`. */
  purgeExpired(now: Date): Promise<void>
}

export function nonceStore(repo: NonceRepo, opts: { now?: () => Date; ttlSeconds?: number; limit?: number } = {}) {
  const now = opts.now ?? (() => new Date())
  const ttl = (opts.ttlSeconds ?? NONCE_TTL_SECONDS) * 1000
  const limit = opts.limit ?? RATE_LIMIT_PER_MINUTE
  return {
    /** True when the connection already made `limit` requests (accepted or refused) in the last minute. */
    async rateLimited(connection: number): Promise<boolean> {
      return (await repo.countSince(connection, new Date(now().getTime() - 60_000))) >= limit
    },
    /** `verifyRequest`'s `seenNonce`: records the nonce, true when it was already used (replay). */
    seen(connection: number) {
      return async (_connectionId: string, nonce: string): Promise<boolean> => {
        const t = now()
        if (Math.random() < 0.05) await repo.purgeExpired(t).catch(() => undefined)
        return (await repo.insert(connection, nonce, new Date(t.getTime() + ttl), true)) === 'duplicate'
      }
    },
    /** A refused request still counts towards the rate limit (never consumes a real nonce). */
    async recordRefused(connection: number): Promise<void> {
      const t = now()
      await repo.insert(connection, `refused:${randomBytes(8).toString('hex')}`, new Date(t.getTime() + 120_000), false)
    },
  }
}

export function payloadNonceRepo(payload: Payload, tenant: number, req?: PayloadRequest): NonceRepo {
  return {
    async insert(connection, nonce, expiresAt, accepted) {
      const existing = await payload.find({ collection: 'import-nonces', where: { and: [{ connection: { equals: connection } }, { nonce: { equals: nonce } }] }, limit: 1, depth: 0, overrideAccess: true, req })
      const row = existing.docs[0]
      if (row) {
        if (new Date(row.expiresAt).getTime() > Date.now()) return 'duplicate'
        await payload.delete({ collection: 'import-nonces', id: row.id, overrideAccess: true, req })
      }
      try {
        await payload.create({ collection: 'import-nonces', data: { tenant, connection, nonce, expiresAt: expiresAt.toISOString(), accepted }, overrideAccess: true, req })
        return 'ok'
      } catch (err) {
        // A concurrent request inserted the same pair first: the unique index decides, that is a replay.
        const again = await payload.find({ collection: 'import-nonces', where: { and: [{ connection: { equals: connection } }, { nonce: { equals: nonce } }] }, limit: 1, depth: 0, overrideAccess: true, req })
        if (again.docs[0]) return 'duplicate'
        throw err
      }
    },
    async countSince(connection, since) {
      const res = await payload.count({ collection: 'import-nonces', where: { and: [{ connection: { equals: connection } }, { createdAt: { greater_than: since.toISOString() } }] }, overrideAccess: true, req })
      return res.totalDocs
    },
    async purgeExpired(now) {
      // Nonce rows are short-lived security bookkeeping, not business data: expired ones are removed.
      await payload.delete({ collection: 'import-nonces', where: { expiresAt: { less_than: now.toISOString() } }, overrideAccess: true, req })
    },
  }
}
