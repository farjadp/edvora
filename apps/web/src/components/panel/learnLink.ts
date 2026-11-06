/** Small shared helpers for the student panel. */
export const firstName = (name: string | null | undefined): string => (name ?? '').trim().split(/\s+/)[0] || 'دانشجو'
