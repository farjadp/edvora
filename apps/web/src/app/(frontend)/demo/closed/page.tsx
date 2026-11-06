import { forbidden } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** /admin inside a demo sandbox (C4, S10): the proxy rewrites here; answers a real 403 via ./forbidden.tsx. */
export default function SandboxAdminClosed() {
  forbidden()
}
