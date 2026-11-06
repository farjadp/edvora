import { formatJalali, formatToman, rial } from '@edvora/core'
import Link from 'next/link'
import type { Cohort, Course, Media } from '../payload-types'

const KIND_LABEL: Record<Course['kind'], string> = {
  program: 'دوره بلندمدت',
  short: 'دوره کوتاه',
  video: 'ویدیویی',
  bundle: 'بسته',
}

export function CourseArt({ course, size = 'card' }: { course: Course; size?: 'card' | 'hero' }) {
  const img = typeof course.heroImage === 'object' ? (course.heroImage as Media | null) : null
  const src = img?.sizes?.[size]?.url ?? img?.url
  if (src) return <img src={src} alt={img?.alt ?? course.title} className="size-full object-cover" />
  return (
    <div className="relative grid size-full place-items-center overflow-hidden bg-brand p-6 text-brand-ink">
      <span className="absolute -start-6 -top-10 font-latin text-[9rem] font-bold leading-none opacity-15" aria-hidden>
        {course.programCode ?? course.title.slice(0, 2)}
      </span>
      <span className="absolute inset-x-0 bottom-0 h-1.5 bg-accent" aria-hidden />
      <span className={size === 'hero' ? 'relative text-4xl font-black md:text-6xl' : 'relative text-2xl font-black'}>{course.title}</span>
    </div>
  )
}

export function CourseCard({ course, cohort }: { course: Course; cohort?: Cohort }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group block w-72 shrink-0 snap-start overflow-hidden rounded-2xl border border-line bg-surface transition-transform hover:-translate-y-1 md:w-80"
    >
      <div className="aspect-video overflow-hidden">
        <CourseArt course={course} />
      </div>
      <div className="p-5">
        <p className="text-xs font-medium text-muted">
          {KIND_LABEL[course.kind]}
          {course.durationLabel ? ` · ${course.durationLabel}` : ''}
        </p>
        <h3 className="mt-1 text-lg font-bold group-hover:text-brand">{course.title}</h3>
        {course.subtitle ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">{course.subtitle}</p> : null}
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="font-bold">{course.price > 0 ? formatToman(rial(course.price)) : 'تماس بگیرید'}</span>
          {cohort ? <span className="text-muted">شروع {formatJalali(cohort.startDate, 'd MMMM')}</span> : null}
        </div>
      </div>
    </Link>
  )
}

export function Row({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-7xl px-4 pt-14 md:px-8">
      <h2 className="mb-5 text-xl font-black md:text-2xl">{title}</h2>
      <div className="scrollbar-none -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">{children}</div>
    </section>
  )
}
