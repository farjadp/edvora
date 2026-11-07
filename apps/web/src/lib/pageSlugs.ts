/**
 * Content-page slugs (E-030 Pages), shared by the collection, the catch-all route and the WordPress importer.
 * A page lives at `/<slug>`, served by `app/(frontend)/[...wpPath]` — so it must not collide with a real route
 * (static routes win and the page would never show).
 */
export const RESERVED_PAGE_SLUGS: ReadonlySet<string> = new Set([
  'admin', 'api', 'courses', 'dashboard', 'design-preview', 'faculty', 'files', 'journal', 'learn', 'login', 'logout',
  'pay', 'payments', 'staff', 'verify',
])

/** Lowercase letters in any script (WordPress pages often have Persian slugs), digits and dashes. */
export const isPageSlugShape = (s: string): boolean => /^[\p{L}\p{N}-]+$/u.test(s) && s === s.toLowerCase()

export const isReservedPageSlug = (s: string): boolean => RESERVED_PAGE_SLUGS.has(s)
