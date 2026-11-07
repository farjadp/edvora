'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/** Result headings take focus on load (UX §7): a screen reader reads the outcome first; nothing scrolls. */
export function FocusHeading({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])
  return (
    <h1 ref={ref} id={id} tabIndex={-1} className={className}>
      {children}
    </h1>
  )
}
