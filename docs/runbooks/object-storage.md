# Runbook: object storage (E-017)

One **private** S3-compatible bucket per Edvora instance. Keys start with the tenant id:
`<tenantId>/recordings/<sessionId>/<recordingId>.mp4`, and Media under `media/` (Payload plugin).
Nothing in the bucket is public. Students get 5-minute signed links from `/live/<id>/recording/<rid>`, after
Edvora has checked their enrollment and cohort. Media is served through Payload's own access-controlled URLs.

## Production: ArvanCloud Object Storage
1. In the Arvan panel, create a bucket (e.g. `edvora-iba`) in the Simin region and keep it **private**. Create an
   access key limited to that bucket.
2. Set these on the instance:
   ```
   STORAGE_PROVIDER=s3
   S3_ENDPOINT=https://s3.ir-thr-at1.arvanstorage.ir
   S3_BUCKET=edvora-iba
   S3_ACCESS_KEY_ID=…
   S3_SECRET_ACCESS_KEY=…
   S3_REGION=default
   S3_MEDIA=true
   ```
3. Check: `curl -s -o /dev/null -w '%{http_code}' https://s3.ir-thr-at1.arvanstorage.ir/edvora-iba/` must answer 403.
4. Cost (App. D §3.1 of the live-class research): the Growth plan (۱٫۸ میلیون تومان a month) covers 500 GB and
   2 TB of downloads. One year of recordings for a 200-student academy is about 0.6 TB.
5. **Turning on `S3_MEDIA` changes the schema.** Payload's S3 plugin adds two columns to `media` (`prefix`,
   `_objectKey`), and only while it is enabled. Committed migrations are made with it **off**, which is the default
   and what CI runs. Before the first deploy with `S3_MEDIA=true`, decide whether Media lives in S3 permanently. If
   yes, set `S3_MEDIA=true` in the dev `.env`, run `payload migrate:create media_s3`, commit it, and keep it on from
   then on, in CI too. Toggling it back and forth makes migrations add and drop those columns.
6. Turning on `S3_MEDIA` doesn't move files that are already on local disk. Copy `apps/web/media/*` to `media/`
   in the bucket before switching.

## Local
`docker compose -f infra/docker/compose.local.yml up -d s3` starts SeaweedFS (Apache-2.0) on `http://localhost:9010`.
MinIO no longer publishes images. The keys are `edvora` / `edvora-local-secret` (`infra/docker/seaweedfs-s3.json`),
and unsigned requests get 403, as on Arvan. Create the bucket with
`pnpm --filter @edvora/web exec tsx --env-file=.env src/seed/s3-bucket.ts`.
The opt-in integration test:
`S3_TEST_ENDPOINT=http://localhost:9010 pnpm --filter @edvora/integrations test`.

## Recording copy (D4)
- `recording.ready` from the provider → the row is marked `ready` → after the response is sent, the MP4 streams from
  the provider into the bucket (16 MB parts) → `copied`.
- BBB publishes `presentation` before `video`. If the MP4 isn't there yet the row shows `waiting`, and the host
  presses «کپی دوباره» on `/staff/teaching`.
- Failures are stored on the row (`error`), and the host can retry. There is no automatic retry until the job
  worker lands (E-016).
