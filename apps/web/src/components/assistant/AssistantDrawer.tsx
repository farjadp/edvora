'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AssistantPanel } from './AssistantPanel'
import './assistant.css'

/** E-046 · floating «دستیار» button + side drawer, on every /staff and /admin page for people with `ai.use`. */
export function AssistantDrawer({ privacyNote, enabled, sectionHref }: { privacyNote: string; enabled: boolean; sectionHref: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  // Portal to <body>: in /admin the header (our mount point) creates a containing block for position: fixed.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const launcher = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !open) launcher.current?.focus()
    wasOpen.current = open
  }, [open])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  // The section has the chat on the page itself; a second one floating over it would only get in the way.
  if (pathname?.startsWith('/staff/assistant') || !mounted) return null
  return createPortal(
    <>
      {open ? <AssistantPanel mode="drawer" privacyNote={privacyNote} enabled={enabled} sectionHref={sectionHref} onClose={() => setOpen(false)} /> : null}
      {!open ? (
        <button ref={launcher} type="button" className="ai-launch" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-keyshortcuts="Control+J" title="دستیار هوشمند (Ctrl J)">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
          </svg>
          دستیار
        </button>
      ) : null}
    </>,
    document.body,
  )
}
