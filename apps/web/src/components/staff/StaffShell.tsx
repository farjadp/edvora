'use client'

import { ThemeToggle, cx } from '@edvora/ui'
import { focusRing } from '@edvora/ui/classes'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AcademyMark } from './AcademyMark'
import { StaffIcon } from './icons'
import { StaffNav, isActive } from './StaffNav'
import type { StaffNavItem, StaffUserInfo } from './types'
import { PostButton } from './ui'

export type StaffShellProps = {
  tenantName: string
  logoUrl?: string | null
  logoAlt?: string | null
  /** Latin host shown in the user menu, e.g. `demo.localhost`. */
  host: string
  user: StaffUserInfo
  /** Permission-filtered desks, in nav order. */
  items: StaffNavItem[]
  /** After the separator: settings (↗ /admin) and security. */
  secondaryItems: StaffNavItem[]
  /** POST route handler that ends the Payload session. */
  logoutHref: string
  siteHref?: string
  homeHref?: string
  /** Override the pathname used for aria-current (previews). Defaults to usePathname(). */
  currentPath?: string
  children: ReactNode
}

const iconBtn = cx('grid size-11 place-items-center rounded-full border border-line text-ink transition-colors hover:bg-sunken', focusRing)

export function StaffShell({
  tenantName,
  logoUrl,
  logoAlt,
  host,
  user,
  items,
  secondaryItems,
  logoutHref,
  siteHref = '/',
  homeHref = '/staff',
  currentPath,
  children,
}: StaffShellProps) {
  const pathname = usePathname()
  const path = currentPath ?? pathname
  const [drawer, setDrawer] = useState(false)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const burgerRef = useRef<HTMLButtonElement>(null)

  const all = [...items, ...secondaryItems]
  const barItems = all.length <= 4 ? all : all.slice(0, 4)
  const showMore = all.length > 4

  // Close the user menu on outside click or Escape.
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenu(false)
        menuBtnRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  // Drawer: Escape closes, Tab stays inside, scroll locked, focus returns to the opener.
  useEffect(() => {
    if (!drawer) return
    closeRef.current?.focus()
    document.body.classList.add('overflow-hidden')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawer(false)
        return
      }
      if (e.key !== 'Tab' || !drawerRef.current) return
      const f = drawerRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')
      if (!f.length) return
      const first = f[0]!
      const last = f[f.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('overflow-hidden')
    }
  }, [drawer])

  const initial = user.name.trim().slice(0, 1) || user.email.slice(0, 1).toUpperCase()

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <a
        href="#staff-main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[60] focus:rounded-xl focus:bg-ink focus:px-4 focus:py-3 focus:text-bg"
      >
        رفتن به محتوا
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-bg">
        <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-5">
          <button
            ref={burgerRef}
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="باز کردن منو"
            aria-expanded={drawer}
            aria-controls="staff-drawer"
            className={cx(iconBtn, 'lg:hidden')}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          <a href={homeHref} className={cx('min-w-0 rounded-lg', focusRing)}>
            <AcademyMark name={tenantName} logoUrl={logoUrl} logoAlt={logoAlt} />
          </a>

          <div className="ms-auto flex items-center gap-2">
            <ThemeToggle />
            <div ref={menuRef} className="relative">
              <button
                ref={menuBtnRef}
                type="button"
                onClick={() => setMenu((v) => !v)}
                aria-expanded={menu}
                aria-haspopup="menu"
                aria-controls="staff-user-menu"
                aria-label={`منوی کاربر، ${user.name}`}
                className={cx('flex h-11 items-center gap-2 rounded-full border border-line ps-1 pe-3 transition-colors hover:bg-sunken', focusRing)}
              >
                <span aria-hidden className="grid size-9 place-items-center rounded-full bg-ink text-sm font-bold text-bg">
                  {initial}
                </span>
                <span className="hidden max-w-40 truncate text-sm font-medium lg:inline">{user.name}</span>
                <svg viewBox="0 0 24 24" className="size-4 text-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {menu ? (
                <div
                  id="staff-user-menu"
                  role="menu"
                  aria-label="منوی کاربر"
                  className="absolute end-0 top-full z-50 mt-2 grid w-72 max-w-[calc(100vw-1.5rem)] gap-1 rounded-2xl border border-line bg-surface p-2"
                >
                  <div className="grid gap-1 px-3 py-2">
                    <strong className="truncate">{user.name}</strong>
                    <span className="truncate font-latin text-sm text-muted" dir="ltr">{user.email}</span>
                    {user.roles.length ? <span className="text-sm">{user.roles.join('، ')}</span> : null}
                    <span className="text-sm text-muted">
                      {tenantName} · <span dir="ltr" className="inline-block font-latin">{host}</span>
                    </span>
                  </div>
                  <hr className="border-line" />
                  <a role="menuitem" href="/staff/security" className={cx('flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm hover:bg-sunken', focusRing)}>
                    <StaffIcon name="security" /> امنیت حساب
                  </a>
                  <a role="menuitem" href={siteHref} className={cx('flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm hover:bg-sunken', focusRing)}>
                    <StaffIcon name="site" /> مشاهدهٔ سایت
                  </a>
                  <form method="post" action={logoutHref}>
                    <button role="menuitem" type="submit" className={cx('flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-sm font-bold text-danger hover:bg-sunken', focusRing)}>
                      خروج
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-e border-line p-3">
            <StaffNav items={items} secondaryItems={secondaryItems} currentPath={path} />
          </div>
        </aside>
        <main id="staff-main" tabIndex={-1} className="min-w-0 px-4 py-6 pb-28 outline-none sm:px-6 lg:px-8 lg:py-8 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom bar */}
      <nav aria-label="ناوبری سریع" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg lg:hidden">
        <ul className={cx('grid h-16', showMore ? 'grid-cols-[repeat(5,minmax(0,1fr))]' : 'grid-flow-col auto-cols-fr')}>
          {barItems.map((item) => {
            const active = isActive(item.href, path)
            return (
              <li key={item.key} className="min-w-0">
                <a
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cx('relative flex h-full flex-col items-center justify-center gap-1 px-1 text-xs', active ? 'font-bold text-ink' : 'text-muted', focusRing)}
                >
                  {active ? <span aria-hidden className="absolute inset-x-3 top-0 h-1 rounded-b bg-brand" /> : null}
                  {item.icon ? <StaffIcon name={item.icon} /> : null}
                  <span className="max-w-full truncate">{item.label}</span>
                </a>
              </li>
            )
          })}
          {showMore ? (
            <li className="min-w-0">
              <button
                type="button"
                onClick={() => setDrawer(true)}
                aria-expanded={drawer}
                aria-controls="staff-drawer"
                className={cx('flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-xs text-muted', focusRing)}
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
                  <circle cx="5" cy="12" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="19" cy="12" r="1.8" />
                </svg>
                <span>بیشتر</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>

      {/* Mobile drawer */}
      <div className={cx('fixed inset-0 z-50 lg:hidden', drawer ? 'visible' : 'invisible delay-200 motion-reduce:delay-0')} aria-hidden={!drawer}>
        <div
          onClick={() => setDrawer(false)}
          className={cx('absolute inset-0 bg-ink/50 motion-safe:transition-opacity motion-safe:duration-200', drawer ? 'opacity-100' : 'opacity-0')}
        />
        <div
          id="staff-drawer"
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="منو"
          className={cx(
            'absolute inset-y-0 start-0 grid w-72 max-w-[85vw] grid-rows-[auto_minmax(0,1fr)] border-e border-line bg-bg motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out',
            drawer ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full',
          )}
        >
          <div className="flex h-14 items-center justify-between gap-2 border-b border-line px-3">
            <AcademyMark name={tenantName} logoUrl={logoUrl} logoAlt={logoAlt} />
            <button ref={closeRef} type="button" onClick={() => { setDrawer(false); burgerRef.current?.focus() }} aria-label="بستن منو" className={iconBtn}>
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto p-3">
            <StaffNav items={items} secondaryItems={secondaryItems} currentPath={path} onNavigate={() => setDrawer(false)} />
            <div className="mt-4 border-t border-line pt-4">
              <PostButton action={logoutHref}>خروج</PostButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
