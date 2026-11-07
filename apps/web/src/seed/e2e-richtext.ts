/**
 * E2E helper (demo tenant only): fills long-form fields with a known rich-text document (headings, bold/italic, lists,
 * checklist, external + internal links, table, image) through the Payload local API, so e2e can assert the public
 * renderer. Idempotent. Refuses anything but the demo tenant.
 *
 *   pnpm --filter @edvora/web exec tsx --env-file=.env src/seed/e2e-richtext.ts            # content
 *   pnpm --filter @edvora/web exec tsx --env-file=.env src/seed/e2e-richtext.ts <phone>    # graded feedback
 */
import { getPayload } from 'payload'
import config from '../payload.config'

type N = Record<string, unknown>
const text = (t: string, format = 0): N => ({ type: 'text', version: 1, text: t, format, detail: 0, mode: 'normal', style: '' })
const block = (type: string, children: N[], extra: N = {}): N => ({ type, version: 1, children, direction: 'rtl', format: '', indent: 0, ...extra })
const para = (...c: N[]) => block('paragraph', c, { textFormat: 0, textStyle: '' })
const heading = (tag: string, t: string) => block('heading', [text(t)], { tag })
const li = (t: string, extra: N = {}): N => block('listitem', [text(t)], { value: 1, ...extra })
const list = (listType: string, tag: string, items: N[]) => block('list', items, { listType, tag, start: 1 })
const cell = (t: string, headerState: number): N => block('tablecell', [para(text(t))], { headerState, colSpan: 1, rowSpan: 1 })

export function richDoc(courseId: number, mediaId: number, marker: string): N {
  return {
    root: block('root', [
      heading('h2', `${marker} سرفصل`),
      para(text('متن '), text('پررنگ', 1), text(' و '), text('کج', 2), text('.')),
      heading('h3', 'زیرسرفصل'),
      list('bullet', 'ul', [li('مورد نقطه‌ای')]),
      list('number', 'ol', [li('گام یکم'), li('گام دوم', { value: 2 })]),
      list('check', 'ul', [li('انجام‌شده', { checked: true }), li('انجام‌نشده', { value: 2, checked: false })]),
      para({
        type: 'link',
        version: 3,
        children: [text('لینک بیرونی')],
        direction: 'rtl',
        format: '',
        indent: 0,
        fields: { linkType: 'custom', url: 'https://example.com/fa', newTab: true },
      }),
      para({
        type: 'link',
        version: 3,
        children: [text('لینک دوره')],
        direction: 'rtl',
        format: '',
        indent: 0,
        fields: { linkType: 'internal', newTab: false, doc: { relationTo: 'courses', value: courseId } },
      }),
      block('table', [block('tablerow', [cell('ستون الف', 1), cell('ستون ب', 1)]), block('tablerow', [cell('۱۰۰', 0), cell('۲۰۰', 0)])]),
      { type: 'upload', version: 3, relationTo: 'media', value: mediaId, fields: null, format: '' },
    ]),
  }
}

async function main() {
  const payload = await getPayload({ config })
  const studentPhone = process.argv[2]
  const first = async <T>(p: Promise<{ docs: T[] }>, what: string): Promise<T> => {
    const d = (await p).docs[0]
    if (!d) throw new Error(`Not found: ${what}`)
    return d
  }
  const tenant = await first(payload.find({ collection: 'tenants', where: { slug: { equals: 'demo' } }, limit: 1, overrideAccess: true }), 'demo tenant')
  const t = { tenant: { equals: tenant.id } }
  const media = await first(payload.find({ collection: 'media', where: { and: [t, { alt: { equals: 'نمونه تصویر demo' } }] }, limit: 1, overrideAccess: true }), 'demo media')
  const course = await first(payload.find({ collection: 'courses', where: { and: [t, { slug: { equals: 'demo-program' } }] }, limit: 1, depth: 0, overrideAccess: true }), 'demo course')
  const doc = (marker: string) => richDoc(course.id, media.id, marker)

  if (studentPhone) {
    // Grading feedback as the demo instructor (access control on), rich text.
    const student = await first(payload.find({ collection: 'users', where: { phone: { equals: studentPhone } }, limit: 1, overrideAccess: true }), `student ${studentPhone}`)
    const grader = await first(payload.find({ collection: 'users', where: { email: { equals: 'instructor@demo.edvora.local' } }, limit: 1, overrideAccess: true }), 'demo instructor')
    const assignment = await first(payload.find({ collection: 'assignments', where: t, limit: 1, depth: 0, overrideAccess: true }), 'assignment')
    const submission = await first(payload.find({ collection: 'submissions', where: { and: [{ assignment: { equals: assignment.id } }, { user: { equals: student.id } }] }, limit: 1, overrideAccess: true }), 'submission')
    await payload.update({ collection: 'submissions', id: submission.id, data: { scoreInput: '10', feedback: doc('بازخورد') }, user: { ...grader, collection: 'users' }, overrideAccess: false })
    console.log(JSON.stringify({ ok: true, feedbackFor: submission.id }))
    process.exit(0)
  }

  await payload.update({ collection: 'tenants', id: tenant.id, data: { manifesto: doc('مانیفست') }, overrideAccess: true })
  const syllabus = (course.syllabus ?? []).map((row, i) => (i === 0 ? { ...row, description: doc('سرفصل‌درس') } : row))
  const faq = (course.faq ?? []).map((row, i) => (i === 0 ? { ...row, answer: doc('پاسخ') } : row))
  await payload.update({ collection: 'courses', id: course.id, data: { syllabus, faq }, overrideAccess: true, depth: 0 })
  const lesson = await first(payload.find({ collection: 'lessons', where: { and: [t, { title: { equals: 'منابع تکمیلی' } }] }, limit: 1, depth: 0, overrideAccess: true }), 'lesson')
  await payload.update({ collection: 'lessons', id: lesson.id, data: { notes: doc('یادداشت') }, overrideAccess: true, depth: 0 })
  // The seeded course's quiz (other demo data, e.g. a WordPress import, may add quizzes).
  const quiz = await first(payload.find({ collection: 'quizzes', where: { and: [t, { course: { equals: course.id } }] }, sort: 'id', limit: 1, depth: 0, overrideAccess: true }), 'quiz')
  await payload.update({ collection: 'quizzes', id: quiz.id, data: { description: doc('توضیح‌آزمون') }, overrideAccess: true, depth: 0 })
  const q = await first(payload.find({ collection: 'questions', where: { and: [t, { text: { contains: 'جزو چهار بخش' } }] }, limit: 1, depth: 0, overrideAccess: true }), 'question')
  await payload.update({ collection: 'questions', id: q.id, data: { explanation: doc('توضیح‌پاسخ') }, overrideAccess: true, depth: 0 })
  const assignment = await first(payload.find({ collection: 'assignments', where: t, limit: 1, depth: 0, overrideAccess: true }), 'assignment')
  await payload.update({ collection: 'assignments', id: assignment.id, data: { description: doc('توضیح‌تکلیف') }, overrideAccess: true, depth: 0 })
  console.log(JSON.stringify({ ok: true, course: course.id, media: media.id, lesson: lesson.id, quiz: quiz.id, question: q.id, assignment: assignment.id }))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
