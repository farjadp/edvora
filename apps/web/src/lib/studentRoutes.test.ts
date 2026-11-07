import { describe, expect, it } from 'vitest'
import { isStudentRoute } from './studentRoutes'

describe('isStudentRoute', () => {
  it('covers the student panel and student login', () => {
    for (const p of ['/login', '/dashboard', '/dashboard/certificates/12', '/learn/brand-101', '/learn/brand-101/lesson-1'])
      expect(isStudentRoute(p)).toBe(true)
  })
  it('leaves the public site and staff alone', () => {
    for (const p of ['/', '/courses/brand-101', '/verify', '/staff', '/staff/login', '/loginx', '/learning', '/pay/3'])
      expect(isStudentRoute(p)).toBe(false)
  })
})
