import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { IntegrationError } from '../errors'
import type { ObjectStorage } from './types'

export type S3StorageOptions = {
  /** e.g. `https://s3.ir-thr-at1.arvanstorage.ir` (Arvan Simin) or `http://localhost:9010` (local SeaweedFS). */
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  /** Arvan's SDK examples use `default`. */
  region?: string
}

/**
 * S3-compatible storage (ArvanCloud docs: https://docs.arvancloud.ir/en/developer-tools/sdk/object-storage).
 * Path-style addressing and explicit credentials, so the SDK never contacts AWS (no IMDS, no virtual-host DNS).
 * Checksums only when required: newer SDK defaults (CRC32 on every request) are not supported by every S3 clone.
 */
export function createS3Storage(opts: S3StorageOptions): ObjectStorage {
  for (const [k, v] of Object.entries({ endpoint: opts.endpoint, bucket: opts.bucket, accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey })) {
    if (!v) throw new IntegrationError('storage:s3', `S3 ${k} is missing`)
  }
  const client = new S3Client({
    endpoint: opts.endpoint,
    region: opts.region ?? 'default',
    forcePathStyle: true,
    credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    maxAttempts: 3,
  })
  const wrap = (what: string, err: unknown): never => {
    throw new IntegrationError('storage:s3', `${what} failed: ${err instanceof Error ? err.message : 'unknown error'}`)
  }

  return {
    name: 's3',
    async putObject({ key, body, contentType, size }) {
      try {
        // Multipart in 16 MB parts, 4 at a time: a 3-hour MP4 (1–3 GB) never sits in memory.
        const upload = new Upload({
          client,
          params: { Bucket: opts.bucket, Key: key, Body: body, ContentType: contentType, ...(size ? { ContentLength: size } : {}) },
          partSize: 16 * 1024 * 1024,
          queueSize: 4,
        })
        await upload.done()
      } catch (err) {
        wrap(`upload ${key}`, err)
      }
      const head = await this.headObject(key)
      if (!head) throw new IntegrationError('storage:s3', `upload ${key} not visible after completion`)
      return head
    },
    async headObject(key) {
      try {
        const r = await client.send(new HeadObjectCommand({ Bucket: opts.bucket, Key: key }))
        return { key, size: Number(r.ContentLength ?? 0), contentType: r.ContentType }
      } catch (err) {
        if (err instanceof S3ServiceException && (err.$metadata.httpStatusCode === 404 || err.name === 'NotFound')) return null
        return wrap(`head ${key}`, err)
      }
    },
    async signedGetUrl(key, o = {}) {
      const cmd = new GetObjectCommand({
        Bucket: opts.bucket,
        Key: key,
        ...(o.downloadName ? { ResponseContentDisposition: `inline; filename="${o.downloadName.replace(/[^A-Za-z0-9._-]/g, '_')}"` } : {}),
      })
      return getSignedUrl(client, cmd, { expiresIn: Math.min(Math.max(o.expiresInSec ?? 300, 30), 3600) })
    },
    async deleteObject(key) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: opts.bucket, Key: key }))
      } catch (err) {
        wrap(`delete ${key}`, err)
      }
    },
  }
}

/** Creates the bucket if it doesn't exist (local setup and first deploy). Production buckets stay private. */
export async function ensureS3Bucket(opts: S3StorageOptions): Promise<'exists' | 'created'> {
  const client = new S3Client({
    endpoint: opts.endpoint,
    region: opts.region ?? 'default',
    forcePathStyle: true,
    credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  try {
    await client.send(new HeadBucketCommand({ Bucket: opts.bucket }))
    return 'exists'
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: opts.bucket }))
    return 'created'
  }
}
