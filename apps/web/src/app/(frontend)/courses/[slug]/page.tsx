import { buildInstalmentPlan, formatJalali, formatToman, rial, toPersianDigits } from '@edvora/core'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { CourseArt } from '../../../../components/CourseCard'
import { EnrollCard } from '../../../../components/EnrollCard'
import { LeadForm } from '../../../../components/LeadForm'
import { getCourseBySlug, getLessons, getOpenCohorts } from '../../../../lib/queries'
import { findRedirect } from '../../../../lib/redirects'
import { getCurrentTenant } from '../../../../lib/tenant'
import { hasRichText, lexicalToPlainText } from '@edvora/core/richtext'
import { RichText } from '../../../../components/RichText'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await getCurrentTenant()
  const course = await getCourseBySlug(tenant.id, decodeURIComponent((await params).slug))
  return course ? { title: course.title, description: course.summary ?? course.subtitle ?? undefined } : {}
}

export default async function CoursePage({ params }: Props) {
  const slug = decodeURIComponent((await params).slug)
  const tenant = await getCurrentTenant()
  const course = await getCourseBySlug(tenant.id, slug)
  if (!course) {
    // E-032: a WordPress course URL that shares the /courses/ base (Tutor) but whose slug changed on import.
    const to = await findRedirect(tenant.id, `/courses/${slug}`)
    if (to) permanentRedirect(to)
    notFound()
  }

  const [cohorts, lessons] = await Promise.all([getOpenCohorts(tenant.id), getLessons(course.id)])
  const cohort = cohorts.get(course.id)
  const price = rial(cohort?.priceOverride ?? course.price)
  const maxInstalments = Math.max(1, course.maxInstalments ?? 1)

  const instalmentPreview: Record<number, string> = {}
  for (let n = 2; n <= maxInstalments; n++) {
    const plan = buildInstalmentPlan({ total: price, count: n, downPaymentPercent: 40, firstDueDate: new Date() })
    instalmentPreview[n] = `پیش‌پرداخت ${formatToman(plan[0]!.amount)}، سپس ${toPersianDigits(n - 1)} قسط ماهانه ${formatToman(plan[1]!.amount)}`
  }

  const seatsLeft = cohort?.seats ? Math.max(0, cohort.seats - (cohort.seatsTaken ?? 0)) : null
  const previews = lessons.filter((l) => l.isFreePreview)

  // Structured data for Persian SEO.
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: course.title,
      description: course.summary ?? course.subtitle ?? '',
      provider: { '@type': 'Organization', name: tenant.name },
    },
    ...(course.faq?.length
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: course.faq.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: lexicalToPlainText(f.answer) } })),
          },
        ]
      : []),
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 md:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="text-sm text-muted">
        <Link href="/" className="hover:text-ink">خانه</Link> / <span>{course.title}</span>
      </nav>

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <article>
          <div className="aspect-video overflow-hidden rounded-3xl border border-line">
            <CourseArt course={course} size="hero" />
          </div>
          <h1 className="mt-8 text-3xl font-black md:text-5xl">{course.title}</h1>
          {course.subtitle ? <p className="mt-3 text-lg leading-8 text-muted">{course.subtitle}</p> : null}

          <nav className="sticky top-16 z-10 -mx-4 mt-8 flex gap-6 overflow-x-auto border-b border-line bg-bg px-4 py-3 text-sm font-bold">
            <a href="#about" className="hover:text-brand">درباره دوره</a>
            {course.syllabus?.length ? <a href="#syllabus" className="hover:text-brand">سرفصل‌ها</a> : null}
            {course.faculty?.length ? <a href="#faculty" className="hover:text-brand">اساتید</a> : null}
            {course.faq?.length ? <a href="#faq" className="hover:text-brand">پرسش‌ها</a> : null}
          </nav>

          <section id="about" className="scroll-mt-32 pt-8">
            {course.summary ? <p className="whitespace-pre-line text-lg leading-9">{course.summary}</p> : null}
            {course.audience?.length ? (
              <>
                <h2 className="mt-10 text-xl font-black">این دوره برای کیست؟</h2>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                  {course.audience.map((a) => (
                    <div key={a.id ?? a.title} className="rounded-2xl border border-line bg-surface p-5">
                      <h3 className="font-bold">{a.title}</h3>
                      {a.text ? <p className="mt-2 text-sm leading-7 text-muted">{a.text}</p> : null}
                    </div>
                  ))}
                </div>
              </>
            ) : null}
            {course.outcomes?.length ? (
              <>
                <h2 className="mt-10 text-xl font-black">در پایان دوره چه دارید؟</h2>
                <ul className="mt-4 grid gap-3">
                  {course.outcomes.map((o) => (
                    <li key={o.id ?? o.text} className="flex gap-3 leading-7">
                      <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-hidden />
                      {o.text}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {previews.length ? (
              <div className="mt-10 rounded-2xl border border-line bg-surface p-5">
                <p className="font-bold">جلسه رایگان</p>
                {previews.map((l) => (
                  <Link key={l.id} href={`/learn/${course.slug}/${l.id}`} className="mt-2 block text-brand hover:underline">
                    ▶ {l.title}
                  </Link>
                ))}
              </div>
            ) : null}
          </section>

          {course.syllabus?.length ? (
            <section id="syllabus" className="scroll-mt-32 pt-14">
              <h2 className="text-xl font-black">سرفصل‌ها</h2>
              <ol className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
                {course.syllabus.map((s, i) => (
                  <li key={s.id ?? s.title} className="flex gap-4 p-5">
                    <span className="font-latin text-2xl font-bold text-brand">{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <p className="font-bold">{s.title}</p>
                      {hasRichText(s.description) ? <RichText data={s.description} tenantId={tenant.id} className="mt-1 text-sm leading-7 text-muted" /> : null}
                    </div>
                    {s.hours ? <span className="ms-auto shrink-0 text-sm text-muted">{toPersianDigits(s.hours)} ساعت</span> : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {course.faculty?.length ? (
            <section id="faculty" className="scroll-mt-32 pt-14">
              <h2 className="text-xl font-black">اساتید</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {course.faculty.map((f) => (
                  <div key={f.id ?? f.name} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-5">
                    <span className="grid size-14 shrink-0 place-items-center rounded-full bg-sunken text-xl font-black text-brand">{f.name.slice(0, 1)}</span>
                    <div>
                      <p className="font-bold">{f.name}</p>
                      {f.role ? <p className="text-sm text-muted">{f.role}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {course.faq?.length ? (
            <section id="faq" className="scroll-mt-32 pt-14">
              <h2 className="text-xl font-black">پرسش‌های متداول</h2>
              <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
                {course.faq.map((f) => (
                  <details key={f.id ?? f.question} className="group p-5">
                    <summary className="cursor-pointer list-none font-bold marker:hidden">
                      <span className="me-2 inline-block text-brand transition-transform group-open:rotate-45">+</span>
                      {f.question}
                    </summary>
                    <RichText data={f.answer} tenantId={tenant.id} className="mt-3 leading-8 text-muted" />
                  </details>
                ))}
              </div>
            </section>
          ) : null}
        </article>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <EnrollCard
            // No online checkout without a published price: the lead form takes over.
            cohortId={price > 0 && cohort && ['open', 'preregistration'].includes(cohort.status ?? '') ? cohort.id : null}
            back={`/courses/${course.slug}`}
            priceLabel={price > 0 ? formatToman(price) : 'تماس بگیرید'}
            startLabel={cohort ? formatJalali(cohort.startDate) : undefined}
            schedule={cohort?.schedule}
            seatsLeftLabel={seatsLeft == null ? null : `${toPersianDigits(seatsLeft)} نفر`}
            maxInstalments={maxInstalments}
            instalmentPreview={instalmentPreview}
            statusLabel={cohort ? `${cohort.title} · ${cohort.status === 'preregistration' ? 'پیش‌ثبت‌نام' : 'ثبت‌نام باز'}` : 'به‌زودی'}
          />
          <div className="mt-4 rounded-3xl border border-line bg-surface p-6">
            <p className="font-bold">سؤال دارید؟</p>
            <p className="mb-4 mt-1 text-sm text-muted">مشاور آموزشی با شما تماس می‌گیرد.</p>
            <LeadForm courseId={course.id} page={`/courses/${course.slug}`} compact />
          </div>
        </aside>
      </div>
    </div>
  )
}
