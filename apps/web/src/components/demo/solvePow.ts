'use client'

import { leadingZeroBits, powMessage } from '@edvora/core/pow'

/** Solves the challenge in a Web Worker; falls back to small main-thread batches that yield between them. */
export function solvePow(nonce: string, bits: number): Promise<number> {
  if (typeof Worker !== 'undefined') {
    try {
      const worker = new Worker(new URL('./powWorker.ts', import.meta.url), { type: 'module' })
      return new Promise<number>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent<{ counter?: number; error?: string }>) => {
          worker.terminate()
          if (typeof e.data.counter === 'number') resolve(e.data.counter)
          else reject(new Error(e.data.error ?? 'pow'))
        }
        worker.onerror = () => {
          worker.terminate()
          solveInline(nonce, bits).then(resolve, reject)
        }
        worker.postMessage({ nonce, bits })
      })
    } catch {
      // Worker blocked (CSP, old browser): inline below.
    }
  }
  return solveInline(nonce, bits)
}

async function solveInline(nonce: string, bits: number): Promise<number> {
  const enc = new TextEncoder()
  for (let counter = 0; counter < 50_000_000; counter++) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(powMessage(nonce, counter))))
    if (leadingZeroBits(digest) >= bits) return counter
    if (counter % 500 === 0) await new Promise((r) => setTimeout(r, 0))
  }
  throw new Error('pow unsolved')
}
