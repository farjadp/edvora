import { formatJalali } from '@edvora/core'
import { buttonClass, focusRing } from '@edvora/ui/classes'
import { cx, Guilloche } from '@edvora/ui'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CertificateSeal } from '../../../../../components/panel/CertificateSeal'
import { CopyCode } from '../../../../../components/panel/CopyCode'
import { FocusHeading } from '../../../../../components/learn/FocusHeading'
import { getStudentDashboardGamification } from '../../../../../lib/gamificationQueries'
import { docOf, idOf } from '../../../../../lib/ids'
import { getPayloadClient } from '../../../../../lib/payload'
import { requireUser } from '../../../../../lib/session'
import { getCurrentTenant } from '../../../../../lib/tenant'
import type { Cohort, Course, Media } from '../../../../../payload-types'

export const metadata: Metadata = { title: 'گواهی شما', robots: { index: false } }

type Props = { params: Promise<{ id: string }> }

/**
 * Certificate finale (UX §3.1): its own page, the only full-page celebration. Own certificate only (tenant + owner).
 * The seal plays one sheen on the first visit and is quiet afterwards. No sound, no confetti, no "Ministry" wording.
 */
export default async function CertificatePage({ params }: Props) {
  const { id: raw } = await params
  const id = Number(raw)
  if (!Number.isInteger(id)) notFound()
  const user = await requireUser(`/dashboard/certificates/${id}`)
  const tenant = await getCurrentTenant()
  const payload = await getPayloadClient()
  const cert = await payload.findByID({ collection: 'certificates', id, depth: 1, overrideAccess: true, disableErrors: true })
  if (!cert || idOf(cert.tenant) !== tenant.id || idOf(cert.user) !== user.id) notFound()
  const course = docOf<Course>(cert.course)
  const cohort = docOf<Cohort>(cert.cohort)
  const code = cert.code ?? ''

  if (cert.status === 'revoked') {
    return (
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-12 md:px-8">
        <h1 className="font-display text-3xl font-black">این گواهی باطل شده است.</h1>
        <p className="mt-3 leading-8 text-muted">برای اطلاع از دلیل آن با آکادمی تماس بگیرید.</p>
        <Link href="/dashboard" className="mt-6 inline-flex min-h-11 items-center font-bold text-brand-text underline-offset-4 hover:underline">
          بازگشت به پنل
        </Link>
      </div>
    )
  }

  const gam = await getStudentDashboardGamification().catch(() => null)
  const view = gam?.enabled ? gam.enrollments.find((e) => e.course.id === course?.id)?.view : null
  const graduate = Boolean(view?.flags.badges && view.badges?.some((b) => b.key === 'graduate'))
  const pioneer = Boolean(view?.flags.levels && gam?.total?.level.level === 6)
  const pdf = docOf<Media>(cert.pdf)
  const primary = buttonClass({ className: 'inline-flex items-center justify-center gap-2 px-6' })
  const secondary = cx('inline-flex min-h-12 items-center justify-center rounded-xl border border-line-strong px-5 font-medium hover:bg-sunken', focusRing)

  return (
    <div data-testid="certificate-finale" className="mx-auto max-w-3xl px-4 pb-16 pt-8 md:px-8 md:pt-12">
      <FocusHeading className="font-display text-4xl font-black leading-tight outline-none md:text-5xl">تبریک، {user.name || 'دانشجو'}</FocusHeading>
      <p className="mt-3 text-lg leading-8">
        دورهٔ «{course?.title}» را به پایان رساندید.
      </p>

      <figure
        aria-label="پیش‌نمایش گواهی"
        data-testid="certificate-preview"
        className="relative mt-8 overflow-hidden rounded-md border border-line-strong bg-surface p-6 md:aspect-[1.414/1] md:p-10"
      >
        <Guilloche className="-start-24 -bottom-32 size-96 opacity-[.14]" />
        <div className="relative flex h-full flex-col justify-between gap-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-muted">{tenant.name}</p>
              <p className="mt-1 font-display text-xl font-black">گواهی پایان دوره</p>
            </div>
            <CertificateSeal certificateId={cert.id} className="size-20 md:size-28" />
          </div>
          <div>
            <p className="text-sm text-muted">این گواهی به</p>
            <p data-testid="certificate-holder" className="mt-1 font-display text-3xl font-black leading-tight md:text-5xl">
              {cert.holderName}
            </p>
            <p className="mt-3 leading-8">
              برای پایان دورهٔ <span className="font-bold">{course?.title}</span>
              {cohort ? ` (${cohort.title})` : ''} اعطا شد.
            </p>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 text-sm">
            <p>
              <span className="text-muted">تاریخ صدور: </span>
              {formatJalali(cert.issuedAt)}
            </p>
            <p dir="ltr" className="font-latin text-muted">
              {code}
            </p>
          </div>
        </div>
      </figure>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div>
          <p className="text-sm text-muted">کد استعلام</p>
          <p data-testid="certificate-code" dir="ltr" className="select-all text-end font-latin text-xl font-bold">
            {code}
          </p>
        </div>
        <CopyCode code={code} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {pdf?.url ? (
          <a href={pdf.url} download className={primary}>
            دانلود گواهی (PDF)
          </a>
        ) : (
          <Link href={`/verify?code=${encodeURIComponent(code)}`} className={primary}>
            صفحهٔ استعلام گواهی
          </Link>
        )}
        {pdf?.url ? (
          <Link href={`/verify?code=${encodeURIComponent(code)}`} className={secondary}>
            صفحهٔ استعلام
          </Link>
        ) : (
          <Link href="/dashboard" className={secondary}>
            بازگشت به پنل
          </Link>
        )}
      </div>
      {!pdf?.url ? <p className="mt-3 text-sm leading-7 text-muted">فایل PDF این گواهی هنوز بارگذاری نشده است؛ آکادمی آن را به‌زودی اضافه می‌کند.</p> : null}

      {graduate || pioneer ? (
        <p data-testid="certificate-extras" className="mt-8 border-t border-line pt-4 text-sm font-bold text-milestone">
          {[graduate ? 'نشان «فارغ‌التحصیل»' : null, pioneer ? 'سطح «پیشگام»' : null].filter(Boolean).join(' · ')}
        </p>
      ) : null}
    </div>
  )
}
