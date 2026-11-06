export function NoticeBar({ text }: { text: string }) {
  return (
    <div role="status" className="border-b border-line bg-sunken px-4 py-2 text-center text-sm text-muted">
      <span className="me-2 inline-block size-2 rounded-full bg-accent align-middle" aria-hidden />
      {text}
    </div>
  )
}
