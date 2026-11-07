'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { focusRing } from '../classes'
import { cx } from '../cx'
import { ThemeToggle } from '../ThemeToggle'
import { ConsoleIcon, type ConsoleIconName } from './icons'

/**
 * Operator-console shell (E-035): collapsible sidebar (right side in RTL, a drawer on phones), top bar with
 * search (Ctrl/⌘ K), theme, fullscreen, notifications, settings and the user menu. Presentational: the app passes
 * the permission-filtered nav, the user and the current path. Used by /staff.
 */
export type ShellNavItem = { key: string; label: string; href: string; icon: ConsoleIconName; /** Leaves this shell (e.g. to /admin). */ external?: boolean }
export type ShellNavGroup = { key: string; label: string; items: ShellNavItem[] }
export type ShellUser = { name: string; email: string; roles: string[] }
export type ShellMenuItem = { key: string; label: string; href: string; icon: ConsoleIconName }

export type AppShellProps = {
  brand: ReactNode
  homeHref: string
  nav: ShellNavGroup[]
  user: ShellUser
  /** e.g. `demo.localhost`, shown in the user menu. */
  host: string
  tenantName: string
  currentPath: string
  logoutHref: string
  menuItems: ShellMenuItem[]
  /** Bell: links to where the alerts are. `count` 0 hides the dot. */
  notifications?: { count: number; href: string; label: string }
  settingsHref?: string
  children: ReactNode
}

const COLLAPSE_KEY = 'console-nav'
const norm = (s: string) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLowerCase()

export function isNavActive(href: string, path: string): boolean {
  if (href.startsWith('/admin')) return false
  return path === href || path.startsWith(`${href}/`)
}

const topBtn = cx('grid size-10 place-items-center rounded-xl border border-line bg-surface text-ink transition-colors hover:bg-sunken', focusRing)

export function AppShell({ brand, homeHref, nav, user, host, tenantName, currentPath, logoutHref, menuItems, notifications, settingsHref, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [menu, setMenu] = useState(false)
  const [palette, setPalette] = useState(false)
  const [full, setFull] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const burgerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === 'collapsed')
    } catch {
      /* private mode */
    }
  }, [])
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, v ? 'open' : 'collapsed')
      } catch {
        /* private mode */
      }
      return !v
    })
  }

  useEffect(() => {
    const on = () => setFull(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  // Ctrl/⌘ K opens the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

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

  // Drawer: Escape closes, Tab stays inside, scroll locked.
  useEffect(() => {
    if (!drawer) return
    closeRef.current?.focus()
    document.body.classList.add('overflow-hidden')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawer(false)
        burgerRef.current?.focus()
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

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen().catch(() => undefined)
  }

  const initial = user.name.trim().slice(0, 1) || user.email.slice(0, 1).toUpperCase()
  const primaryRole = user.roles[0]

  return (
    <div data-console className="min-h-dvh bg-bg text-ink">
      <a href="#console-main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[70] focus:rounded-xl focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-ink">
        رفتن به محتوا
      </a>

      <div className={cx('lg:grid', collapsed ? 'lg:grid-cols-[4.5rem_minmax(0,1fr)]' : 'lg:grid-cols-[16.5rem_minmax(0,1fr)]')}>
        {/* Sidebar (desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-0 grid h-dvh grid-rows-[auto_minmax(0,1fr)] bg-side text-side-ink">
            <div className={cx('flex h-16 items-center border-b border-side-line', collapsed ? 'justify-center px-2' : 'px-4')}>
              <a href={homeHref} aria-label={tenantName} className={cx('min-w-0 rounded-lg', focusRing)}>
                {collapsed ? <span className="block [&>span>span:last-child]:hidden">{brand}</span> : brand}
              </a>
            </div>
            <div className="overflow-y-auto px-3 py-4">
              <SideNav nav={nav} path={currentPath} collapsed={collapsed} />
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          {/* Top bar */}
          <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
            <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6">
              <button
                ref={burgerRef}
                type="button"
                onClick={() => setDrawer(true)}
                aria-label="باز کردن منو"
                aria-expanded={drawer}
                aria-controls="console-drawer"
                className={cx(topBtn, 'lg:hidden')}
              >
                <ConsoleIcon name="menu" />
              </button>
              <button type="button" onClick={toggleCollapsed} aria-label={collapsed ? 'باز کردن نوار کناری' : 'جمع کردن نوار کناری'} aria-pressed={collapsed} className={cx(topBtn, 'hidden lg:grid')}>
                <ConsoleIcon name="sidebar" />
              </button>

              <button
                type="button"
                onClick={() => setPalette(true)}
                aria-haspopup="dialog"
                className={cx('flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-start text-sm text-muted transition-colors hover:bg-sunken sm:max-w-md', focusRing)}
              >
                <ConsoleIcon name="search" className="size-[1.125rem]" />
                <span className="min-w-0 flex-1 truncate">جست‌وجو در بخش‌ها…</span>
                <kbd dir="ltr" className="hidden rounded-md border border-line bg-sunken px-1.5 py-0.5 font-latin text-xs sm:inline">
                  Ctrl K
                </kbd>
              </button>

              <div className="ms-auto flex items-center gap-2">
                <ThemeToggle className={topBtn} />
                <button type="button" onClick={toggleFull} aria-label={full ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'} aria-pressed={full} className={cx(topBtn, 'hidden sm:grid')}>
                  <ConsoleIcon name={full ? 'collapse' : 'expand'} />
                </button>
                {notifications ? (
                  <a href={notifications.href} aria-label={notifications.label} className={cx(topBtn, 'relative')}>
                    <ConsoleIcon name="bell" />
                    {notifications.count > 0 ? <span aria-hidden className="absolute end-1.5 top-1.5 size-2.5 rounded-full border-2 border-surface bg-danger" /> : null}
                  </a>
                ) : null}
                {settingsHref ? (
                  <a href={settingsHref} aria-label="تنظیمات و راه‌اندازی" className={cx(topBtn, 'hidden sm:grid')}>
                    <ConsoleIcon name="settings" />
                  </a>
                ) : null}
                <div ref={menuRef} className="relative">
                  <button
                    ref={menuBtnRef}
                    type="button"
                    onClick={() => setMenu((v) => !v)}
                    aria-expanded={menu}
                    aria-haspopup="menu"
                    aria-controls="console-user-menu"
                    aria-label={`منوی کاربر، ${user.name}`}
                    className={cx('flex h-10 items-center gap-2 rounded-xl border border-line bg-surface ps-1 pe-2 transition-colors hover:bg-sunken sm:pe-3', focusRing)}
                  >
                    <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-ink">
                      {initial}
                    </span>
                    <span className="hidden min-w-0 text-start leading-tight lg:block">
                      <span className="block max-w-36 truncate text-sm font-bold">{user.name}</span>
                      {primaryRole ? <span className="block max-w-36 truncate text-xs text-muted">{primaryRole}</span> : null}
                    </span>
                    <ConsoleIcon name="chevron" className="size-4 text-muted" />
                  </button>
                  {menu ? (
                    <div id="console-user-menu" role="menu" aria-label="منوی کاربر" className="absolute end-0 top-full z-50 mt-2 grid w-72 max-w-[calc(100vw-1.5rem)] gap-1 rounded-2xl border border-line bg-surface p-2 shadow-card">
                      <div className="grid gap-1 px-3 py-2">
                        <strong className="truncate">{user.name}</strong>
                        <span className="truncate font-latin text-sm text-muted" dir="ltr">
                          {user.email}
                        </span>
                        {user.roles.length ? <span className="text-sm">{user.roles.join('، ')}</span> : null}
                        <span className="text-sm text-muted">
                          {tenantName} · <span dir="ltr" className="inline-block font-latin">{host}</span>
                        </span>
                      </div>
                      <hr className="border-line" />
                      {menuItems.map((m) => (
                        <a key={m.key} role="menuitem" href={m.href} className={cx('flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm hover:bg-sunken', focusRing)}>
                          <ConsoleIcon name={m.icon} className="size-[1.125rem]" /> {m.label}
                        </a>
                      ))}
                      <form method="post" action={logoutHref}>
                        <button role="menuitem" type="submit" className={cx('flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-sm font-bold text-danger hover:bg-sunken', focusRing)}>
                          <ConsoleIcon name="logout" className="size-[1.125rem]" /> خروج
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </header>

          <main id="console-main" tabIndex={-1} className="grid min-w-0 gap-6 px-4 py-6 outline-none sm:px-6 lg:py-8">
            {children}
          </main>
        </div>
      </div>

      {/* Drawer (phones and tablets) */}
      <div className={cx('fixed inset-0 z-50 lg:hidden', drawer ? 'visible' : 'invisible delay-200 motion-reduce:delay-0')} aria-hidden={!drawer}>
        <div onClick={() => setDrawer(false)} className={cx('absolute inset-0 bg-ink/50 motion-safe:transition-opacity motion-safe:duration-200', drawer ? 'opacity-100' : 'opacity-0')} />
        <div
          id="console-drawer"
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="منو"
          className={cx(
            'absolute inset-y-0 start-0 grid w-72 max-w-[85vw] grid-rows-[auto_minmax(0,1fr)] bg-side text-side-ink motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out',
            drawer ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full',
          )}
        >
          <div className="flex h-16 items-center justify-between gap-2 border-b border-side-line px-3">
            <a href={homeHref} className={cx('min-w-0 rounded-lg', focusRing)}>
              {brand}
            </a>
            <button ref={closeRef} type="button" onClick={() => { setDrawer(false); burgerRef.current?.focus() }} aria-label="بستن منو" className={cx('grid size-10 place-items-center rounded-xl border border-side-line text-side-ink hover:bg-side-hover', focusRing)}>
              <ConsoleIcon name="close" />
            </button>
          </div>
          <div className="overflow-y-auto px-3 py-4">
            <SideNav nav={nav} path={currentPath} collapsed={false} onNavigate={() => setDrawer(false)} />
            <form method="post" action={logoutHref} className="mt-4 border-t border-side-line pt-4">
              <button type="submit" className={cx('flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-sm font-bold hover:bg-side-hover', focusRing)}>
                <ConsoleIcon name="logout" className="size-[1.125rem]" /> خروج
              </button>
            </form>
          </div>
        </div>
      </div>

      {palette ? <Palette nav={nav} onClose={() => setPalette(false)} /> : null}
    </div>
  )
}

function SideNav({ nav, path, collapsed, onNavigate }: { nav: ShellNavGroup[]; path: string; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="ناوبری اصلی" className="grid gap-4">
      {nav.map((g) => (
        <div key={g.key} className="grid gap-1">
          {collapsed ? <hr className="mx-3 border-side-line first:hidden" /> : <p className="px-3 pb-1 text-xs font-bold tracking-wide text-side-muted">{g.label}</p>}
          <ul className="grid gap-0.5">
            {g.items.map((item) => {
              const active = isNavActive(item.href, path)
              return (
                <li key={item.key}>
                  <a
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cx(
                      'flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                      collapsed && 'justify-center px-0',
                      active ? 'bg-teal font-bold text-teal-ink' : 'text-side-ink hover:bg-side-hover',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal',
                    )}
                  >
                    <ConsoleIcon name={item.icon} />
                    {collapsed ? null : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                    {item.external && !collapsed ? <ConsoleIcon name="external" className="size-3.5 opacity-70" /> : null}
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/** Ctrl/⌘ K: jump to any section the person may see. Pure client-side filter over the nav. */
function Palette({ nav, onClose }: { nav: ShellNavGroup[]; onClose: () => void }) {
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const all = useMemo(() => nav.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))), [nav])
  const found = useMemo(() => {
    const n = norm(q.trim())
    return n ? all.filter((i) => norm(i.label).includes(n) || norm(i.group).includes(n)) : all
  }, [all, q])

  useEffect(() => {
    inputRef.current?.focus()
    document.body.classList.add('overflow-hidden')
    return () => document.body.classList.remove('overflow-hidden')
  }, [])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    const links = Array.from(listRef.current?.querySelectorAll<HTMLElement>('a') ?? [])
    const i = links.findIndex((l) => l === document.activeElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      links[Math.min(i + 1, links.length - 1)]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (i <= 0) inputRef.current?.focus()
      else links[i - 1]?.focus()
    } else if (e.key === 'Enter' && document.activeElement === inputRef.current && links[0]) {
      links[0].click()
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-start justify-items-center px-3 pt-[12vh]" onKeyDown={onKey}>
      <div onClick={onClose} className="absolute inset-0 bg-ink/50" />
      <div role="dialog" aria-modal="true" aria-label="جست‌وجو در بخش‌ها" className="relative grid max-h-[70vh] w-full max-w-lg grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <label className="flex items-center gap-3 border-b border-line px-4">
          <ConsoleIcon name="search" className="text-muted" />
          <span className="sr-only">نام بخش</span>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام بخش را بنویسید…" className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted" />
        </label>
        <ul ref={listRef} className="overflow-y-auto p-2">
          {found.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted">بخشی با این نام پیدا نشد.</li> : null}
          {found.map((i) => (
            <li key={i.key}>
              <a href={i.href} onClick={onClose} className={cx('flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm hover:bg-sunken', focusRing)}>
                <ConsoleIcon name={i.icon} className="size-[1.125rem] text-brand-text" />
                <span className="min-w-0 flex-1 truncate font-medium">{i.label}</span>
                <span className="text-xs text-muted">{i.group}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
