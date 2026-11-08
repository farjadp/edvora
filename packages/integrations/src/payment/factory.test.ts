import { describe, expect, it } from 'vitest'
import { IntegrationError } from '../errors'
import { createChainVerifier, createGateway, createMockChainVerifier, GATEWAY_KEYS, type GatewayName } from './index'

const creds = { merchantId: 'm', terminalId: '1', username: 'u', password: 'p', apiKey: 'k' }

describe('createGateway', () => {
  it.each([...GATEWAY_KEYS, 'mock'] as GatewayName[])('selects %s', (gateway) => {
    expect(createGateway({ gateway, sandbox: true, credentials: creds, mockGatewayUrl: 'http://localhost/pay/mock' }).name).toBe(gateway)
  })

  it('rejects unknown gateways', () => {
    expect(() => createGateway({ gateway: 'stripe' as GatewayName, sandbox: true, credentials: {}, mockGatewayUrl: 'http://x' })).toThrow(/Unknown gateway/)
  })

  it('selects chain verifiers', () => {
    expect(createChainVerifier({ verifier: 'mock' }).name).toBe('mock-chain')
    expect(createChainVerifier({ verifier: 'live', network: 'trc20', apiUrl: 'https://api.trongrid.io' }).name).toBe('trongrid')
    expect(createChainVerifier({ verifier: 'live', network: 'bep20', apiUrl: 'https://api.etherscan.io/v2/api?chainid=56' }).name).toBe('bscscan')
  })
})

describe('mock chain verifier', () => {
  const cv = createMockChainVerifier()
  const hint = { to: 'TWallet', amount: 1_000_000n, tokenContract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' }
  const look = (first: string, network: 'trc20' | 'bep20' = 'trc20') => cv.lookup({ network, txHash: `0x${first}${'0'.repeat(63)}`, hint })

  it('a: matching transfer', async () => {
    expect(await look('a')).toMatchObject({ found: true, success: true, confirmations: 100, transfers: [{ to: 'TWallet', amount: 1_000_000n }] })
  })
  it('b: one unit short', async () => {
    expect(await look('b')).toMatchObject({ found: true, transfers: [{ amount: 999_999n }] })
  })
  it('c: other wallet', async () => {
    const r = await look('c')
    expect(r.found && r.transfers[0]?.to).not.toBe('TWallet')
    const b = await look('c', 'bep20')
    expect(b.found && b.transfers[0]?.to).toBe('0x000000000000000000000000000000000000dead')
  })
  it('d: API unavailable', async () => {
    await expect(look('d')).rejects.toThrow(IntegrationError)
  })
  it('e: one confirmation', async () => {
    expect(await look('e')).toMatchObject({ found: true, success: true, confirmations: 1 })
  })
  it('f: failed on-chain', async () => {
    expect(await look('f')).toMatchObject({ found: true, success: false })
  })
  it('other: not found (also without a hint)', async () => {
    expect(await look('1')).toEqual({ found: false })
    expect(await cv.lookup({ network: 'trc20', txHash: 'a'.repeat(64) })).toEqual({ found: false })
  })
})
