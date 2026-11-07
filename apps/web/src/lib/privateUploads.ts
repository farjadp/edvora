import path from 'node:path'

/**
 * Root folder for private uploads (ADR 009), outside any public path. Kept in its own module with no Payload or
 * `@edvora/core` imports so storage helpers (and their tests) don't load the collection config graph.
 */
export function privateUploadsDir(): string {
  const dir = process.env.PRIVATE_UPLOADS_DIR?.trim() || 'private-uploads/submission-files'
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir)
}
