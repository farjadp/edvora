/** Thin site-wide announcement strip with an accent dot. */
export function NoticeBar({ text, label = 'اطلاعیه' }: { text: string; label?: string }) {
  // A static banner, not a live region: role="status" would re-announce it on every page load.
  return (
    <aside aria-label={label} className="border-b border-line bg-sunken px-4 py-2 text-center text-sm text-muted">
      <span className="me-2 inline-block size-2 rounded-full bg-accent align-middle" aria-hidden />
      {text}
    </aside>
  )
}
