import { z } from 'zod'
import { IntegrationError } from '../errors'
import { TRANSFER_TOPIC, fetchChainJson, hexToBigInt, strip0x, topicToAddressHex } from './chain-util'
import type { ChainLookup, ChainTransfer, ChainVerifier } from './types'

/**
 * USDT BEP20 via an Etherscan-v2 / BscScan-compatible API (`module=proxy`). `apiUrl` may already carry a query,
 * e.g. `https://api.etherscan.io/v2/api?chainid=56`. Addresses are lowercase 0x hex.
 */
const Envelope = z.object({
  status: z.string().optional(),
  message: z.string().optional(),
  result: z.unknown(),
  error: z.object({ code: z.number().optional(), message: z.string() }).optional(),
})
const Hex = z.string().regex(/^0x[0-9a-fA-F]*$/)
const Receipt = z.object({
  status: Hex.nullish(),
  blockNumber: Hex,
  logs: z.array(z.object({ address: z.string(), topics: z.array(z.string()), data: z.string() })),
})
const Block = z.object({ timestamp: Hex })

export function createBscVerifier(opts: { apiUrl: string; apiKey?: string }): ChainVerifier {
  async function proxy(params: Record<string, string>): Promise<unknown> {
    const url = new URL(opts.apiUrl)
    url.searchParams.set('module', 'proxy')
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    if (opts.apiKey) url.searchParams.set('apikey', opts.apiKey)
    const raw = await fetchChainJson('bsc', url.toString(), { headers: { accept: 'application/json' } })
    const env = Envelope.safeParse(raw)
    if (!env.success) throw new IntegrationError('bsc', 'Unexpected API response', raw)
    if (env.data.error) throw new IntegrationError('bsc', env.data.error.message, raw)
    if (env.data.status === '0') {
      const why = typeof env.data.result === 'string' ? env.data.result : (env.data.message ?? 'NOTOK')
      throw new IntegrationError('bsc', why, raw)
    }
    return env.data.result
  }

  return {
    name: 'bscscan',
    async lookup({ network, txHash }): Promise<ChainLookup> {
      if (network !== 'bep20') throw new IntegrationError('bsc', `BSC verifier cannot look up ${network}`)
      const hash = txHash.trim().toLowerCase()
      if (!/^0x[0-9a-f]{64}$/.test(hash)) return { found: false }

      const rawReceipt = await proxy({ action: 'eth_getTransactionReceipt', txhash: hash })
      if (rawReceipt === null || rawReceipt === undefined) return { found: false }
      const receipt = Receipt.safeParse(rawReceipt)
      if (!receipt.success) throw new IntegrationError('bsc', 'Unexpected receipt', rawReceipt)

      const rawHead = await proxy({ action: 'eth_blockNumber' })
      const head = Hex.safeParse(rawHead)
      if (!head.success) throw new IntegrationError('bsc', 'Unexpected block number', rawHead)

      const rawBlock = await proxy({ action: 'eth_getBlockByNumber', tag: receipt.data.blockNumber, boolean: 'false' })
      const block = Block.safeParse(rawBlock)
      if (!block.success) throw new IntegrationError('bsc', 'Unexpected block', rawBlock)

      const blockNumber = Number(hexToBigInt(receipt.data.blockNumber))
      const headNumber = Number(hexToBigInt(head.data))
      const transfers: ChainTransfer[] = []
      for (const l of receipt.data.logs) {
        if (l.topics.length !== 3 || strip0x(l.topics[0] ?? '').toLowerCase() !== TRANSFER_TOPIC) continue
        try {
          transfers.push({
            tokenContract: l.address.toLowerCase(),
            from: `0x${topicToAddressHex(l.topics[1] ?? '')}`,
            to: `0x${topicToAddressHex(l.topics[2] ?? '')}`,
            amount: hexToBigInt(l.data),
          })
        } catch {
          // Malformed log: not a transfer we can credit.
        }
      }

      return {
        found: true,
        network: 'bep20',
        txHash: hash,
        success: receipt.data.status === '0x1',
        blockNumber,
        confirmations: Math.max(0, headNumber - blockNumber + 1),
        timestamp: new Date(Number(hexToBigInt(block.data.timestamp)) * 1000),
        transfers,
      }
    },
  }
}
