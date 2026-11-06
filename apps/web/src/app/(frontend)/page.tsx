import { formatJalali, toPersianDigits } from '@edvora/core'
import Link from 'next/link'
import { Row } from '@edvora/ui'
import { inputClass } from '@edvora/ui/classes'
import { CourseArt, CourseCard } from '../../components/CourseCard'
import { LeadForm } from '../../components/LeadForm'
import { getOpenCohorts, getPosts, getPublishedCourses, getTestimonials } from '../../lib/queries'
import { getCurrentTenant } from '../../lib/tenant'

export default async function HomePage() {
  const tenant = await getCurrentTenant()
  const [courses, cohorts, testimonials, posts] = await Promise.all([
    getPublishedCourses(tenant.id),
    getOpenCohorts(tenant.id),
    getTestimonials(tenant.id),
    getPosts(tenant.id),
  ])

  const featured = courses.find((c) => c.featured) ?? courses[0]
  const featuredCohort = featured ? cohorts.get(featured.id) : undefined
  const programs = courses.filter((c) => c.kind === 'program')
  const short = courses.filter((c) => c.kind === 'short' || c.kind === 'video')
  const bundles = courses.filter((c) => c.kind === 'bundle')
  const logos = tenant.clientLogos ?? []

  return (
    <>
      {/* 1 · Featured program */}
      {featured ? (
        <section className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 pt-8 md:grid-cols-[1.1fr_1fr] md:items-center md:px-8 md:pt-14">
          <div className="order-2 md:order-1">
            <p className="text-sm font-bold text-brand">
              {featuredCohort?.status === 'preregistration' ? 'پیش‌ثبت‌نام باز است' : featuredCohort ? 'ثبت‌نام باز است' : 'دوره شاخص'}
            </p>
            <h1 className="mt-3 text-4xl font-black leading-tight md:text-6xl">{featured.title}</h1>
            {featured.subtitle ? <p className="mt-4 max-w-xl text-lg leading-8 text-muted">{featured.subtitle}</p> : null}
            {featuredCohort ? (
              <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted">شروع</dt>
                  <dd className="font-bold">{formatJalali(featuredCohort.startDate)}</dd>
                </div>
                {featuredCohort.schedule ? (
                  <div>
                    <dt className="text-muted">زمان</dt>
                    <dd className="font-bold">{featuredCohort.schedule}</dd>
                  </div>
                ) : null}
                {featured.durationLabel ? (
                  <div>
                    <dt className="text-muted">مدت</dt>
                    <dd className="font-bold">{featured.durationLabel}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/courses/${featured.slug}`} className="rounded-xl bg-brand px-6 py-3 font-bold text-brand-ink hover:opacity-90">
                مشاهده دوره و ثبت‌نام
              </Link>
              <Link href="#consult" className="rounded-xl border border-line px-6 py-3 font-bold hover:bg-sunken">
                مشاوره رایگان
              </Link>
            </div>
          </div>
          <Link href={`/courses/${featured.slug}`} className="order-1 block aspect-video overflow-hidden rounded-3xl border border-line md:order-2">
            <CourseArt course={featured} size="hero" />
          </Link>
        </section>
      ) : null}

      {/* 2 · Proof comes second: client logos */}
      {logos.length > 0 ? (
        <section className="mt-14 border-y border-line bg-surface py-6" aria-label="برندهای همراه">
          <p className="mb-4 text-center text-sm text-muted">مدیران این برندها در کلاس‌های ما بوده‌اند</p>
          <div className="overflow-hidden">
            <div className="animate-marquee flex w-max gap-10 whitespace-nowrap px-4">
              {[...logos, ...logos].map((l, i) => (
                <span key={`${l.id ?? l.name}-${i}`} className="text-lg font-bold text-muted">
                  {l.name}
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {tenant.stats?.length ? (
        <section className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 pt-10 md:grid-cols-4 md:px-8">
          {tenant.stats.map((s) => (
            <div key={s.id ?? s.label} className="rounded-2xl border border-line bg-surface p-5">
              <p className="text-3xl font-black text-brand">{toPersianDigits(s.value)}</p>
              <p className="mt-1 text-sm text-muted">{s.label}</p>
            </div>
          ))}
        </section>
      ) : null}

      {/* 3 · Library rows */}
      {programs.length > 0 ? (
        <Row id="programs" title="دوره‌های بلندمدت">
          {programs.map((c) => (
            <CourseCard key={c.id} course={c} cohort={cohorts.get(c.id)} />
          ))}
        </Row>
      ) : null}
      {short.length > 0 ? (
        <Row title="دوره‌های کوتاه و ویدیویی">
          {short.map((c) => (
            <CourseCard key={c.id} course={c} cohort={cohorts.get(c.id)} />
          ))}
        </Row>
      ) : null}
      {bundles.length > 0 ? (
        <Row title="بسته‌های دانش‌آموختگی">
          {bundles.map((c) => (
            <CourseCard key={c.id} course={c} cohort={cohorts.get(c.id)} />
          ))}
        </Row>
      ) : null}

      {testimonials.length > 0 ? (
        <Row title="روایت دانش‌آموختگان">
          {testimonials.map((t) => (
            <figure key={t.id} className="w-72 shrink-0 snap-start rounded-2xl border border-line bg-surface p-6 md:w-80">
              {t.quote ? <blockquote className="leading-8">«{t.quote}»</blockquote> : null}
              <figcaption className="mt-4">
                <p className="font-bold">{t.name}</p>
                {t.role ? <p className="text-sm text-muted">{t.role}</p> : null}
              </figcaption>
              {t.videoUrl ? (
                <a href={t.videoUrl} className="mt-4 inline-block text-sm font-bold text-brand">
                  ▶ تماشای ویدیو
                </a>
              ) : null}
            </figure>
          ))}
        </Row>
      ) : null}

      {/* 4 · Services */}
      {tenant.services?.length ? (
        <section id="services" className="mx-auto max-w-7xl px-4 pt-16 md:px-8">
          <h2 className="mb-5 text-xl font-black md:text-2xl">خدمات</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {tenant.services.map((s) => (
              <div key={s.id ?? s.title} className="rounded-2xl border border-line bg-surface p-6">
                <h3 className="text-lg font-bold">{s.title}</h3>
                {s.text ? <p className="mt-2 text-sm leading-7 text-muted">{s.text}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* 5 · Manifesto */}
      {tenant.manifesto ? (
        <section className="mx-auto max-w-4xl px-4 pt-20 text-center md:px-8">
          <p className="whitespace-pre-line text-2xl font-bold leading-[1.9] md:text-3xl">{tenant.manifesto}</p>
        </section>
      ) : null}

      {posts.length > 0 ? (
        <Row id="journal" title="مجله">
          {posts.map((p) => (
            <article key={p.id} className="w-72 shrink-0 snap-start rounded-2xl border border-line bg-surface p-6">
              <h3 className="font-bold leading-7">{p.title}</h3>
              {p.excerpt ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{p.excerpt}</p> : null}
              {p.author ? <p className="mt-4 text-xs text-muted">{p.author}</p> : null}
            </article>
          ))}
        </Row>
      ) : null}

      {/* 6 · Trust + lead capture */}
      <section className="mx-auto mt-20 grid max-w-7xl grid-cols-1 gap-6 px-4 md:grid-cols-2 md:px-8">
        <div className="rounded-3xl border border-line bg-surface p-8">
          <h2 className="text-2xl font-black">گواهی را استعلام کنید</h2>
          <p className="mt-3 leading-8 text-muted">
            هر گواهی ما یک کد یکتا دارد. کد را وارد کنید تا نام دارنده، دوره و پروژه نهایی را ببینید.
          </p>
          <form action="/verify" className="mt-6 flex gap-2">
            <input
              name="code"
              dir="ltr"
              placeholder={`${tenant.certificatePrefix}-MBA-181`}
              className={inputClass({ tone: 'bg', className: 'min-w-0 flex-1 font-latin' })}
            />
            <button className="h-12 rounded-xl bg-ink px-5 font-bold text-bg">استعلام</button>
          </form>
        </div>
        <div id="consult" className="rounded-3xl bg-brand p-8 text-brand-ink">
          <h2 className="text-2xl font-black">نمی‌دانید کدام دوره؟</h2>
          <p className="mt-3 leading-8 opacity-90">شماره‌تان را بگذارید. مشاور آموزشی تماس می‌گیرد و مسیر مناسب را پیشنهاد می‌دهد.</p>
          <div className="mt-6 text-ink">
            <LeadForm page="/" compact />
          </div>
        </div>
      </section>
    </>
  )
}
