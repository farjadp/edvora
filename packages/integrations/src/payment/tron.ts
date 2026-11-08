import { createHash } from 'node:crypto'
import { z } from 'zod'
import { IntegrationError } from '../errors'
import { TRANSFER_TOPIC, fetchChainJson, hexToBigInt, strip0x, topicToAddressHex } from './chain-util'
import type { ChainLookup, ChainTransfer, ChainVerifier } from './types'

/**
 * USDT TRC20 via the TronGrid HTTP API (`/wallet/gettransactioninfobyid`, `/wallet/getnowblock`).
 * Addresses are returned in canonical base58check (prefix 0x41). Only an explicit receipt `SUCCESS` counts as success.
 */

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const sha256 = (b: Uint8Array): Buffer => createHash('sha256').update(b).digest()

function base58Encode(bytes: Uint8Array): string {
  let n = 0n
  for (const b of bytes) n = n * 256n + BigInt(b)
  let out = ''
  while (n > 0n) {
    out = ALPHABET.charAt(Number(n % 58n)) + out
    n /= 58n
  }
  for (const b of bytes) {
    if (b !== 0) break
    out = `1${out}`
  }
  return out
}

function base58Decode(s: string): Uint8Array | null {
  let n = 0n
  for (const c of s) {
    const i = ALPHABET.indexOf(c)
    if (i < 0) return null
    n = n * 58n + BigInt(i)
  }
  const bytes: number[] = []
  while (n > 0n) {
    bytes.unshift(Number(n % 256n))
    n /= 256n
  }
  for (const c of s) {
    if (c !== '1') break
    bytes.unshift(0)
  }
  return Uint8Array.from(bytes)
}

const hexToBytes = (hex: string): Uint8Array => Uint8Array.from(Buffer.from(hex, 'hex'))

/** `41…` (21-byte) or bare 20-byte hex, with or without 0x → base58check `T…` address. */
export function tronHexToBase58(hex: string): string {
  let h = strip0x(hex.trim()).toLowerCase()
  if (/^[0-9a-f]{40}$/.test(h)) h = `41${h}`
  if (!/^41[0-9a-f]{40}$/.test(h)) throw new IntegrationError('tron', `Invalid TRON hex address: ${hex}`)
  const payload = hexToBytes(h)
  const checksum = sha256(sha256(payload)).subarray(0, 4)
  return base58Encode(Buffer.concat([payload, checksum]))
}

function decodeChecked(addr: string): Uint8Array | null {
  const bytes = base58Decode(addr.trim())
  if (!bytes || bytes.length !== 25 || bytes[0] !== 0x41) return null
  const payload = bytes.subarray(0, 21)
  const expected = sha256(sha256(payload)).subarray(0, 4)
  return Buffer.compare(Buffer.from(bytes.subarray(21)), expected) === 0 ? payload : null
}

/** `T…` address → lowercase 41-prefixed hex (42 chars). Throws on an invalid address or checksum. */
export function tronBase58ToHex(addr: string): string {
  const payload = decodeChecked(addr)
  if (!payload) throw new IntegrationError('tron', `Invalid TRON address: ${addr}`)
  return Buffer.from(payload).toString('hex')
}

/** True for a well-formed mainnet base58check address (prefix 0x41, valid checksum). */
export const isTronAddress = (addr: string): boolean => decodeChecked(addr) !== null

const TxInfo = z.object({
  Error: z.string().optional(),
  id: z.string().optional(),
  blockNumber: z.number().optional(),
  blockTimeStamp: z.number().optional(),
  receipt: z.object({ result: z.string().optional() }).optional(),
  log: z.array(z.object({ address: z.string(), topics: z.array(z.string()).optional(), data: z.string().optional() })).optional(),
})
const NowBlock = z.object({ block_header: z.object({ raw_data: z.object({ number: z.number() }) }) })

export function createTronVerifier(opts: { apiUrl: string; apiKey?: string }): ChainVerifier {
  const base = opts.apiUrl.replace(/\/+$/, '')
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' }
  if (opts.apiKey) headers['TRON-PRO-API-KEY'] = opts.apiKey

  const post = (path: string, body: unknown): Promise<unknown> =>
    fetchChainJson('tron', `${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })

  return {
    name: 'trongrid',
    async lookup({ network, txHash }): Promise<ChainLookup> {
      if (network !== 'trc20') throw new IntegrationError('tron', `Tron verifier cannot look up ${network}`)
      const hash = strip0x(txHash.trim()).toLowerCase()
      if (!/^[0-9a-f]{64}$/.test(hash)) return { found: false }

      const rawInfo = await post('/wallet/gettransactioninfobyid', { value: hash })
      const info = TxInfo.safeParse(rawInfo)
      if (!info.success) throw new IntegrationError('tron', 'Unexpected transaction info response', rawInfo)
      if (info.data.Error) throw new IntegrationError('tron', info.data.Error, rawInfo)
      const { id, blockNumber, blockTimeStamp } = info.data
      if (!id || blockNumber === undefined) return { found: false }

      const rawNow = await post('/wallet/getnowblock', {})
      const now = NowBlock.safeParse(rawNow)
      if (!now.success) throw new IntegrationError('tron', 'Unexpected now-block response', rawNow)

      const transfers: ChainTransfer[] = []
      for (const l of info.data.log ?? []) {
        const topics = l.topics ?? []
        if (topics.length !== 3 || strip0x(topics[0] ?? '').toLowerCase() !== TRANSFER_TOPIC) continue
        try {
          transfers.push({
            tokenContract: tronHexToBase58(l.address),
            from: tronHexToBase58(topicToAddressHex(topics[1] ?? '')),
            to: tronHexToBase58(topicToAddressHex(topics[2] ?? '')),
            amount: hexToBigInt(l.data ?? ''),
          })
        } catch {
          // A malformed log is not a transfer we can credit; skip it.
        }
      }

      return {
        found: true,
        network: 'trc20',
        txHash: hash,
        success: info.data.receipt?.result === 'SUCCESS',
        blockNumber,
        confirmations: Math.max(0, now.data.block_header.raw_data.number - blockNumber + 1),
        timestamp: new Date(blockTimeStamp ?? 0),
        transfers,
      }
    },
  }
}
