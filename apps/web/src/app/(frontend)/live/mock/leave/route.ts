import { NextResponse } from 'next/server'
import { mockLeft, readMockTicket } from '../../../../../lib/liveMock'
import { getRequestOrigin } from '../../../../../lib/origin'
import { getPayloadClient } from '../../../../../lib/payload'

/** Mock classroom "leave" (form POST): reports "left", then back to the course page or the Teaching desk. */
export async function POST(req: Request) {
  const origin = await getRequestOrigin()
  const token = String((await req.formData()).get('t') ?? '')
  const ticket = readMockTicket(origin, token)
  if (!ticket) return new Response('Not found', { status: 404 })
  await mockLeft(ticket)
  if (ticket.role === 'moderator') return NextResponse.redirect(new URL('/staff/teaching', origin), 303)

  const payload = await getPayloadClient()
  const found = await payload.find({ collection: 'live-sessions', where: { providerRoomId: { equals: ticket.providerRoomId } }, limit: 1, depth: 1, overrideAccess: true })
  const session = found.docs[0]
  const course = session && typeof session.course === 'object' ? session.course : null
  return NextResponse.redirect(new URL(course ? `/learn/${encodeURIComponent(course.slug)}?live=left#live` : '/dashboard', origin), 303)
}
