import { btnSecondary, Card } from './ui'

export type DeskPlaceholderProps = {
  /** Desk name, the page h1. */
  title: string
  /** One sentence about what will land here. */
  description: string
  /** Only when the user can enter /admin and the collection exists. */
  adminLink?: { label: string; href: string }
}

export function DeskPlaceholder({ title, description, adminLink }: DeskPlaceholderProps) {
  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-black">{title}</h1>
      <Card className="grid max-w-2xl gap-3">
        <h2 className="text-lg font-black">این میز هنوز آماده نیست.</h2>
        <p className="leading-8 text-muted">{description}</p>
        {adminLink ? (
          <>
            <p className="leading-8 text-muted">تا آن زمان کار با فهرست در بخش تنظیمات و راه‌اندازی انجام می‌شود.</p>
            <div>
              <a href={adminLink.href} className={btnSecondary()}>
                {adminLink.label} <span aria-hidden>↗</span>
              </a>
            </div>
          </>
        ) : null}
      </Card>
    </div>
  )
}
