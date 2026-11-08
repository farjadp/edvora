import { afterEach, describe, expect, it, vi } from 'vitest'
import { IntegrationError } from '../errors'
import { createBscVerifier } from './bsc'
import { call, stubFetch } from './test-helpers'

afterEach(() => vi.unstubAllGlobals())

const HASH = `0x${'b'.repeat(64)}`
const USDT = '0x55d398326f99059ff775485246999027b3197955'
const FROM = '0x1111111111111111111111111111111111111111'
const TO = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
const topic = (a: string) => `0x${a.slice(2).padStart(64, '0')}`
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const AMOUNT = 25n * 10n ** 18n

const receipt = (status: string) => ({
  jsonrpc: '2.0',
  id: 1,
  result: {
    status,
    blockNumber: '0x64',
    logs: [
      { address: '0x55D398326f99059fF775485246999027B3197955', topics: [TRANSFER, topic(FROM), topic(TO.toUpperCase().replace('0X', '0x'))], data: `0x${AMOUNT.toString(16)}` },
      { address: USDT, topics: ['0x1234'], data: '0x' },
    ],
  },
})

describe('bsc verifier', () => {
  const bv = () => createBscVerifier({ apiUrl: 'https://api.etherscan.io/v2/api?chainid=56', apiKey: 'KEY' })

  it('maps a successful BEP20 transfer and keeps the query in apiUrl', async () => {
    const f = stubFetch(receipt('0x1'), { jsonrpc: '2.0', id: 1, result: '0x72' }, { jsonrpc: '2.0', id: 1, result: { timestamp: '0x6553f100' } })
    const r = await bv().lookup({ network: 'bep20', txHash: HASH.toUpperCase().replace('0X', '0x') })
    expect(r).toEqual({
      found: true,
      network: 'bep20',
      txHash: HASH,
      success: true,
      blockNumber: 100,
      confirmations: 15,
      timestamp: new Date(0x6553f100 * 1000),
      transfers: [{ tokenContract: USDT, from: FROM, to: TO, amount: AMOUNT }],
    })
    const u0 = new URL(call(f, 0).url)
    expect(u0.origin + u0.pathname).toBe('https://api.etherscan.io/v2/api')
    expect(Object.fromEntries(u0.searchParams)).toEqual({ chainid: '56', module: 'proxy', action: 'eth_getTransactionReceipt', txhash: HASH, apikey: 'KEY' })
    expect(new URL(call(f, 1).url).searchParams.get('action')).toBe('eth_blockNumber')
    const u2 = new URL(call(f, 2).url).searchParams
    expect([u2.get('action'), u2.get('tag'), u2.get('boolean')]).toEqual(['eth_getBlockByNumber', '0x64', 'false'])
  })

  it('reports a failed transaction', async () => {
    stubFetch(receipt('0x0'), { result: '0x64' }, { result: { timestamp: '0x1' } })
    expect(await bv().lookup({ network: 'bep20', txHash: HASH })).toMatchObject({ found: true, success: false, confirmations: 1 })
  })

  it('returns not found for a null receipt and malformed hashes', async () => {
    const f = stubFetch({ jsonrpc: '2.0', id: 1, result: null })
    expect(await bv().lookup({ network: 'bep20', txHash: HASH })).toEqual({ found: false })
    expect(await bv().lookup({ network: 'bep20', txHash: 'b'.repeat(64) })).toEqual({ found: false })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('throws IntegrationError on NOTOK and JSON-RPC errors', async () => {
    stubFetch({ status: '0', message: 'NOTOK', result: 'Invalid API Key' }, { jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'boom' } })
    await expect(bv().lookup({ network: 'bep20', txHash: HASH })).rejects.toThrow(/Invalid API Key/)
    await expect(bv().lookup({ network: 'bep20', txHash: HASH })).rejects.toThrow(IntegrationError)
  })
})
