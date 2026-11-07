/**
 * Admin brand marks (E-031, Seal direction). Server components, no data, no external assets.
 * The mark is an eight-point girih star (two squares) around a ring, the same star the certificate seal uses.
 */
const Seal = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="7.5" y="7.5" width="17" height="17" />
    <rect x="7.5" y="7.5" width="17" height="17" transform="rotate(45 16 16)" />
    <circle cx="16" cy="16" r="4.2" />
  </svg>
)

/** Small mark for the breadcrumb home and the favicon-sized spots. */
export function Icon() {
  return <Seal className="ed-seal" />
}

/** Login and nav wordmark: seal + «ادورا» in Morabba + Latin name. */
export function Logo() {
  return (
    <span className="ed-logo">
      <Seal className="ed-logo__seal" />
      <span className="ed-logo__fa">ادورا</span>
      <span className="ed-logo__en">Edvora</span>
    </span>
  )
}
