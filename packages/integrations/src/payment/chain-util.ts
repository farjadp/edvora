import { IntegrationError, fetchText } from '../errors'

/** ERC-20 / TRC-20 `Transfer(address,address,uint256)` event topic. */
export const TRANSFER_TOPIC = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

/** Fetches JSON from a chain API; a non-2xx status or non-JSON body is an `IntegrationError` (never "not found"). */
export async function fetchChainJson(provider: string, url: string, init: RequestInit = {}): Promise<unknown> {
  const text = await fetchText(provider, url, { ...init, requireOk: true })
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new IntegrationError(provider, 'Non-JSON response', text.slice(0, 500))
  }
}

export const strip0x = (h: string): string => (h.startsWith('0x') || h.startsWith('0X') ? h.slice(2) : h)

/** Hex quantity (with or without 0x; empty = 0) to bigint. */
export function hexToBigInt(h: string): bigint {
  const s = strip0x(h)
  if (s === '') return 0n
  if (!/^[0-9a-fA-F]+$/.test(s)) throw new Error(`Invalid hex: ${h}`)
  return BigInt(`0x${s}`)
}

/** The 20-byte address in the low bytes of a 32-byte topic, lowercase hex without 0x. */
export function topicToAddressHex(topic: string): string {
  const s = strip0x(topic).toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(s)) throw new Error(`Invalid topic: ${topic}`)
  return s.slice(24)
}
