import { formatJalali, formatToman, rial } from '@edvora/core'
import { CoverArt } from '@edvora/ui'
import Link from 'next/link'
import type { Cohort, Course, Media } from '../payload-types'

const KIND_LABEL: Record<Course['kind'], string> = {
  program: 'دوره بلندمدت',
  short: 'دوره کوتاه',
  video: 'ویدیویی',
  bundle: 'بسته',
}

/** Maps a Course record onto the shared CoverArt (picks the right image size). */
export function CourseArt({ course, size = 'card' }: { course: Course; size?: 'card' | 'hero' }) {
  const img = typeof course.heroImage === 'object' ? (course.heroImage as Media | null) : null
  const src = img?.sizes?.[size]?.url ?? img?.url
  return <CoverArt title={course.title} mark={course.programCode} imageSrc={src} imageAlt={img?.alt} size={size} />
}

export function CourseCard({ course, cohort }: { course: Course; cohort?: Cohort }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group block w-72 shrink-0 snap-start overflow-hidden rounded-2xl border border-line bg-surface motion-safe:transition-transform motion-safe:hover:-translate-y-1 md:w-80"
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
