import './preview.css'

import { tenantPalette } from '@edvora/ui/color'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { BRANDS, assertDev, type BrandId } from './_lib/options'

export const metadata: Metadata = {
  title: 'E-034 · پیش‌نمایش ورود',
  robots: { index: false, follow: false },
}

/** Scoped palette overrides so the options can be checked over other tenant colours: ?brand=teal|wine|blue */
function brandCss(): string {
  return (Object.keys(BRANDS) as BrandId[])
    .map((id) => {
      const b = BRANDS[id]
      if (!b.brand || !b.accent) return ''
      const p = tenantPalette(b.brand, b.accent)
      return (
        `[data-e034-brand='${id}']{--brand:${p.brand};--brand-ink:${p.brandInk};--accent:${p.accent};--accent-ink:${p.accentInk};--focus:${p.focus}}` +
        `[data-theme='dark'] [data-e034-brand='${id}']{--focus:${p.focusDark}}`
      )
    })
    .join('')
}

export default function PreviewLayout({ children }: { children: ReactNode }) {
  assertDev()
  return (
    <>
      <style>{brandCss()}</style>
      {children}
    </>
  )
}
