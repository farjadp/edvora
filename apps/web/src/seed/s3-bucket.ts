/**
 * E-017: creates the private bucket for recordings and media if it is missing.
 * Run: pnpm --filter @edvora/web exec tsx --env-file=.env src/seed/s3-bucket.ts
 */
import { ensureS3Bucket } from '@edvora/integrations/storage'

const e = process.env
if (e.STORAGE_PROVIDER !== 's3') {
  console.info('STORAGE_PROVIDER is not s3: nothing to do')
  process.exit(0)
}
ensureS3Bucket({ endpoint: e.S3_ENDPOINT ?? '', bucket: e.S3_BUCKET ?? '', accessKeyId: e.S3_ACCESS_KEY_ID ?? '', secretAccessKey: e.S3_SECRET_ACCESS_KEY ?? '', region: e.S3_REGION || 'default' })
  .then((r) => console.info(`bucket ${e.S3_BUCKET}: ${r}`))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
