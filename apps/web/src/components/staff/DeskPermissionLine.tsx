'use client'

import { deskDef, deskForPath, requirementCode } from '@edvora/core/staff'
import { usePathname } from 'next/navigation'

/** 403 variant C detail: the permission this desk needs, read from the URL (forbidden.tsx gets no props). */
export function DeskPermissionLine() {
  const desk = deskForPath(usePathname() ?? '')
  if (!desk) return null
  return (
    <p className="text-sm text-muted">
      کد دسترسی: <span dir="ltr" className="inline-block font-latin">{requirementCode(deskDef(desk).access)}</span>
    </p>
  )
}
