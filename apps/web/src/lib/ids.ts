/** Payload relationships come back as an id or a populated doc depending on depth. */
export function idOf(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  if (typeof value === 'object' && 'id' in value) return idOf((value as { id: unknown }).id)
  return null
}

export function docOf<T extends object>(value: number | T | null | undefined): T | null {
  return value && typeof value === 'object' ? value : null
}
