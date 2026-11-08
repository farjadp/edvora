'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AssistantMark } from './AssistantMark'
import { AssistantPanel } from './AssistantPanel'
import './assistant.css'

/** E-046 · floating «دستیار» button + side drawer, on every /staff and /admin page for people with `ai.use`. */
export function AssistantDrawer({ name, userName, privacyNote, enabled, sectionHref }: { name: string; userName: string | null; privacyNote: string; enabled: boolean; sectionHref: string }) {
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
      {open ? <AssistantPanel mode="drawer" name={name} userName={userName} privacyNote={privacyNote} enabled={enabled} sectionHref={sectionHref} onClose={() => setOpen(false)} /> : null}
      {!open ? (
        <button ref={launcher} type="button" className="ai-launch" data-testid="ai-launcher" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-keyshortcuts="Control+J" aria-label={`${name}، دستیار هوشمند (Ctrl J)`} title={`${name}، دستیار هوشمند (Ctrl J)`}>
          <AssistantMark size={26} />
          {name}
        </button>
      ) : null}
    </>,
    document.body,
  )
}
