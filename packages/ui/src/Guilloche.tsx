import { cx } from './cx'

/** Concentric hairlines like banknote guilloche: the Seal watermark. Decorative, never over text. */
export function Guilloche({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 200" className={cx('pointer-events-none absolute text-brand', className)}>
      {Array.from({ length: 12 }, (_, i) => (
        <circle key={i} cx="100" cy="100" r={14 + i * 7.5} fill="none" stroke="currentColor" strokeWidth="0.6" />
      ))}
    </svg>
  )
}
