import type { ReactNode } from 'react'
import { SandboxBanner } from '../../../components/demo/SandboxBanner'

/** Only the E-029 demo countdown (renders nothing on a real academy). */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <SandboxBanner />
      {children}
    </>
  )
}
