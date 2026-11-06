import qrcode from 'qrcode-generator'

/**
 * QR code as an inline SVG string, generated on our server (no CDN, no image service). Black modules on white,
 * one path, quiet zone of 4 modules (the QR spec minimum) so phone cameras lock on in dark mode too.
 */
export function qrSvg(text: string): string {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  const q = 4
  let d = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`
  const size = n + q * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" aria-hidden="true"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
}
