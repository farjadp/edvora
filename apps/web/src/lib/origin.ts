import 'server-only'
import { headers } from 'next/headers'
import { env } from '../env'

/**
 * Origin of the current request (each academy has its own domain), so gateway callbacks
 * and links return to the same academy. Falls back to NEXT_PUBLIC_SITE_URL.
 */
export async function getRequestOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return env().NEXT_PUBLIC_SITE_URL
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.includes('.localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}
