/**
 * The assistant's mark: an eight-point spark on a petrol disc, the small cousin of the academy Seal (Girih family).
 * Plain SVG on console tokens so it renders the same in /staff (Tailwind) and /admin (no Tailwind). Decorative:
 * the name next to it carries the meaning.
 */
export function AssistantMark({ size = 28, className, pulse = false }: { size?: number; className?: string; pulse?: boolean }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" width={size} height={size} className={`${pulse ? 'ai-mark ai-mark--pulse' : 'ai-mark'}${className ? ` ${className}` : ''}`}>
      <circle cx="16" cy="16" r="16" fill="var(--c-primary)" />
      <path d="M16 6l2.3 7.7L26 16l-7.7 2.3L16 26l-2.3-7.7L6 16l7.7-2.3z" fill="var(--c-brand)" />
      <path d="M16 11.5l1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2-3.2-1.3 3.2-1.3z" fill="var(--c-primary)" />
      <circle cx="16" cy="16" r="1.6" fill="var(--c-brand-wash)" />
    </svg>
  )
}
