import 'server-only'
import { detectSubmissionFile, SUBMISSION_LIMITS, SUBMISSION_MIME, submissionWindow, toPersianDigits } from '@edvora/core'
import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import type { Submission } from '../payload-types'
import { jalaliDateTime } from '../components/learn/labels'
import { idOf } from './ids'
import type { StudentCourse } from './student'

type Result = { ok: true; message: string; submission: Submission } | { ok: false; message: string }

const MB = 1024 * 1024

/**
 * C2/C2f: save (create or replace) the student's submission. All checks are on the server: enrollment (via ctx),
 * assignment of this academy + course + cohort, drip, deadline, graded, file count/size/type by content.
 * Idempotent per assignment + student (unique index; a racing double-submit updates the same row).
 */
export async function saveSubmission(
  { payload }: { payload: Payload },
  input: { ctx: StudentCourse; assignmentId: number; text: string; files: File[]; removeFileIds: number[]; now?: Date },
): Promise<Result> {
  const { ctx } = input
  const now = input.now ?? new Date()
  const status = ctx.state.assignments.find((s) => s.assignment.id === input.assignmentId)
  if (!status) return { ok: false, message: 'این تکلیف در دسترس نیست.' }
  if (!status.released) return { ok: false, message: 'این تکلیف با باز شدن جلسه‌اش در دسترس قرار می‌گیرد.' }
  const { assignment } = status

  // Fresh read: a grader may have graded since the page loaded.
  const existingRes = await payload.find({
    collection: 'submissions',
    where: { and: [{ assignment: { equals: assignment.id } }, { user: { equals: ctx.user.id } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const existing = existingRes.docs[0] ?? null
  const window = submissionWindow({ dueAt: assignment.dueAt, allowLate: assignment.allowLate, graded: existing?.score != null, now })
  if (!window.ok) {
    return {
      ok: false,
      message: window.reason === 'graded' ? 'این تکلیف نمره گرفته است و دیگر قابل تغییر نیست.' : `مهلت تحویل ${jalaliDateTime(assignment.dueAt)} تمام شده است.`,
    }
  }

  const keep = (existing?.files ?? []).map((f) => idOf(f)!).filter((id) => !input.removeFileIds.includes(id))
  if (keep.length + input.files.length > SUBMISSION_LIMITS.maxFiles) {
    return { ok: false, message: `حداکثر ${toPersianDigits(SUBMISSION_LIMITS.maxFiles)} فایل می‌توانید بفرستید.` }
  }
  const prepared: { data: Buffer; kind: keyof typeof SUBMISSION_MIME; size: number }[] = []
  for (const f of input.files) {
    if (f.size > SUBMISSION_LIMITS.maxBytes) return { ok: false, message: `فایل «${f.name}» بزرگ‌تر از ${toPersianDigits(SUBMISSION_LIMITS.maxBytes / MB)} مگابایت است.` }
    const data = Buffer.from(await f.arrayBuffer())
    const kind = detectSubmissionFile(data, f.name)
    if (!kind) return { ok: false, message: `نوع فایل «${f.name}» پذیرفته نیست. فقط PDF، DOCX، JPG یا PNG.` }
    prepared.push({ data, kind, size: data.length })
  }
  const text = input.text.trim()
  if (!text && keep.length + prepared.length === 0) return { ok: false, message: 'متن پاسخ یا دست‌کم یک فایل لازم است.' }

  const tenantId = ctx.tenant.id
  const courseId = ctx.course.id
  const cohortId = idOf(ctx.state.enrollment.cohort)
  const created: number[] = []
  for (const p of prepared) {
    const doc = await payload.create({
      collection: 'submission-files',
      overrideAccess: true,
      data: { tenant: tenantId, owner: ctx.user.id, course: courseId, cohort: cohortId, kind: p.kind },
      file: { data: p.data, mimetype: SUBMISSION_MIME[p.kind], name: `${randomUUID()}.${p.kind}`, size: p.size },
    })
    created.push(doc.id)
  }

  const data = {
    tenant: tenantId,
    assignment: assignment.id,
    user: ctx.user.id,
    enrollment: ctx.state.enrollment.id,
    course: courseId,
    cohort: cohortId,
    text: text || null,
    files: [...keep, ...created],
    submittedAt: now.toISOString(),
    late: window.late,
  }
  const save = async (id: number | null) =>
    id ? payload.update({ collection: 'submissions', id, overrideAccess: true, data }) : payload.create({ collection: 'submissions', overrideAccess: true, data })
  let submission: Submission
  try {
    submission = await save(existing?.id ?? null)
  } catch (err) {
    // Double click / retry: the unique (assignment, user) index stopped a second row — update the first one.
    const again = await payload.find({ collection: 'submissions', where: { and: [{ assignment: { equals: assignment.id } }, { user: { equals: ctx.user.id } }] }, limit: 1, depth: 0, overrideAccess: true })
    if (!again.docs[0]) throw err
    submission = await save(again.docs[0].id)
  }
  return { ok: true, message: `تحویل شد — ${jalaliDateTime(now)}`, submission }
}
