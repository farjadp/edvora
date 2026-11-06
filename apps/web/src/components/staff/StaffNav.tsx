'use client'

import { cx } from '@edvora/ui'
import { focusRing } from '@edvora/ui/classes'
import { StaffIcon } from './icons'
import type { StaffNavItem } from './types'

export type StaffNavProps = {
  items: StaffNavItem[]
  /** Items after the separator (settings, security). */
  secondaryItems?: StaffNavItem[]
  /** Current pathname, used for aria-current. */
  currentPath: string
  onNavigate?: () => void
  /** Accessible name of the <nav>. */
  label?: string
}

export function isActive(href: string, currentPath: string): boolean {
  if (href === '/admin') return false
  return currentPath === href || currentPath.startsWith(`${href}/`)
}

function NavLink({ item, currentPath, onNavigate }: { item: StaffNavItem; currentPath: string; onNavigate?: () => void }) {
  const active = isActive(item.href, currentPath)
  return (
    <a
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
        active ? 'bg-brand font-bold text-brand-ink' : 'text-ink hover:bg-sunken',
        focusRing,
      )}
    >
      {item.icon ? <StaffIcon name={item.icon} /> : null}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.external ? <span aria-hidden className="text-muted">↗</span> : null}
    </a>
  )
}

/** Side/drawer navigation. Plain anchors: the desks are server pages and a full load keeps the Host header. */
export function StaffNav({ items, secondaryItems = [], currentPath, onNavigate, label = 'ناوبری میز کار' }: StaffNavProps) {
  return (
    <nav aria-label={label} className="grid gap-1">
      {items.map((item) => (
        <NavLink key={item.key} item={item} currentPath={currentPath} onNavigate={onNavigate} />
      ))}
      {secondaryItems.length ? <hr className="my-2 border-line" /> : null}
      {secondaryItems.map((item) => (
        <NavLink key={item.key} item={item} currentPath={currentPath} onNavigate={onNavigate} />
      ))}
    </nav>
  )
}
