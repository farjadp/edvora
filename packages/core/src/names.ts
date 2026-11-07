/**
 * Name used in the student greeting («سلام، …»).
 * Prefer the profile first name; else the full display name (never split it: «دانشجوی نمونه» must not become
 * «دانشجوی»); else null, and the UI greets without a name.
 */
export function greetingName(user: { firstName?: string | null; name?: string | null } | null | undefined): string | null {
  const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()
  return clean(user?.firstName) || clean(user?.name) || null
}
