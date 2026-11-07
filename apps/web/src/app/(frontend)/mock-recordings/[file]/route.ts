import { env } from '../../../../env'

/**
 * The mock provider's "recording file" (LIVE_CLASS_PROVIDER=mock only): 2 MB of placeholder bytes served as MP4 so
 * the copy-to-storage job can be exercised offline. It is not a playable video. 404 with any real provider.
 */
export async function GET() {
  if (env().LIVE_CLASS_PROVIDER !== 'mock') return new Response('Not found', { status: 404 })
  const bytes = new Uint8Array(2 * 1024 * 1024).fill(0x2a)
  return new Response(bytes, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length), 'Cache-Control': 'no-store' } })
}
