import { cx } from '@edvora/ui'

/** Logo (or the tenant-coloured initial) next to the academy name. */
export function AcademyMark({
  name,
  logoUrl,
  logoAlt,
  size = 'sm',
  hideNameOnMobile = false,
}: {
  name: string
  logoUrl?: string | null
  logoAlt?: string | null
  size?: 'sm' | 'lg'
  hideNameOnMobile?: boolean
}) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      {logoUrl ? (
        <img src={logoUrl} alt={logoAlt ?? ''} className={cx('w-auto shrink-0', size === 'lg' ? 'h-12' : 'h-8')} />
      ) : (
        <span
          aria-hidden
          className={cx('grid shrink-0 place-items-center rounded-lg bg-brand font-black text-brand-ink', size === 'lg' ? 'size-12 text-xl' : 'size-8 text-sm')}
        >
          {name.slice(0, 1)}
        </span>
      )}
      <span className={cx('truncate font-black', size === 'lg' ? 'text-xl' : 'text-base', hideNameOnMobile && 'hidden sm:inline')}>{name}</span>
    </span>
  )
}
