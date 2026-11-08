import '@fontsource/vazirmatn/400.css'
import '@fontsource/vazirmatn/500.css'
import '@fontsource/vazirmatn/700.css'
import '@fontsource/vazirmatn/900.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/700.css'
import './styles.css'

import { NoticeBar } from '@edvora/ui'
import { isHex, tenantPalette, tenantPaletteCss } from '@edvora/ui/color'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Footer } from '../../components/Footer'
import { Header } from '../../components/Header'
import { PublicChrome } from '../../components/PublicChrome'
import { getCurrentTenant } from '../../lib/tenant'

export const dynamic = 'force-dynamic'

const mediaUrl = (v: unknown): string | null => (v && typeof v === 'object' && 'url' in v && typeof (v as { url?: unknown }).url === 'string' ? (v as { url: string }).url : null)

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getCurrentTenant()
  // E-047 (ADR 019): SEO defaults, favicon and share image from the settings hub. All self-hosted media.
  const suffix = tenant.seo?.titleSuffix?.trim() || tenant.name
  const description = tenant.seo?.description?.trim() || tenant.tagline || undefined
  const favicon = mediaUrl(tenant.favicon)
  const og = mediaUrl(tenant.ogImage)
  return {
    title: { default: tenant.name, template: `%s · ${suffix}` },
    description,
    keywords: tenant.seo?.keywords?.trim() || undefined,
    robots: tenant.seo?.noindex ? { index: false, follow: false } : undefined,
    icons: favicon ? { icon: favicon } : undefined,
    openGraph: { siteName: tenant.name, title: tenant.name, description, images: og ? [og] : undefined, locale: 'fa_IR', type: 'website' },
  }
}

export default async function FrontendLayout({ children }: { children: ReactNode }) {
  const tenant = await getCurrentTenant()
  const brand = isHex(tenant.primaryColor) ? tenant.primaryColor : '#1A56DB'
  const accent = isHex(tenant.accentColor) ? tenant.accentColor : '#F59E0B'
  // Derives brand-ink, accent-ink and focus colours that meet contrast for whatever colours the tenant picked.
  // E-047: display font from the self-hosted set only (Morabba by default; Vazirmatn as the alternative).
  const fontCss = tenant.fontDisplay === 'vazirmatn' ? `html:root{--font-display:'Vazirmatn',ui-sans-serif,system-ui,sans-serif}` : ''
  const paletteCss = tenantPaletteCss(tenantPalette(brand, accent)) + fontCss
  const defaultTheme = tenant.defaultTheme === 'dark' ? 'dark' : 'light'
  // Runs before paint so the saved theme never flashes.
  const themeScript = `try{var t=localStorage.getItem('theme')||'${defaultTheme}';document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='${defaultTheme}'}`

  return (
    <html lang="fa" dir="rtl" data-theme={defaultTheme} suppressHydrationWarning>
      <head>
        <style>{paletteCss}</style>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-bg text-ink">
        <PublicChrome
          notice={tenant.notice?.enabled && tenant.notice.text ? <NoticeBar text={tenant.notice.text} /> : null}
          header={<Header tenant={tenant} />}
          footer={<Footer tenant={tenant} />}
        >
          {children}
        </PublicChrome>
      </body>
    </html>
  )
}
