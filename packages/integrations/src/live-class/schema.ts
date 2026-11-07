import { z } from 'zod'
import type { LiveEvent } from './types'

/** Zod schemas for the normalised contract. Real adapters validate their mapped output with these too. */

const iso = z.iso.datetime({ offset: true })
export const LiveRoleSchema = z.enum(['moderator', 'attendee'])

const base = {
  eventId: z.string().min(1),
  occurredAt: iso,
  providerRoomId: z.string().min(1),
  externalRoomId: z.string().min(1).optional(),
}

export const LiveEventSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.enum(['room.started', 'room.ended']) }),
  z.object({
    ...base,
    type: z.enum(['participant.joined', 'participant.left']),
    externalUserId: z.string().min(1),
    role: LiveRoleSchema.optional(),
  }),
  z.object({ ...base, type: z.literal('recording.ready'), providerRecordingId: z.string().min(1) }),
  z.object({
    ...base,
    type: z.literal('attendance.summary'),
    attendees: z.array(
      z.object({
        externalUserId: z.string().min(1),
        role: LiveRoleSchema.optional(),
        joinedAt: iso,
        leftAt: iso.optional(),
        durationSec: z.number().int().nonnegative(),
      }),
    ),
  }),
]) satisfies z.ZodType<LiveEvent>

export const MockTicketSchema = z.object({
  r: z.string().min(1),
  u: z.string().min(1),
  role: LiveRoleSchema,
  n: z.string(),
  exp: iso,
})
