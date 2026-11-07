/**
 * Payload jobs-queue tasks for the WordPress import (ADR 011 §Resumability). Each run works within TASK_BUDGET_MS
 * and re-queues itself with the cursor saved on the import job, so a closed admin tab or a restart never stalls an
 * import. Imported by payload.config.ts: keep this file free of Next-only imports.
 */
import type { Payload, TaskConfig } from 'payload'
import { IMPORT_QUEUE, TASK_BUDGET_MS } from './constants'
import { purgeJob, runMediaPhase, runRecordsPhase } from './commit'

export { IMPORT_QUEUE }

const input = [
  { name: 'jobId', type: 'number', required: true },
  { name: 'tenantId', type: 'number', required: true },
] as const

type Input = { jobId: number; tenantId: number }

async function requeue(payload: Payload, task: 'importMediaBatch' | 'importCommitBatch', i: Input) {
  await payload.jobs.queue({ task, input: i, queue: IMPORT_QUEUE })
}

async function markFailed(payload: Payload, i: Partial<Input>, message: string) {
  if (!i.jobId || !i.tenantId) return
  const res = await payload.find({ collection: 'import-jobs', where: { and: [{ id: { equals: i.jobId } }, { tenant: { equals: i.tenantId } }] }, limit: 1, depth: 0, overrideAccess: true })
  const job = res.docs[0]
  if (!job || job.status === 'done') return
  await payload.update({ collection: 'import-jobs', id: job.id, overrideAccess: true, data: { status: 'failed', error: message.slice(0, 300) } })
}

export const importTasks: TaskConfig[] = [
  {
    slug: 'importMediaBatch',
    label: 'WordPress import: media',
    inputSchema: [...input],
    retries: 2,
    handler: async ({ input: raw, req }) => {
      const i = raw as Input
      const deadline = Date.now() + TASK_BUDGET_MS
      const more = await runMediaPhase(req.payload, i.jobId, i.tenantId, deadline)
      if (more) await requeue(req.payload, 'importMediaBatch', i)
      // Media done: continue with records in the same run while time is left.
      else if (await runRecordsPhase(req.payload, i.jobId, i.tenantId, deadline)) await requeue(req.payload, 'importCommitBatch', i)
      return { output: {} }
    },
    onFail: async ({ input: raw, req }) => markFailed(req.payload, (raw ?? {}) as Partial<Input>, 'media phase failed'),
  },
  {
    slug: 'importCommitBatch',
    label: 'WordPress import: records',
    inputSchema: [...input],
    retries: 2,
    handler: async ({ input: raw, req }) => {
      const i = raw as Input
      if (await runRecordsPhase(req.payload, i.jobId, i.tenantId, Date.now() + TASK_BUDGET_MS)) await requeue(req.payload, 'importCommitBatch', i)
      return { output: {} }
    },
    onFail: async ({ input: raw, req }) => markFailed(req.payload, (raw ?? {}) as Partial<Input>, 'commit failed; resume re-runs from the last saved batch'),
  },
  {
    slug: 'importPurge',
    label: 'WordPress import: purge raw data',
    inputSchema: [...input],
    retries: 3,
    handler: async ({ input: raw, req }) => {
      const i = raw as Input
      await purgeJob(req.payload, i.jobId, i.tenantId)
      return { output: {} }
    },
  },
]
