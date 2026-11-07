import { describe, expect, it } from 'vitest'
import { greetingName } from './names'

describe('greetingName', () => {
  it('uses the profile first name when present', () => {
    expect(greetingName({ firstName: ' سارا ', name: 'سارا احمدی' })).toBe('سارا')
  })
  it('falls back to the full display name, unsplit', () => {
    expect(greetingName({ firstName: '', name: 'دانشجوی  نمونه' })).toBe('دانشجوی نمونه')
    expect(greetingName({ name: 'دانشجوی نمونه' })).toBe('دانشجوی نمونه')
  })
  it('returns null when there is no name at all', () => {
    expect(greetingName({ firstName: null, name: '  ' })).toBeNull()
    expect(greetingName(null)).toBeNull()
  })
})
