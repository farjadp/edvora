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
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

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
          <div className="c-pal__box" role="dialog" aria-modal="true" aria-label="جست‌وجو در بخش‌ها">
            <label className="c-pal__search">
              <ConsoleIcon name="search" />
              <span className="c-sr">نام بخش</span>
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام بخش را بنویسید…" onKeyDown={(e) => e.key === 'Enter' && found[0] && (window.location.href = found[0].href)} />
            </label>
            <ul className="c-pal__list">
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
