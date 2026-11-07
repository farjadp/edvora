import { cx } from '@edvora/ui'

/**
 * Logo (or the tenant-coloured initial) next to the academy name. On the console sidebar (`onSide`) the logo sits on a
 * warm-white tile so any academy's logo stays legible on petrol; the tenant's colour appears only here.
 */
export function AcademyMark({
  name,
  logoUrl,
  logoAlt,
  size = 'sm',
  hideNameOnMobile = false,
  onSide = false,
}: {
  name: string
  logoUrl?: string | null
  logoAlt?: string | null
  size?: 'sm' | 'lg'
  hideNameOnMobile?: boolean
  onSide?: boolean
}) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      {logoUrl ? (
        <span className={cx('grid shrink-0 place-items-center', onSide && 'rounded-xl bg-bg p-1')}>
          <img src={logoUrl} alt={logoAlt ?? ''} className={cx('w-auto shrink-0', size === 'lg' ? 'h-12' : 'h-8')} />
        </span>
      ) : (
        <span
          aria-hidden
          className={cx('grid shrink-0 place-items-center rounded-lg bg-tenant font-black text-tenant-ink', size === 'lg' ? 'size-12 text-xl' : 'size-9 text-base')}
        >
          {name.slice(0, 1)}
        </span>
      )}
      <span className={cx('truncate font-black', size === 'lg' ? 'text-xl' : 'text-base', hideNameOnMobile && 'hidden sm:inline')}>{name}</span>
    </span>
  )
}
