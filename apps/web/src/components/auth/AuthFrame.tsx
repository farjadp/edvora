import { ThemeToggle, cx, focusRing } from '@edvora/ui'
import { Guilloche, SealMark, SealStar, StarRule } from '@edvora/ui/seal'
import type { ReactNode } from 'react'

/** Public academy data shown before sign-in (spec §3). Never anything that needs a session. */
export type AuthBrand = {
  name: string
  logoUrl?: string | null
  logoAlt?: string | null
  /** Welcome line under the name: tenant `tagline` today (proposed `loginWelcome` later). Empty = no line. */
  welcome?: string | null
}

function Corner({ className }: { className: string }) {
  return <SealStar className={cx('absolute hidden size-4 text-brand md:block', className)} />
}

/**
 * Option B · Seal card (E-034). Paper page with a certificate double-hairline frame, corner stars and a static guilloche
 * watermark in the tenant colour; a centred card whose top edge the academy seal breaks. Full page: the public header
 * and footer are not rendered on login routes (PublicChrome). The card body (`children`) brings its own heading so
 * client steps (phone → code) can change it.
 */
export function AuthFrame({ brand, homeHref, children }: { brand: AuthBrand; homeHref?: string; children: ReactNode }) {
  const name = (
    <>
      <span className="rounded-full bg-surface p-1.5 ring-1 ring-line">
        <SealMark name={brand.name} logoUrl={brand.logoUrl} logoAlt={brand.logoAlt} className="size-20" stamp />
      </span>
    </>
  )
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-bg px-4 py-4 text-ink md:px-8 md:py-8">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-bg">
        پرش به محتوا
      </a>
      <div aria-hidden="true" className="pointer-events-none absolute inset-2 -z-10 border border-line-strong/70 md:inset-4" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-3.5 -z-10 hidden border border-line md:block" />
      <Corner className="start-[1.85rem] top-[1.85rem]" />
      <Corner className="end-[1.85rem] top-[1.85rem]" />
      <Corner className="bottom-[1.85rem] start-[1.85rem]" />
      <Corner className="bottom-[1.85rem] end-[1.85rem]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 grid place-items-center">
        <Guilloche className="size-[46rem] max-w-none text-brand opacity-[.13] md:size-[64rem]" />
      </div>

      <header className="relative flex justify-end md:px-8 md:pt-4">
        <ThemeToggle />
      </header>
      <main id="main" className="relative mx-auto my-auto flex w-full max-w-md flex-col items-stretch py-14">
        <div className="relative rounded-md border border-line bg-surface px-5 pb-8 pt-16 md:px-9">
          <div aria-hidden="true" className="pointer-events-none absolute inset-1.5 rounded-[3px] border border-line" />
          <div className="absolute inset-x-0 -top-11 flex justify-center">{name}</div>
          <div className="relative text-center">
            {homeHref ? (
              <a href={homeHref} className={cx('inline-block rounded-sm font-display text-xl font-black hover:underline hover:underline-offset-4', focusRing)}>
                {brand.name}
              </a>
            ) : (
              <p className="font-display text-xl font-black">{brand.name}</p>
            )}
            {brand.welcome ? <p className="mt-1 text-pretty text-sm leading-7 text-muted">{brand.welcome}</p> : null}
            <StarRule className="my-5" />
          </div>
          <div className="seal-rise relative">{children}</div>
        </div>
      </main>
    </div>
  )
}
