'use client'

import { Seal } from '@edvora/ui'
import { useEffect, useState } from 'react'

/**
 * The certificate seal with its one sheen pass, only on the first visit (UX §3.1, G5.4). Later visits are quiet.
 * "Seen" is remembered in localStorage (try/catch); with reduced motion the sheen never plays anyway.
 */
export function CertificateSeal({ certificateId, className }: { certificateId: number; className?: string }) {
  const [sheen, setSheen] = useState(false)
  useEffect(() => {
    const key = `edvora:certificate-seen:${certificateId}`
    try {
      if (window.localStorage.getItem(key)) return
      window.localStorage.setItem(key, '1')
      setSheen(true)
    } catch {
      /* storage blocked: quiet version */
    }
  }, [certificateId])
  return <Seal className={className} sheen={sheen} />
}
