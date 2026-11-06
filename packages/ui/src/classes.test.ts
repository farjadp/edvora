import { describe, expect, it } from 'vitest'
import { buttonClass, inputClass } from './classes'
import { cx } from './cx'

const set = (s: string) => new Set(s.split(' '))

describe('cx', () => {
  it('drops empty parts', () => {
    expect(cx('a', false, null, undefined, '', 'b')).toBe('a b')
  })
})

describe('buttonClass', () => {
  it('matches the primary button the forms used before E-012', () => {
    expect(set(buttonClass())).toEqual(
      set('h-12 rounded-xl bg-brand font-bold text-brand-ink transition-opacity hover:opacity-90 disabled:opacity-60'),
    )
  })
  it('adds w-full and extra classes', () => {
    expect(set(buttonClass({ block: true, className: 'px-6' }))).toContain('w-full')
    expect(set(buttonClass({ className: 'px-6' }))).toContain('px-6')
  })
})

describe('inputClass', () => {
  it('defaults to a 48px surface input', () => {
    expect(set(inputClass())).toEqual(set('h-12 rounded-xl border border-line bg-surface px-4 outline-none focus:border-brand'))
  })
  it('supports the small bg variant used in the enrol card', () => {
    expect(set(inputClass({ tone: 'bg', size: 'sm' }))).toEqual(
      set('h-11 text-sm rounded-xl border border-line bg-bg px-4 outline-none focus:border-brand'),
    )
  })
})
