import type { ReactNode } from 'react'

export type RowProps = { id?: string; title: string; children: ReactNode }

/** Page section with a heading and a horizontally scrolling, snap-aligned strip of cards. */
export function Row({ id, title, children }: RowProps) {
  return (
    <section id={id} className="mx-auto max-w-7xl px-4 pt-14 md:px-8">
      <h2 className="mb-5 text-xl font-black md:text-2xl">{title}</h2>
      <div className="scrollbar-none -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">{children}</div>
    </section>
  )
}
