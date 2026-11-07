'use client'

import { ConsoleIcon } from '@edvora/ui/console'
import { useTheme } from '@payloadcms/ui'
import { useEffect, useMemo, useRef, useState } from 'react'

type Item = { key: string; label: string; href: string; group: string }
const norm = (s: string) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLowerCase()

export function HeaderToolsClient({ items, alerts }: { items: Item[]; alerts: number }) {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [full, setFull] = useState(false)
  const [q, setQ] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const found = useMemo(() => {
    const n = norm(q.trim())
    return n ? items.filter((i) => norm(i.label).includes(n) || norm(i.group).includes(n)) : items
  }, [items, q])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      } else if (e.key === 'Escape') setOpen(false)
    }
    const onFull = () => setFull(Boolean(document.fullscreenElement))
    document.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFull)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFull)
    }
  }, [])
  const list = useRef<HTMLUListElement>(null)
  useEffect(() => {
    if (!open) return
    // Focus goes back to whatever opened the palette once it closes.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    input.current?.focus()
    return () => {
      if (opener && opener.isConnected) opener.focus()
    }
  }, [open])

  /** aria-modal: Tab stays inside (input, then results); arrows move through the results. */
  const onBoxKey = (e: React.KeyboardEvent) => {
    const links = Array.from(list.current?.querySelectorAll<HTMLElement>('a') ?? [])
    const stops: HTMLElement[] = [...(input.current ? [input.current] : []), ...links]
    const at = stops.findIndex((l) => l === document.activeElement)
    if (e.key === 'Tab' && stops.length) {
      e.preventDefault()
      stops[e.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : at === stops.length - 1 ? 0 : at + 1]?.focus()
    } else if (e.key === 'ArrowDown' && stops.length) {
      e.preventDefault()
      stops[Math.min(at + 1, stops.length - 1)]?.focus()
    } else if (e.key === 'ArrowUp' && stops.length) {
      e.preventDefault()
      stops[Math.max(at - 1, 0)]?.focus()
    }
  }

  return (
    <div className="c-tools">
      <button type="button" className="c-tool c-tool--search" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <ConsoleIcon name="search" />
        <span>جست‌وجو</span>
        <kbd dir="ltr">Ctrl K</kbd>
      </button>
      <button type="button" className="c-tool" aria-label={theme === 'dark' ? 'حالت روشن' : 'حالت تیره'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        <ConsoleIcon name={theme === 'dark' ? 'sun' : 'moon'} />
      </button>
      <button type="button" className="c-tool c-tool--wide" aria-pressed={full} aria-label={full ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'} onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen().catch(() => undefined))}>
        <ConsoleIcon name={full ? 'collapse' : 'expand'} />
      </button>
      <a className="c-tool c-tool--bell" href="/admin#alerts" aria-label={alerts ? `${alerts} هشدار` : 'هشدارها'}>
        <ConsoleIcon name="bell" />
        {alerts > 0 ? <span className="c-tool__dot" aria-hidden="true" /> : null}
      </a>
      {open ? (
        <div className="c-pal" role="presentation">
          <div className="c-pal__scrim" onClick={() => setOpen(false)} />
          <div className="c-pal__box" role="dialog" aria-modal="true" aria-label="جست‌وجو در بخش‌ها" onKeyDown={onBoxKey}>
            <label className="c-pal__search">
              <ConsoleIcon name="search" />
              <span className="c-sr">نام بخش</span>
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام بخش را بنویسید…" onKeyDown={(e) => e.key === 'Enter' && found[0] && (window.location.href = found[0].href)} />
            </label>
            <ul className="c-pal__list" ref={list}>
              {found.length === 0 ? <li className="c-muted c-pal__none">بخشی با این نام پیدا نشد.</li> : null}
              {found.map((i) => (
                <li key={i.key}>
                  <a href={i.href} onClick={() => setOpen(false)}>
                    <span>{i.label}</span>
                    <span className="c-muted c-small">{i.group}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  )
}
