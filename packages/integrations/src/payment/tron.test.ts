import { afterEach, describe, expect, it, vi } from 'vitest'
import { IntegrationError } from '../errors'
import { call, jsonBody, stubFetch } from './test-helpers'
import { createTronVerifier, isTronAddress, tronBase58ToHex, tronHexToBase58 } from './tron'

afterEach(() => vi.unstubAllGlobals())

const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
const USDT_HEX = '41a614f803b6fd780986a42c78ec9c7f77e6ded13c'
const HASH = 'a'.repeat(64)
const FROM = '1111111111111111111111111111111111111111'
const TO = '2222222222222222222222222222222222222222'
const pad = (h: string) => h.padStart(64, '0')
const TRANSFER = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

const txInfo = (receipt: Record<string, string> = { result: 'SUCCESS' }) => ({
  id: HASH,
  blockNumber: 1000,
  blockTimeStamp: 1_700_000_000_000,
  receipt,
  log: [
    { address: USDT_HEX.slice(2), topics: [TRANSFER, pad(FROM), pad(TO)], data: pad((12_345_678n).toString(16)) },
    { address: USDT_HEX.slice(2), topics: ['ffff', pad(FROM)], data: '00' },
  ],
})
const nowBlock = (n: number) => ({ block_header: { raw_data: { number: n } } })

describe('tron addresses', () => {
  it('round-trips the USDT contract', () => {
    expect(tronHexToBase58(USDT_HEX)).toBe(USDT)
    expect(tronHexToBase58(USDT_HEX.slice(2))).toBe(USDT)
    expect(tronHexToBase58(`0x${USDT_HEX}`)).toBe(USDT)
    expect(tronBase58ToHex(USDT)).toBe(USDT_HEX)
    expect(isTronAddress(USDT)).toBe(true)
  })

  it('rejects a one-character change and junk', () => {
    expect(isTronAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u')).toBe(false)
    expect(isTronAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6')).toBe(false)
    expect(isTronAddress('0OIl')).toBe(false)
    expect(() => tronBase58ToHex('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u')).toThrow(IntegrationError)
    expect(() => tronHexToBase58('1234')).toThrow(IntegrationError)
  })
})

describe('tron verifier', () => {
  const tv = () => createTronVerifier({ apiUrl: 'https://api.trongrid.io/', apiKey: 'k' })

  it('maps a successful TRC20 transfer', async () => {
    const f = stubFetch(txInfo(), nowBlock(1018))
    const r = await tv().lookup({ network: 'trc20', txHash: `0x${HASH.toUpperCase()}` })
    expect(r).toEqual({
      found: true,
      network: 'trc20',
      txHash: HASH,
      success: true,
      blockNumber: 1000,
      confirmations: 19,
      timestamp: new Date(1_700_000_000_000),
      transfers: [{ tokenContract: USDT, from: tronHexToBase58(FROM), to: tronHexToBase58(TO), amount: 12_345_678n }],
    })
    const c0 = call(f, 0)
    expect(c0.url).toBe('https://api.trongrid.io/wallet/gettransactioninfobyid')
    expect(c0.init.headers).toMatchObject({ 'TRON-PRO-API-KEY': 'k' })
    expect(jsonBody(f, 0)).toEqual({ value: HASH })
    expect(call(f, 1).url).toBe('https://api.trongrid.io/wallet/getnowblock')
  })

  it('treats anything but an explicit SUCCESS as failed', async () => {
    stubFetch(txInfo({ result: 'REVERT' }), nowBlock(1000), txInfo({}), nowBlock(999))
    expect(await tv().lookup({ network: 'trc20', txHash: HASH })).toMatchObject({ found: true, success: false, confirmations: 1 })
    expect(await tv().lookup({ network: 'trc20', txHash: HASH })).toMatchObject({ found: true, success: false, confirmations: 0 })
  })

  it('returns not found for {} and bad hashes (without calling the API)', async () => {
    const f = stubFetch({})
    expect(await tv().lookup({ network: 'trc20', txHash: HASH })).toEqual({ found: false })
    expect(await tv().lookup({ network: 'trc20', txHash: 'xyz' })).toEqual({ found: false })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('throws IntegrationError on HTTP errors and network failures', async () => {
    stubFetch(new Response('rate limited', { status: 429 }))
    await expect(tv().lookup({ network: 'trc20', txHash: HASH })).rejects.toThrow(IntegrationError)
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('ECONNRESET')))
    await expect(tv().lookup({ network: 'trc20', txHash: HASH })).rejects.toThrow(/ECONNRESET/)
  })
})
