import type { CollectionConfig } from 'payload'
import { allow, allowCreate, guard, nobody } from '../access/permissions'
import { mediaRead, sandboxUploadQuota } from '../access/sandbox'
import { auditChange } from '../hooks/audit'
import { sourceUrlField } from './fields'

/**
 * Local disk in dev. Production: ArvanCloud Object Storage via the S3 adapter (see docs/adr/004).
 * MEDIA_DIR moves the folder (Railway demo: /data/media on the web volume, so uploads survive redeploys).
 */
export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: { fa: 'رسانه', en: 'Media' }, plural: { fa: 'رسانه‌ها', en: 'Media' } },
  admin: { group: { fa: 'محتوا', en: 'Content' } },
  // E-029 (BUG-4): sandbox media only inside that sandbox; real academies unchanged (public).
  access: { read: mediaRead, create: allowCreate('media.upload'), update: allow('media.upload'), delete: nobody },
  hooks: {
    beforeChange: [guard({ create: ['media.upload'], update: ['media.upload'] }), sandboxUploadQuota],
    afterChange: [auditChange('media')],
  },
  fields: [{ name: 'alt', type: 'text', required: true, label: { fa: 'متن جایگزین', en: 'Alt text' } }, sourceUrlField],
  upload: {
    staticDir: process.env.MEDIA_DIR || 'media',
    mimeTypes: ['image/*', 'application/pdf'],
    imageSizes: [
      { name: 'card', width: 640, height: 360, position: 'centre' },
      { name: 'hero', width: 1600, height: 900, position: 'centre' },
    ],
  },
}
