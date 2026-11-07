import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import type { LiveRole, MockLiveClassProvider } from '@edvora/integrations/live-class'
import { env } from '../env'
import { ingestEvents } from './live'
import { getLiveClass } from './providers'

/**
 * The mock classroom (LIVE_CLASS_PROVIDER=mock, dev and demo only). It stands in for BigBlueButton: reading a ticket
 * and reporting joined/left exactly as the real provider's webhooks would, through the same `ingestEvents`.
 */
export type MockTicket = { providerRoomId: string; externalUserId: string; role: LiveRole; displayName: string }

function mockProvider(origin: string): MockLiveClassProvider | null {
  if (env().LIVE_CLASS_PROVIDER !== 'mock') return null
  const p = getLiveClass(origin)
  return 'readTicket' in p ? (p as MockLiveClassProvider) : null
}

export function readMockTicket(origin: string, token: string | undefined): MockTicket | null {
  if (!token) return null
  return mockProvider(origin)?.readTicket(token) ?? null
}

/** Joined: deduped per ticket, so reloading the page doesn't count twice. */
export async function mockJoined(ticket: MockTicket, token: string) {
  const eventId = `join:${createHash('sha256').update(token).digest('hex').slice(0, 32)}`
  await ingestEvents('mock', [{ type: 'participant.joined', eventId, occurredAt: new Date().toISOString(), providerRoomId: ticket.providerRoomId, externalUserId: ticket.externalUserId, role: ticket.role }])
}

export async function mockLeft(ticket: MockTicket) {
  await ingestEvents('mock', [
    { type: 'participant.left', eventId: `left:${randomUUID()}`, occurredAt: new Date().toISOString(), providerRoomId: ticket.providerRoomId, externalUserId: ticket.externalUserId, role: ticket.role },
  ])
}
