/**
 * Proof-of-work in a Web Worker (E-029 A2, V13): the UI thread never blocks. Web Crypto only, no dependencies.
 * Message in: { nonce, bits }. Message out: { counter } or { error }.
 */
import { leadingZeroBits, powMessage } from '@edvora/core/pow'

type In = { nonce: string; bits: number }
type Scope = { onmessage: ((e: MessageEvent<In>) => void) | null; postMessage: (m: unknown) => void }
const scope = self as unknown as Scope

scope.onmessage = async (e) => {
  const { nonce, bits } = e.data
  const enc = new TextEncoder()
  try {
    for (let counter = 0; counter < 50_000_000; counter++) {
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(powMessage(nonce, counter))))
      if (leadingZeroBits(digest) >= bits) {
        scope.postMessage({ counter })
        return
      }
    }
    scope.postMessage({ error: 'unsolved' })
  } catch {
    scope.postMessage({ error: 'crypto' })
  }
}
