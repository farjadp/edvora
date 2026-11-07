import type { LessonLock, LearningRequirement } from '@edvora/core'
import { cx } from '@edvora/ui'
import Link from 'next/link'
import type { Lesson } from '../../payload-types'
import { fa, lockText } from './labels'

type Props = {
  courseSlug: string
  lessons: Lesson[]
  locks: Map<string, LessonLock> | null
  completed: Set<number>
  currentId?: number
  /** Required items still open per lesson (to name the quiz in "after previous" messages). */
  blockersOf?: (lessonId: string) => LearningRequirement[]
  /** Not enrolled: only free previews are open. */
  guest?: boolean
  compact?: boolean
}

function LockIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="size-4 fill-current">
      <path d="M10 2a4 4 0 0 0-4 4v2H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-1V6a4 4 0 0 0-4-4Zm-2 6V6a2 2 0 1 1 4 0v2H8Z" />
    </svg>
  )
}

/** Course lessons in order, grouped by module. Locked lessons show title + when they open, never content (R2). */
export function LessonList({ courseSlug, lessons, locks, completed, currentId, blockersOf, guest, compact }: Props) {
  const titleOf = (id: string) => lessons.find((l) => String(l.id) === id)?.title ?? ''
  const modules = new Map<string, Lesson[]>()
  for (const l of lessons) modules.set(l.module ?? '', [...(modules.get(l.module ?? '') ?? []), l])

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface">
      {[...modules.entries()].map(([name, items]) => (
        <div key={name || 'default'}>
          {name ? <p className="sticky top-0 bg-sunken px-5 py-2 text-xs font-bold text-muted">{name}</p> : null}
          <ol>
            {items.map((l) => {
              const lock = locks?.get(String(l.id))
              const locked = guest ? !l.isFreePreview : lock?.state === 'locked'
              const done = completed.has(l.id)
              const current = l.id === currentId
              const hint = !guest && lock && lock.state === 'locked' ? lockText(lock, titleOf, blockersOf) : guest && locked ? 'برای دانشجویان دوره' : ''
              return (
                <li key={l.id} data-lesson-state={done ? 'done' : locked ? 'locked' : 'open'}>
                  <Link
                    href={`/learn/${courseSlug}/${l.id}`}
                    aria-current={current ? 'page' : undefined}
                    className={cx('flex items-start gap-3 px-5 py-3 text-sm hover:bg-sunken', current && 'bg-sunken font-bold text-brand-text', locked && 'text-muted')}
                  >
                    <span className="mt-0.5 grid w-5 shrink-0 place-items-center text-center">
                      {done ? <span className="text-ok">✓</span> : locked ? <LockIcon /> : fa(l.order)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cx('block', !compact && 'font-bold', locked ? 'text-muted' : 'text-ink')}>{l.title}</span>
                      {hint ? <span className="mt-0.5 block text-xs leading-6 text-muted">{hint}</span> : null}
                    </span>
                    {l.durationMinutes ? <span className="shrink-0 text-xs text-muted">{fa(l.durationMinutes)} دقیقه</span> : null}
                  </Link>
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </div>
  )
}
