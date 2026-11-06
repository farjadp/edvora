'use client'

import { btnPrimary, Card } from './ui'

/** Error-boundary body for a desk that failed to load. Full reload, no stack trace. */
export function DeskLoadError() {
  return (
    <Card className="grid max-w-md gap-4">
      <p role="alert" className="font-bold">بارگذاری نشد. دوباره تلاش کنید.</p>
      <div>
        <button type="button" onClick={() => window.location.reload()} className={btnPrimary()}>
          تلاش دوباره
        </button>
      </div>
    </Card>
  )
}
