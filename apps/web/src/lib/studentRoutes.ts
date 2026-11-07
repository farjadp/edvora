/**
 * Student panel + student login. These pages get the Edvora palette (turquoise/petrol) through the `[data-student]`
 * tokens in `@edvora/ui/console-tokens.css`; the public site keeps the academy's own colours.
 */
const STUDENT_ROOTS = ['/login', '/dashboard', '/learn'] as const

export function isStudentRoute(pathname: string): boolean {
  return STUDENT_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`))
}
