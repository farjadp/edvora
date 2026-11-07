/** Payload jobs queue used by the WordPress import tasks (ADR 011 §Resumability). */
export const IMPORT_QUEUE = 'wpimport'
/** Drafts per transaction (ADR 011 §Pipeline 6). */
export const COMMIT_BATCH = 200
/** Each task run works at most this long, then re-queues itself with its cursor. */
export const TASK_BUDGET_MS = 20_000
/** Raw bundles, pushed chunks, plan files and held PII are purged this long after the job finished. */
export const RETENTION_DAYS = 30
