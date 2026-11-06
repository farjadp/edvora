import { ValidationError } from 'payload'

/** Throws Payload's field-level validation error (shown next to each field in /admin), or does nothing. */
export function throwFieldErrors(collection: string, errors: readonly { path: string; message: string }[]): void {
  if (errors.length > 0) throw new ValidationError({ collection, errors: errors.map((e) => ({ path: e.path, message: e.message })) })
}

export const TEHRAN_TZ = 'Asia/Tehran'
