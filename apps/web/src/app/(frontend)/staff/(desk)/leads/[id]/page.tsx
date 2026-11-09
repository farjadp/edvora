import { formatJalali, formatToman, rial } from '@edvora/core'
import { LEAD_LOST_REASON_LABELS_FA, formatJalaliDateTime, isClosedLead, isLostReason, type TimelineEvent } from '@edvora/core/crm'
import { toPersianDigits as fa } from '@edvora/core/digits'
import { LEAD_OUTCOME_LABELS_FA } from '@edvora/core/staff-goals'
import { cx } from '@edvora/ui'
import { focusRing } from '@edvora/ui/classes'
import { EmptyState, Panel, Pill } from '@edvora/ui/console'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CallLogForm } from '../../../../../../components/staff/crm/CallLogForm'
import { AssignForm, ClaimButton, MarkLostForm } from '../../../../../../components/staff/crm/LeadControls'
import { DeskPage, MainSide, PageHeader, consoleBtn } from '../../../../../../components/staff/Desk'
import { LEAD_STATUS, ORDER_STATUS, pill } from '../../../../../../lib/consoleLabels'
import { crmAccess, getLeadDetail } from '../../../../../../lib/crmDesk'
import { requireStaff } from '../../../../../../lib/staff'

export const metadata: Metadata = { title: 'سرنخ' }

type Props = { params: Promise<{ id: string }> }

const statusLabel = (s: string) => LEAD_STATUS[s]?.label ?? s

function eventText(e: TimelineEvent, name: (id: unknown) => string): { title: string; detail?: string | null; tone: 'brand' | 'info' | 'ok' | 'neutral' | 'warn' } {
  switch (e.kind) {
    case 'created':
      return { title: 'سرنخ ثبت شد', detail: e.source === 'direct' ? 'از فرم سایت' : `منبع: ${e.source}`, tone: 'brand' }
    case 'call':
      return { title: `تماس: ${LEAD_OUTCOME_LABELS_FA[e.outcome]}`, detail: [e.by ? name(e.by) : null, e.note].filter(Boolean).join(' · ') || null, tone: 'info' }
    case 'followUp':
      return { title: e.entry === 'status_changed' ? 'وضعیت بدون تماس تغییر کرد' : 'فقط تاریخ پیگیری جابه‌جا شد', detail: [e.by ? name(e.by) : null, e.note].filter(Boolean).join(' · ') || null, tone: 'neutral' }
    case 'status':
      return { title: `وضعیت: ${statusLabel(e.from)} ← ${statusLabel(e.to)}`, detail: e.by ? name(e.by) : null, tone: e.to === 'enrolled' ? 'ok' : e.to === 'lost' ? 'neutral' : 'warn' }
    case 'owner':
      if (e.to && e.by != null && String(e.by) === String(e.to)) return { title: `${name(e.to)} این سرنخ را برداشت`, tone: 'brand' }
      return { title: e.to ? `سپرده شد به ${name(e.to)}` : 'از مشاور برداشته شد', detail: e.by ? `توسط ${name(e.by)}` : null, tone: 'brand' }
    case 'order':
      return { title: `سفارش ${fa(e.orderId)}${e.courseTitle ? ` · ${e.courseTitle}` : ''}`, detail: `${pill(ORDER_STATUS, e.status).label} · ${formatToman(rial(e.total))}`, tone: e.status === 'paid' ? 'ok' : 'warn' }
  }
}

/** Lead page (E-015): what happened (timeline), what to do next (call log, quick actions). */
export default async function LeadPage({ params }: Props) {
  const raw = (await params).id
  const s = await requireStaff(`/staff/leads/${raw}`, 'leads')
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const a = await crmAccess(s)
  const d = await getLeadDetail(s, a, id)
  if (!d) notFound()
  const { lead, row, course, timeline, names } = d
  const st = pill(LEAD_STATUS, row.status)
  const name = (v: unknown) => names[String(v)] ?? '—'
  const closed = isClosedLead(row.status)
  const now = new Date()

  return (
    <DeskPage desk="leads">
      <div data-testid="lead-page" data-lead={lead.id} data-status={row.status} className="grid min-w-0 gap-6">
        <PageHeader
          eyebrow="مشتریان بالقوه"
          title={lead.name}
          subtitle={[course?.title, row.advisorName ? `مشاور: ${row.advisorName}` : 'بی‌مشاور'].filter(Boolean).join(' · ')}
          actions={
            <>
              <a href="/staff/leads" className={consoleBtn.secondary}>
                بازگشت به میز
              </a>
              <a href={`tel:${lead.phone}`} data-testid="call-link" className={consoleBtn.primary}>
                تماس با <span dir="ltr" className="font-latin">{lead.phone}</span>
              </a>
            </>
          }
        />

        <MainSide
          main={
            <>
              {d.canClaim ? (
                <Panel title="این سرنخ هنوز مشاور ندارد" headingId="h-claim">
                  <p className="mb-3 text-sm leading-7 text-muted">برای ثبت تماس، اول آن را بردارید تا به نام شما شود.</p>
                  <ClaimButton leadId={lead.id} name={lead.name} />
                </Panel>
              ) : null}
              {d.canWork ? (
                <section id="log" className="scroll-mt-24">
                  <Panel title="ثبت تماس" subtitle={row.nextFollowUpAt && !closed ? `پیگیری فعلی: ${formatJalaliDateTime(row.nextFollowUpAt)}` : undefined} headingId="h-log">
                    <CallLogForm leadId={lead.id} status={row.status} nowIso={now.toISOString()} />
                  </Panel>
                </section>
              ) : null}
              <Panel title="تاریخچه" subtitle="تازه‌ترین بالا" headingId="h-timeline">
                <ol data-testid="lead-timeline" className="grid gap-4">
                  {timeline.map((e, i) => {
                    const t = eventText(e, name)
                    return (
                      <li key={`${e.kind}-${e.at}-${i}`} data-kind={e.kind} className="flex gap-3">
                        <span aria-hidden className={cx('mt-2 size-2.5 shrink-0 rounded-full', t.tone === 'ok' ? 'bg-ok' : t.tone === 'info' ? 'bg-info' : t.tone === 'warn' ? 'bg-warn' : t.tone === 'brand' ? 'bg-brand' : 'bg-line-strong')} />
                        <div className="min-w-0">
                          <p className="font-bold">
                            {e.kind === 'order' ? (
                              <a href={`/staff/payments/orders/${e.orderId}`} className={cx('rounded-sm hover:text-brand-text', focusRing)}>
                                {t.title}
                              </a>
                            ) : (
                              t.title
                            )}
                          </p>
                          {t.detail ? <p className="text-sm leading-7 text-muted">{t.detail}</p> : null}
                          <p className="text-xs text-muted">{formatJalaliDateTime(e.at)}</p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </Panel>
            </>
          }
          side={
            <>
              <Panel title="مشخصات" headingId="h-info" chip={<Pill tone={st.tone}>{st.label}</Pill>}>
                <dl className="grid gap-3 text-sm">
                  <div>
                    <dt className="text-muted">موبایل</dt>
                    <dd dir="ltr" className="text-end font-latin">
                      {lead.phone}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">دوره</dt>
                    <dd>{course?.title ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">ثبت</dt>
                    <dd>{formatJalali(lead.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">منبع</dt>
                    <dd>{row.source === 'direct' ? 'فرم سایت' : row.source}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">پیگیری بعدی</dt>
                    <dd data-testid="lead-next">{row.nextFollowUpAt && !closed ? formatJalaliDateTime(row.nextFollowUpAt) : '—'}</dd>
                  </div>
                  {row.status === 'lost' && isLostReason(lead.lostReason) ? (
                    <div>
                      <dt className="text-muted">دلیل از دست رفتن</dt>
                      <dd>{LEAD_LOST_REASON_LABELS_FA[lead.lostReason]}</dd>
                    </div>
                  ) : null}
                  {lead.message ? (
                    <div>
                      <dt className="text-muted">پیام متقاضی</dt>
                      <dd className="whitespace-pre-line leading-7">{lead.message}</dd>
                    </div>
                  ) : null}
                </dl>
              </Panel>

              <Panel title="ثبت‌نام" headingId="h-convert">
                {course?.published ? (
                  <div className="grid gap-2 text-sm leading-7">
                    <p className="text-muted">صفحهٔ دوره همان صفحهٔ ثبت‌نام و پرداخت است. نشانی را برای متقاضی بفرستید.</p>
                    <a href={`/courses/${course.slug}`} target="_blank" rel="noopener" data-testid="convert-link" className={consoleBtn.secondary}>
                      صفحهٔ ثبت‌نام «{course.title}» <span aria-hidden>↗</span>
                    </a>
                  </div>
                ) : (
                  <EmptyState icon="course" title={course ? 'این دوره هنوز منتشر نشده است.' : 'دوره‌ای برای این سرنخ انتخاب نشده است.'} />
                )}
                {a.canCreateOrder ? (
                  <a href="/admin/collections/orders/create" className={cx(consoleBtn.ghost, 'mt-2')}>
                    ساختن سفارش در پنل مدیریت <span aria-hidden>↗</span>
                  </a>
                ) : null}
              </Panel>

              {d.advisors ? (
                <Panel title="مشاور" headingId="h-assign">
                  {d.advisors.length ? <AssignForm leadId={lead.id} current={row.advisorId} advisors={d.advisors} /> : <p className="text-sm text-muted">کسی در این آکادمی نمی‌تواند این سرنخ را بگیرد.</p>}
                </Panel>
              ) : null}

              {d.canWork && !closed ? (
                <Panel title="از دست رفت" subtitle="بدون ثبت تماس؛ ۳۰ روز بعد یک بار دیگر یادآوری می‌شود." headingId="h-lost">
                  <MarkLostForm leadId={lead.id} />
                </Panel>
              ) : null}
            </>
          }
        />
      </div>
    </DeskPage>
  )
}
