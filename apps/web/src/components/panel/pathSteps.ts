import type { CertificatePathStep } from '@edvora/ui'
import { toPersianDigits as fa } from '@edvora/core/digits'
import type { GamificationView } from '../../lib/gamification'

/**
 * Maps the server's certificate path onto stepper nodes. Completed steps are done, the first open one is current,
 * the certificate is `sealed` until it exists. `lessons` shows «۱۲ از ۳۰»; the others show the same count.
 */
export function pathSteps(path: GamificationView['path']): CertificatePathStep[] {
  let currentTaken = false
  return path.steps.map((s) => {
    if (s.key === 'certificate') return { key: s.key, label: s.label, state: s.complete ? 'done' : 'sealed' } satisfies CertificatePathStep
    const state = s.complete ? 'done' : currentTaken ? 'todo' : 'current'
    if (!s.complete) currentTaken = true
    return { key: s.key, label: s.label, detail: s.total > 0 ? `${fa(s.done)} از ${fa(s.total)}` : undefined, state } satisfies CertificatePathStep
  })
}
