import { toPersianDigits } from '@edvora/core'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { markLessonComplete } from '../../../actions'
import { docOf, idOf } from '../../../../../lib/ids'
import { getPayloadClient } from '../../../../../lib/payload'
import { getCourseBySlug, getLessons } from '../../../../../lib/queries'
import { getCurrentUser } from '../../../../../lib/session'
import { getCurrentTenant } from '../../../../../lib/tenant'
import type { Media } from '../../../../../payload-types'

type Props = { params: Promise<{ course: string; lesson: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { course: slug, lesson: lessonParam } = await params
  const tenant = await getCurrentTenant()
  const course = await getCourseBySlug(tenant.id, decodeURIComponent(slug))
  const lesson = course ? (await getLessons(course.id)).find((l) => String(l.id) === lessonParam) : undefined
  return lesson && course ? { title: `${lesson.title} — ${course.title}` } : {}
}

export default async function LessonPage({ params }: Props) {
  const { course: slug, lesson: lessonParam } = await params
  const tenant = await getCurrentTenant()
  const course = await getCourseBySlug(tenant.id, decodeURIComponent(slug))
  if (!course) notFound()

  const lessons = await getLessons(course.id)
  const lesson = lessons.find((l) => String(l.id) === lessonParam)
  if (!lesson) notFound()

  const here = `/learn/${course.slug}/${lesson.id}`
  const user = await getCurrentUser()
  let completed = new Set<number>()
  let enrolled = false
  if (user) {
    const payload = await getPayloadClient()
    const res = await payload.find({
      collection: 'enrollments',
      where: { and: [{ user: { equals: user.id } }, { course: { equals: course.id } }, { status: { not_equals: 'cancelled' } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    enrolled = Boolean(res.docs[0])
    completed = new Set((res.docs[0]?.completedLessons ?? []).map((l) => idOf(l)!))
  }

  const canWatch = enrolled || lesson.isFreePreview
  if (!canWatch && !user) redirect(`/login?next=${encodeURIComponent(here)}`)

  const modules = new Map<string, typeof lessons>()
  for (const l of lessons) {
    const key = l.module ?? ''
    modules.set(key, [...(modules.get(key) ?? []), l])
  }

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 pt-8 md:px-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div>
        <p className="text-sm text-muted">
          <Link href={`/courses/${course.slug}`} className="hover:text-ink">{course.title}</Link>
          {lesson.module ? ` / ${lesson.module}` : ''}
        </p>
        <div className="mt-3 grid aspect-video place-items-center overflow-hidden rounded-3xl bg-ink text-bg">
          {canWatch && lesson.videoUrl ? (
            // Production: signed ArvanCloud VOD URL with a watermark of the student's name/phone.
            <video src={lesson.videoUrl} controls controlsList="nodownload" className="size-full" />
          ) : canWatch ? (
            <p className="text-sm opacity-70">ویدیوی این جلسه هنوز بارگذاری نشده است.</p>
          ) : (
            <div className="p-6 text-center">
              <p className="text-lg font-bold">این جلسه برای دانشجویان دوره است</p>
              <Link href={`/courses/${course.slug}`} className="mt-4 inline-block rounded-xl bg-brand px-5 py-2.5 font-bold text-brand-ink">
                ثبت‌نام در دوره
              </Link>
            </div>
          )}
        </div>
        {canWatch && user && canWatch && enrolled ? (
          <p aria-hidden className="mt-2 text-end font-latin text-xs text-muted">
            {user.name} · {user.phone}
          </p>
        ) : null}

        <h1 className="mt-6 text-2xl font-black md:text-3xl">{lesson.title}</h1>

        {enrolled ? (
          <form action={markLessonComplete} className="mt-4">
            <input type="hidden" name="lessonId" value={lesson.id} />
            <input type="hidden" name="back" value={here} />
            <button
              disabled={completed.has(lesson.id)}
              className="rounded-xl border border-line px-4 py-2 text-sm font-bold hover:bg-sunken disabled:border-ok disabled:text-ok"
            >
              {completed.has(lesson.id) ? '✓ دیده شد' : 'علامت‌گذاری به‌عنوان دیده‌شده'}
            </button>
          </form>
        ) : null}

        {canWatch && lesson.notes ? <p className="mt-6 whitespace-pre-line leading-8">{lesson.notes}</p> : null}

        {canWatch && lesson.resources?.length ? (
          <section className="mt-8">
            <h2 className="mb-3 font-black">منابع جلسه</h2>
            <ul className="grid gap-2">
              {lesson.resources.map((r) => {
                const file = docOf<Media>(r.file)
                return (
                  <li key={r.id ?? r.title}>
                    {file?.url ? (
                      <a href={file.url} className="text-brand hover:underline">{r.title}</a>
                    ) : (
                      <span className="text-muted">{r.title}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="max-h-[70vh] overflow-y-auto rounded-3xl border border-line bg-surface">
          {[...modules.entries()].map(([name, items]) => (
            <div key={name || 'default'}>
              {name ? <p className="sticky top-0 bg-sunken px-5 py-2 text-xs font-bold text-muted">{name}</p> : null}
              <ol>
                {items.map((l) => {
                  const current = l.id === lesson.id
                  const locked = !enrolled && !l.isFreePreview
                  return (
                    <li key={l.id}>
                      <Link
                        href={`/learn/${course.slug}/${l.id}`}
                        aria-current={current ? 'page' : undefined}
                        className={`flex items-center gap-3 px-5 py-3 text-sm hover:bg-sunken ${current ? 'bg-sunken font-bold text-brand' : ''}`}
                      >
                        <span className="w-5 shrink-0 text-center">{completed.has(l.id) ? '✓' : locked ? '🔒' : current ? '▶' : toPersianDigits(l.order)}</span>
                        <span className="flex-1">{l.title}</span>
                        {l.durationMinutes ? <span className="text-xs text-muted">{toPersianDigits(l.durationMinutes)}′</span> : null}
                      </Link>
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
