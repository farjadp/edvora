import { StaffIcon } from './icons'
import type { StaffNavItem } from './types'

export type StartPageProps = {
  /** Every nav item the user can see, security included. */
  items: StaffNavItem[]
}

/** Neutral landing when no desk matches the user's permissions. */
export function StartPage({ items }: StartPageProps) {
  const onlySecurity = items.every((i) => i.key === 'security')
  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-black">میز کاری برای نقش شما تعریف نشده است.</h1>
      {onlySecurity ? <p className="max-w-2xl leading-8 text-muted">هنوز به بخشی دسترسی ندارید. از مدیر آکادمی بخواهید دسترسی شما را بررسی کند.</p> : null}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
        {items.map((item) => (
          <li key={item.key} className="min-w-0">
            <a
              href={item.href}
              className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface p-4 font-bold hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {item.icon ? <StaffIcon name={item.icon} /> : null}
              <span className="min-w-0 flex-1">{item.label}</span>
              {item.external ? <span aria-hidden>↗</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
