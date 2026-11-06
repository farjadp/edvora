import type { CollectionConfig } from 'payload'
import { anyone, staff } from '../access/roles'

/** Local disk in dev. Production: ArvanCloud Object Storage via the S3 adapter (see docs/adr/004). */
export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: { fa: 'رسانه', en: 'Media' }, plural: { fa: 'رسانه‌ها', en: 'Media' } },
  admin: { group: { fa: 'محتوا', en: 'Content' } },
  access: { read: anyone, create: staff, update: staff, delete: staff },
  fields: [{ name: 'alt', type: 'text', required: true, label: { fa: 'متن جایگزین', en: 'Alt text' } }],
  upload: {
    staticDir: 'media',
    mimeTypes: ['image/*', 'application/pdf'],
    imageSizes: [
      { name: 'card', width: 640, height: 360, position: 'centre' },
      { name: 'hero', width: 1600, height: 900, position: 'centre' },
    ],
  },
}
