/**
 * Proof-of-work primitives shared by the browser worker and the server (E-029 A2). Dependency-free so the Web
 * Worker bundle stays tiny: `@edvora/core/pow`.
 */

/** Number of leading zero bits in a digest. */
export function leadingZeroBits(bytes: Uint8Array): number {
  let n = 0
  for (const b of bytes) {
    if (b === 0) {
      n += 8
      continue
    }
    return n + Math.clz32(b) - 24
  }
  return n
}

/** The hashed message: sha256(`${nonce}:${counter}`) must have ≥ bits leading zero bits. */
export const powMessage = (nonce: string, counter: number) => `${nonce}:${counter}`
