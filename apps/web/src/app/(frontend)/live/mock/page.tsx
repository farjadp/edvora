import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { buttonClass } from '@edvora/ui/classes'
import { mockJoined, readMockTicket } from '../../../../lib/liveMock'
import { getRequestOrigin } from '../../../../lib/origin'

export const metadata: Metadata = { title: 'کلاس آزمایشی', robots: { index: false } }

type Props = { searchParams: Promise<{ t?: string }> }

/**
 * Stand-in classroom for LIVE_CLASS_PROVIDER=mock (dev, CI, demo). In production this is the BigBlueButton room.
 * Opening it reports "joined" the way the provider's webhook would; "leave" reports "left".
 */
export default async function MockClassroomPage({ searchParams }: Props) {
  const token = (await searchParams).t
  const origin = await getRequestOrigin()
  const ticket = readMockTicket(origin, token)
  if (!ticket || !token) notFound()
  await mockJoined(ticket, token)
  const host = ticket.role === 'moderator'

  return (
    <div className="mx-auto grid max-w-2xl gap-6 px-4 py-12">
      <p className="text-sm text-muted">کلاس آزمایشی · بدون سرور کلاس</p>
      <h1 className="text-2xl font-black">شما وارد کلاس شدید</h1>
      <div className="grid gap-2 rounded-2xl border border-line bg-surface p-6 leading-8">
        <p>
          نام: <strong>{ticket.displayName}</strong>
        </p>
        <p>نقش: {host ? 'مدرس (مدیر کلاس)' : 'دانشجو'}</p>
        <p className="text-sm text-muted">
          در نسخهٔ واقعی این صفحه کلاس BigBlueButton است، با تصویر، صدا، اسلاید و وایت‌بورد. ورود شما مانند همان سرویس ثبت شد.
        </p>
      </div>
      <form method="post" action="/live/mock/leave">
        <input type="hidden" name="t" value={token} />
        <button type="submit" className={buttonClass({ block: true })}>
          خروج از کلاس
        </button>
      </form>
    </div>
  )
}
