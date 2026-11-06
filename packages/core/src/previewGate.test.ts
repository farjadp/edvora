import { describe, expect, it } from 'vitest'
import { checkPreviewGate, parsePreviewGate } from './previewGate'

const basic = (s: string) => `Basic ${Buffer.from(s, 'utf8').toString('base64')}`

describe('preview gate', () => {
  it('leaves hosts that are not listed alone', () => {
    const gate = parsePreviewGate({ PRIVATE_PREVIEW_HOSTS: 'iba-demo.up.railway.app', PRIVATE_PREVIEW_USER: 'u', PRIVATE_PREVIEW_PASSWORD: 'p' })
    expect(checkPreviewGate(gate, 'web-production.up.railway.app', null)).toBe('pass')
    expect(checkPreviewGate(parsePreviewGate({}), 'anything', null)).toBe('pass')
  })

  it('marks listed hosts noindex, with or without a port or www', () => {
    const gate = parsePreviewGate({ PRIVATE_PREVIEW_HOSTS: 'IBA-demo.up.railway.app, other.test' })
    expect(checkPreviewGate(gate, 'iba-demo.up.railway.app:443', null)).toBe('noindex')
    expect(checkPreviewGate(gate, 'www.other.test', null)).toBe('noindex')
  })

  it('asks for basic auth only when both user and password are set', () => {
    expect(checkPreviewGate(parsePreviewGate({ PRIVATE_PREVIEW_HOSTS: '*', PRIVATE_PREVIEW_USER: 'u' }), 'x', null)).toBe('noindex')
    const gate = parsePreviewGate({ PRIVATE_PREVIEW_HOSTS: '*', PRIVATE_PREVIEW_USER: 'farjad', PRIVATE_PREVIEW_PASSWORD: 's3cret:with-colon' })
    expect(checkPreviewGate(gate, 'x', null)).toBe('challenge')
    expect(checkPreviewGate(gate, 'x', basic('farjad:wrong'))).toBe('challenge')
    expect(checkPreviewGate(gate, 'x', 'Basic !!notbase64')).toBe('challenge')
    expect(checkPreviewGate(gate, 'x', 'Bearer abc')).toBe('challenge')
    expect(checkPreviewGate(gate, 'x', basic('farjad:s3cret:with-colon'))).toBe('noindex')
  })

  it('accepts non-ASCII (UTF-8) passwords', () => {
    const gate = parsePreviewGate({ PRIVATE_PREVIEW_HOSTS: '*', PRIVATE_PREVIEW_USER: 'iba', PRIVATE_PREVIEW_PASSWORD: 'رمز-۱۴۰۵' })
    expect(checkPreviewGate(gate, 'x', basic('iba:رمز-۱۴۰۵'))).toBe('noindex')
  })
})
