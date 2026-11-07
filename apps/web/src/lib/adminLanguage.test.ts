import { describe, expect, it } from 'vitest'
import { chosenAdminLanguage, withDefaultAdminLanguage } from './adminLanguage'

describe('admin language default', () => {
  it('adds fa when there is no language cookie', () => {
    expect(withDefaultAdminLanguage(null)).toEqual({ cookie: 'payload-lng=fa', changed: true })
    expect(withDefaultAdminLanguage('payload-token=abc')).toEqual({ cookie: 'payload-token=abc; payload-lng=fa', changed: true })
  })
  it('never overrides a language the person chose', () => {
    expect(withDefaultAdminLanguage('a=1; payload-lng=en')).toEqual({ cookie: 'a=1; payload-lng=en', changed: false })
    expect(chosenAdminLanguage('payload-lng=fa')).toBe('fa')
  })
  it('replaces an unsupported value', () => {
    expect(chosenAdminLanguage('payload-lng=de')).toBeNull()
    expect(withDefaultAdminLanguage('payload-lng=de; x=2')).toEqual({ cookie: 'x=2; payload-lng=fa', changed: true })
  })
  it('does not confuse similar cookie names', () => {
    expect(chosenAdminLanguage('my-payload-lng=en')).toBeNull()
  })
})
