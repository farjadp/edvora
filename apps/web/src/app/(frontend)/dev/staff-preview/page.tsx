import { notFound } from 'next/navigation'
import { PreviewClient } from './PreviewClient'

// TEMPORARY (E-022 ui-designer): visual check of every staff screen with fake props. tech-lead deletes this folder.
export default function StaffPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <PreviewClient />
}
