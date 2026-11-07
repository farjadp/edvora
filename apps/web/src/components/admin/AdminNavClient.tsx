'use client'

import { ConsoleIcon, type ShellNavGroup } from '@edvora/ui/console'
import { Hamburger, Logout, useNav, usePreferences } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { Logo } from './Brand'

const active = (href: string, path: string) => (href === '/admin' ? path === '/admin' : path === href || path.startsWith(`${href}/`))

/** Mirrors Payload's own nav structure (classes `nav`, `nav__scroll`, ...) so its open/close and mobile behaviour keep working. */
export function AdminNavClient({ groups, selector }: { groups: ShellNavGroup[]; selector: ReactNode }) {
  const { hydrated, navOpen, navRef, setNavOpen, shouldAnimate } = useNav()
  const path = usePathname()
  const { getPreference } = usePreferences()

  // Payload starts the nav closed up to a 1440px window; on a desktop screen the console sidebar should be open
  // unless this person chose otherwise (their saved preference wins).
  useEffect(() => {
    if (!window.matchMedia('(min-width: 1025px)').matches) return
    void getPreference<{ open?: boolean }>('nav').then((p) => {
      if (typeof p?.open !== 'boolean') setNavOpen(true)
    })
  }, [getPreference, setNavOpen])
  // Phones and tablets: the nav is a drawer over the page. Esc closes it and gives focus back to the burger; Tab
  // cycles between the burger and the drawer's own links instead of falling through to the page behind.
  useEffect(() => {
    if (!navOpen || window.matchMedia('(min-width: 1025px)').matches) return
    const toggler = document.querySelector<HTMLElement>('.nav-toggler')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNavOpen(false)
        toggler?.focus()
        return
      }
      if (e.key !== 'Tab') return
      const inside = Array.from(document.querySelectorAll<HTMLElement>('aside.nav a[href], aside.nav button:not([disabled])'))
      const stops = [...(toggler ? [toggler] : []), ...inside]
      if (!stops.length) return
      const at = stops.findIndex((x) => x === document.activeElement)
      e.preventDefault()
      stops[e.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : at === stops.length - 1 ? 0 : at + 1]?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navOpen, setNavOpen])
  const cls = ['nav', navOpen && 'nav--nav-open', shouldAnimate && 'nav--nav-animate', hydrated && 'nav--nav-hydrated'].filter(Boolean).join(' ')
  return (
    <aside className={cls} inert={!navOpen ? true : undefined}>
      <div className="nav__scroll" ref={navRef}>
        <a href="/admin" className="c-nav__brand" aria-label="ادورا، داشبورد">
          <Logo />
        </a>
        {selector}
        <nav className="c-nav" aria-label="ناوبری مدیریت">
          {groups.map((g) => (
            <div key={g.key} className="c-nav__group">
              <p className="c-nav__label">{g.label}</p>
              <ul>
                {g.items.map((i) => {
                  const on = active(i.href, path)
                  return (
                    <li key={i.key}>
                      <a href={i.href} className="c-nav__link" aria-current={on ? 'page' : undefined}>
                        <ConsoleIcon name={i.icon} />
                        <span>{i.label}</span>
                        {i.external ? <ConsoleIcon name="external" className="c-nav__ext" /> : null}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="nav__controls">
          <Logout />
        </div>
      </div>
      <div className="nav__header">
        <div className="nav__header-content">
          <button className="nav__mobile-close" onClick={() => setNavOpen(false)} tabIndex={!navOpen ? -1 : undefined} type="button">
            <Hamburger isActive />
          </button>
        </div>
      </div>
    </aside>
  )
}
