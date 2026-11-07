import { formatJalali, toPersianDigits } from '@edvora/core'
import type { ImportWarning } from '@edvora/integrations/wordpress'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import {
  ChoicesForm,
  ConfirmImport,
  ConflictButtons,
  HeldPhoneForm,
  ProgressPoller,
  CancelImportButton,
  PurgeButton,
  ReplanButton,
  ResumeImportButton,
  RevokeButton,
  SkipHeldButton,
} from '../../../../../../components/staff/import/ImportForms'
import { btnSecondary, Card, ErrorText, linkClass, Notice } from '../../../../../../components/staff/ui'
import { getPayloadClient } from '../../../../../../lib/payload'
import { idOf } from '../../../../../../lib/ids'
import { canRunImport, requireImport } from '../../../../../../lib/wpimport/access'
import type { CommitSummary } from '../../../../../../lib/wpimport/commit'
import type { JobChoices } from '../../../../../../lib/wpimport/ctx'
import { ACTION_LABELS, ACTIONS, COLLECTION_LABELS, HELD_REASON_LABELS, MAPPER_LABELS, MODE_LABELS, SEVERITY_LABELS, STATUS_LABELS } from '../../../../../../lib/wpimport/labels'
import type { ImportReport } from '../../../../../../lib/wpimport/report'
import { connectionUsable, findJob } from '../../../../../../lib/wpimport/service'
import { IMPORT_CLAIM_PAGE } from '../../../../../../lib/wpimport/constants'

type Props = { params: Promise<{ job: string }>; searchParams: Promise<{ notice?: string }> }

export const metadata: Metadata = { title: 'انتقال از وردپرس' }

const fa = (n: number | null | undefined) => toPersianDigits(n ?? 0)

function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <Card className="grid gap-4">
      <h2 id={id} className="text-lg font-black">
        {title}
      </h2>
      {children}
    </Card>
  )
}

/** Counts table: one row per collection, one column per action (Persian digits). Scrolls inside itself at 375 px. */
function CountsTable({ counts, columns }: { counts: Partial<Record<string, Record<string, number>>>; columns: readonly string[] }) {
  // Fixed dependency order (jsonb does not keep key order).
  const rows = Object.keys(COLLECTION_LABELS)
    .map((c) => [c, counts[c]] as const)
    .filter(([, v]) => v && Object.values(v).some((n) => n > 0))
  if (!rows.length) return <p className="text-muted">چیزی برای انتقال پیدا نشد.</p>
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="جدول شمارش داده‌ها">
      <table className="w-full min-w-[34rem] text-sm" data-testid="counts-table">
        <thead>
          <tr className="border-b border-line text-muted">
            <th className="py-2 text-start font-medium">داده</th>
            {columns.map((c) => (
              <th key={c} className="px-2 py-2 text-center font-medium">
                {ACTION_LABELS[c] ?? c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([collection, v]) => (
            <tr key={collection} className="border-b border-line last:border-0" data-collection={collection}>
              <th className="py-2 text-start font-bold">{COLLECTION_LABELS[collection] ?? collection}</th>
              {columns.map((c) => (
                <td key={c} className="px-2 py-2 text-center" data-action={c}>
                  {v?.[c] ? fa(v[c]) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Warnings({ warnings, total }: { warnings: ImportWarning[]; total: number }) {
  if (!warnings.length) return <Notice tone="ok">هشداری نیست.</Notice>
  const bySeverity = (['blocking', 'warn', 'info'] as const).map((sev) => {
    const list = warnings.filter((w) => w.severity === sev)
    const byCode = new Map<string, ImportWarning[]>()
    for (const w of list) byCode.set(w.code, [...(byCode.get(w.code) ?? []), w])
    return { sev, list, byCode }
  })
  return (
    <div className="grid gap-3" data-testid="warnings">
      {bySeverity
        .filter((g) => g.list.length)
        .map((g) => (
          <details key={g.sev} open={g.sev === 'blocking'} className={`rounded-xl border p-4 ${g.sev === 'blocking' ? 'border-danger' : 'border-line'}`} data-severity={g.sev}>
            <summary className="cursor-pointer font-bold">
              {SEVERITY_LABELS[g.sev]} ({fa(g.list.length)})
            </summary>
            <ul className="mt-3 grid gap-3">
              {[...g.byCode].map(([code, list]) => (
                <li key={code} className="grid gap-1">
                  <p className="text-sm text-muted">
                    <span dir="ltr" className="font-latin">{code}</span> · {fa(list.length)} مورد
                  </p>
                  <ul className="grid list-disc gap-1 ps-5 text-sm leading-7">
                    {list.slice(0, 5).map((w, i) => (
                      <li key={`${w.wpId ?? ''}-${i}`}>{w.message}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </details>
        ))}
      {total > warnings.length ? <p className="text-sm text-muted">{fa(total - warnings.length)} هشدار دیگر در گزارش کامل هست.</p> : null}
    </div>
  )
}

function DryRunReport({ jobId, report, choices, run, claims }: { jobId: number; report: ImportReport; choices: JobChoices; run: boolean; claims: Claim[] }) {
  const lmsConflict = report.detected.includes('lifterlms') && report.detected.includes('tutor')
  const currentLms = choices.enabledMappers?.find((m) => m === 'lifterlms' || m === 'tutor') ?? null
  const approved = new Set(choices.approvedHosts ?? [])
  const total = (a: string) => Object.values(report.counts).reduce((n, v) => n + (v[a as keyof typeof v] ?? 0), 0)
  const confirmLines = [
    `${fa(total('create'))} مورد جدید ساخته می‌شود.`,
    `${fa(total('update'))} مورد به‌روز می‌شود و ${fa(total('unchanged'))} مورد بدون تغییر می‌ماند.`,
    `${fa(total('held'))} مورد نگه داشته و ${fa(total('skipped'))} مورد رد می‌شود.`,
    `${fa(report.redirectTotal)} تغییر مسیر از نشانی‌های قدیمی ساخته می‌شود.`,
  ]
  return (
    <>
      <Section title="سایت و افزونه‌ها">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">سایت</dt>
            <dd className="font-bold">
              {report.site.name ?? '—'} <span dir="ltr" className="font-latin font-normal text-muted">{report.site.homeUrl}</span>
            </dd>
          </div>
          <div>
            <dt className="text-muted">نسخه‌ها</dt>
            <dd dir="ltr" className="text-end font-latin sm:text-start">
              WordPress {report.site.wpVersion ?? '?'} · PHP {report.site.phpVersion ?? '?'}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">شناسایی شد</dt>
            <dd>
              <ul className="mt-1 flex flex-wrap gap-2" data-testid="detected">
                {['wp-core', ...report.detected.filter((d) => d !== 'wp-core')].map((m) => (
                  <li key={m} className="rounded-full border border-line px-3 py-1 text-sm">
                    {MAPPER_LABELS[m] ?? m}
                    {m === 'woocommerce' && report.hpos !== null ? ` · ${report.hpos ? 'HPOS' : 'سفارش‌های قدیمی'}` : ''}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">واحد پول</dt>
            <dd dir="ltr" className="text-end font-latin sm:text-start">
              {[report.currencies.woo && `Woo ${report.currencies.woo}`, report.currencies.lifterlms && `LifterLMS ${report.currencies.lifterlms}`, report.currencies.tutor && `Tutor ${report.currencies.tutor}`].filter(Boolean).join(' · ') || '—'}
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="چه چیزی منتقل می‌شود">
        <p className="text-sm leading-7 text-muted">این فقط پیش‌نمایش است؛ تا زمانی که «اجرای انتقال» را تأیید نکنید، چیزی در ادوورا نوشته نمی‌شود. مبلغ‌ها به ریال تبدیل شده‌اند.</p>
        <CountsTable counts={report.counts} columns={ACTIONS} />
        {Object.keys(report.notWritable).length ? (
          <Notice>
            {Object.entries(report.notWritable)
              .map(([c, n]) => `${fa(n)} ${COLLECTION_LABELS[c] ?? c}`)
              .join('، ')}{' '}
            فعلاً در ادوورا جایی ندارد و منتقل نمی‌شود (پس از افزوده شدن بخش صفحه‌ها می‌توانید انتقال را دوباره اجرا کنید).
          </Notice>
        ) : null}
        {Object.keys(report.notImported).length ? (
          <details className="text-sm">
            <summary className="cursor-pointer font-bold">منتقل نمی‌شود</summary>
            <ul className="mt-2 grid gap-1 ps-5 leading-7">
              {Object.entries(report.notImported).map(([k, n]) => (
                <li key={k}>
                  <span dir="ltr" className="font-latin">{k}</span>: {fa(n)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Section>

      <Section title="هشدارها">
        <Warnings warnings={report.warnings} total={report.warningTotal} />
      </Section>

      {lmsConflict || report.productCourseMap.length || report.media.hosts.some((h) => h.needsApproval) ? (
        <Section title="تصمیم‌های شما">
          <ChoicesForm
            jobId={jobId}
            lms={lmsConflict ? { conflict: true, current: currentLms } : null}
            products={report.productCourseMap.map((p) => ({ productWpId: p.productWpId, productTitle: p.productTitle, method: p.method, courseRefKey: p.courseRefKey, courseId: p.courseId, candidates: p.candidates, usage: p.usage }))}
            courseOptions={report.courseOptions}
            existingCourses={report.existingCourses}
            hosts={report.media.hosts.filter((h) => h.needsApproval).map((h) => ({ host: h.host, count: h.count, approved: approved.has(h.host.toLowerCase()) }))}
            disabled={!run}
          />
        </Section>
      ) : null}

      <HeldUsers jobId={jobId} report={report} choices={choices} run={run} purged={false} claims={claims} />

      {report.staffUsers.length ? (
        <Section title="مدیران و مدرسان وردپرس">
          <p className="text-sm leading-7 text-muted">این افراد کاربر عادی وارد می‌شوند. نقش‌ها را پس از انتقال دستی بدهید؛ کارکنان باید رمز تازه و ورود دومرحله‌ای تنظیم کنند.</p>
          <ul className="grid gap-1 ps-5 text-sm leading-7">
            {report.staffUsers.map((u) => (
              <li key={u.refKey}>
                {u.name ?? u.wpId} <span dir="ltr" className="font-latin text-muted">({u.wpRoles.join(', ')})</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title={`تغییر مسیرها (${fa(report.redirectTotal)})`}>
        <RedirectTable rows={report.redirects.slice(0, 15)} />
        <a href={`/staff/import/${jobId}/redirects.csv`} className={btnSecondary()}>
          دریافت فهرست کامل (CSV)
        </a>
      </Section>

      {run ? (
        <Section title="اجرا">
          <ConfirmImport jobId={jobId} lines={confirmLines} blocked={report.blocking} />
        </Section>
      ) : null}
    </>
  )
}

type Claim = { id: number; name: string; phone: string; message: string | null; createdAt: string }

/**
 * Held users (W8a/W8b/W23): add a phone (an existing account with that phone, e.g. a student who signed up again,
 * is linked — never by email), or skip; CSV for collecting phones; students' "I bought on the old site" requests.
 */
function HeldUsers({ jobId, report, choices, run, purged, claims }: { jobId: number; report: ImportReport; choices: JobChoices; run: boolean; purged: boolean; claims: Claim[] }) {
  const skipped = choices.skipUsers ?? []
  if (!report.heldUsers.length && !skipped.length && !claims.length) return null
  const canEdit = run && !purged
  return (
    <Section id="held" title={`کاربران نگه‌داشته (${fa(report.heldUsers.length)})`}>
      <p className="text-sm leading-7 text-muted">این افراد بدون شمارهٔ موبایل معتبر یا با شمارهٔ تکراری‌اند؛ تا شماره‌ای برایشان ثبت نشود، حساب و سفارش‌ها و ثبت‌نام‌هایشان ساخته نمی‌شود. هیچ دو نفری خودکار ادغام نمی‌شوند. اگر دانشجویی با شمارهٔ تازه در سایت ثبت‌نام کرده، همان شماره را اینجا وارد کنید تا سابقه‌اش به حسابش وصل شود.</p>
      {report.heldUsers.length ? (
        <a href={`/staff/import/${jobId}/held.csv`} className={btnSecondary()}>
          دریافت فهرست برای جمع‌آوری شماره (CSV)
        </a>
      ) : null}
      <ul className="grid gap-3" data-testid="held-users">
        {report.heldUsers.map((u) => (
          <li key={u.refKey} className="grid gap-2 rounded-xl border border-line p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <p className="font-bold">{u.name ?? `کاربر ${fa(Number(u.wpId))}`}</p>
              <p className="text-sm text-muted">
                {HELD_REASON_LABELS[u.reason] ?? u.reason}
                {u.phone ? ` · ${toPersianDigits(u.phone)}` : ''}
                {u.contactEmail ? (
                  <>
                    {' · '}
                    <span dir="ltr" className="font-latin">{u.contactEmail}</span>
                  </>
                ) : null}
              </p>
            </div>
            {canEdit ? (
              <div className="flex flex-wrap items-start gap-2">
                <HeldPhoneForm jobId={jobId} wpId={u.wpId} name={u.name ?? u.wpId} />
                <SkipHeldButton jobId={jobId} wpId={u.wpId} skipped={false} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {skipped.length ? (
        <div className="grid gap-2">
          <h3 className="font-bold">وارد نمی‌شوند</h3>
          <ul className="grid gap-2">
            {skipped.map((wpId) => (
              <li key={wpId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm">
                <span>کاربر وردپرس {fa(Number(wpId))}</span>
                {canEdit ? <SkipHeldButton jobId={jobId} wpId={wpId} skipped /> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {claims.length ? (
        <div className="grid gap-2" data-testid="import-claims">
          <h3 className="font-bold">درخواست‌های دانشجویان («در سایت قبلی خرید کرده‌ام»)</h3>
          <ul className="grid gap-2">
            {claims.map((c) => (
              <li key={c.id} className="grid gap-1 rounded-xl border border-line p-3 text-sm">
                <p className="font-bold">
                  {c.name} · <span dir="ltr">{toPersianDigits(c.phone)}</span>
                </p>
                {c.message ? <p className="leading-7 text-muted">{c.message}</p> : null}
                <p className="text-muted">{formatJalali(c.createdAt)}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  )
}

function RedirectTable({ rows }: { rows: { from: string; to: string }[] }) {
  if (!rows.length) return <p className="text-muted">تغییر مسیری لازم نیست.</p>
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="پیش‌نمایش تغییر مسیرها">
      <table className="w-full min-w-[28rem] text-sm" data-testid="redirects-preview">
        <thead>
          <tr className="border-b border-line text-muted">
            <th className="py-2 text-start font-medium">نشانی قدیمی</th>
            <th className="py-2 text-start font-medium">نشانی تازه</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.from} className="border-b border-line last:border-0">
              <td dir="ltr" className="py-2 text-end font-latin">{r.from}</td>
              <td dir="ltr" className="py-2 text-end font-latin">{r.to}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Summary({ jobId, summary, finishedAt, purgeAfter, purgedAt, run }: { jobId: number; summary: CommitSummary; finishedAt: string | null; purgeAfter: string | null; purgedAt: string | null; run: boolean }) {
  const open = summary.conflicts.filter((c) => !c.resolved)
  return (
    <>
      <Section title="نتیجهٔ انتقال">
        <Notice tone="ok">انتقال {finishedAt ? `در ${formatJalali(finishedAt, 'd MMMM yyyy، HH:mm')}` : ''} پایان یافت.</Notice>
        <CountsTable counts={summary.counts} columns={['create', 'update', 'attach', 'unchanged', 'conflict', 'held', 'skipped', 'failed']} />
        <p className="text-sm leading-7 text-muted">
          رسانه‌ها: {fa(summary.media.pulled)} فایل دریافت شد
          {summary.media.failed.length ? `، ${fa(summary.media.failed.length)} فایل دریافت نشد` : ''}
          {summary.media.skippedHosts.length ? `، فایل‌های دامنه‌های تأییدنشده دریافت نشدند` : ''}.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href={`/staff/import/${jobId}/redirects.csv`} className={btnSecondary()}>
            دریافت تغییر مسیرها (CSV)
          </a>
          <a href="/admin/collections/import-refs" className={btnSecondary()}>
            جزئیات در تنظیمات <span aria-hidden>↗</span>
          </a>
        </div>
      </Section>

      {summary.conflicts.length ? (
        <Section id="conflicts" title={`تعارض‌ها (${fa(open.length)} باز)`}>
          <p className="text-sm leading-7 text-muted">این موارد پس از انتقال قبلی در ادوورا ویرایش شده‌اند و بازنویسی نشدند. برای هر کدام تصمیم بگیرید.</p>
          <ul className="grid gap-3" data-testid="conflicts">
            {summary.conflicts.map((c) => (
              <li key={c.refKey} className="grid gap-2 rounded-xl border border-line p-4">
                <p className="font-bold">
                  {c.title || c.refKey} <span className="text-sm font-normal text-muted">· {COLLECTION_LABELS[c.collection] ?? c.collection}</span>
                </p>
                {c.resolved ? <p className="text-sm text-muted">{c.resolved === 'keep' ? 'نسخهٔ ادوورا ماند.' : 'نسخهٔ وردپرس جایگزین شد.'}</p> : run && c.collection !== 'users' && !purgedAt ? <ConflictButtons jobId={jobId} refKey={c.refKey} /> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {summary.failures.length || summary.media.failed.length ? (
        <Section title="خطاها">
          <ul className="grid gap-1 ps-5 text-sm leading-7">
            {summary.failures.slice(0, 50).map((f) => (
              <li key={f.refKey}>
                {COLLECTION_LABELS[f.collection] ?? f.collection}: <span dir="ltr" className="font-latin">{f.message}</span>
              </li>
            ))}
            {summary.media.failed.slice(0, 50).map((f) => (
              <li key={f.url}>
                <span dir="ltr" className="break-all font-latin">{f.url}</span> ({f.reason})
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="قدم‌های بعدی">
        <ol className="grid list-[persian] gap-1 ps-5 leading-8">
          <li>دوره‌های منتقل‌شده پیش‌نویس‌اند؛ قیمت و محتوا را بررسی و سپس منتشر کنید.</li>
          <li>به مدیران و مدرسان نقش بدهید.</li>
          <li>برای کاربران نگه‌داشته شماره جمع کنید و انتقال را دوباره اجرا کنید.</li>
          <li>جلسه‌هایی که ویدیوی آن‌ها دستی است را تکمیل کنید.</li>
          <li>دامنه را به ادوورا منتقل کنید؛ نشانی‌های قدیمی خودکار به صفحه‌های تازه می‌روند.</li>
        </ol>
      </Section>

      <Section title="دادهٔ خام">
        {purgedAt ? (
          <p className="text-muted">دادهٔ خام در {formatJalali(purgedAt)} حذف شد. گزارش و شمارش‌ها باقی است.</p>
        ) : (
          <>
            <p className="text-sm leading-7 text-muted">فایل خام سایت وردپرس در فضای خصوصی نگه داشته می‌شود و {purgeAfter ? `در ${formatJalali(purgeAfter)}` : 'پس از ۳۰ روز'} خودکار حذف می‌شود.</p>
            {run ? <PurgeButton jobId={jobId} /> : null}
          </>
        )}
      </Section>
    </>
  )
}

/** E-032 · one import: waiting for data → dry-run report → confirm → progress → summary. */
export default async function ImportJobPage({ params, searchParams }: Props) {
  const { job: raw } = await params
  const { notice } = await searchParams
  const s = await requireImport(`/staff/import/${raw}`)
  if (!/^\d{1,12}$/.test(raw)) notFound()
  const payload = await getPayloadClient()
  const job = await findJob(payload, s.tenant.id, Number(raw))
  if (!job) notFound()
  const run = canRunImport(s)
  const connId = idOf(job.connection)
  const connection = connId
    ? (await payload.find({ collection: 'import-connections', where: { and: [{ id: { equals: connId } }, { tenant: { equals: s.tenant.id } }] }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
    : undefined
  const report = (job.report ?? null) as ImportReport | null
  const summary = (job.summary ?? null) as CommitSummary | null
  const progress = (job.progress ?? {}) as { media?: { done: number; total: number }; records?: { done: number; total: number }; phase?: string }
  const choices = (job.choices ?? {}) as JobChoices
  // W23: students who signed up again and say they bought on the old site (asked from their dashboard).
  const claims: Claim[] = (
    await payload.find({ collection: 'leads', where: { and: [{ tenant: { equals: s.tenant.id } }, { 'source.page': { equals: IMPORT_CLAIM_PAGE } }] }, sort: '-createdAt', limit: 50, depth: 0, overrideAccess: true })
  ).docs.map((l) => ({ id: l.id, name: l.name, phone: l.phone, message: l.message ?? null, createdAt: l.createdAt }))
  const running = ['ingesting', 'ready', 'dry-run', 'media', 'committing'].includes(job.status)

  return (
    <div className="grid max-w-5xl gap-6">
      <header className="grid gap-2">
        <a href="/staff/import" className={`${linkClass} w-fit text-sm`}>
          → همهٔ انتقال‌ها
        </a>
        <h1 className="text-2xl font-black">{job.label ?? `انتقال ${fa(job.id)}`}</h1>
        <p className="text-muted" data-testid="job-status" data-status={job.status}>
          {STATUS_LABELS[job.status] ?? job.status} · {MODE_LABELS[job.mode] ?? job.mode} · {formatJalali(job.createdAt)}
        </p>
      </header>

      {notice === 'replanned' && job.status === 'awaiting-confirm' ? <Notice tone="ok">ثبت شد و گزارش تازه ساخته شد؛ برای اعمال، دوباره «اجرای انتقال» را تأیید کنید.</Notice> : null}
      {notice === 'saved' ? <Notice tone="ok">ثبت شد.</Notice> : null}
      {notice === 'changed' && job.status === 'awaiting-confirm' ? <Notice tone="warn">داده‌ها از زمان بررسی تغییر کرده‌اند؛ گزارش تازه را ببینید و دوباره تأیید کنید.</Notice> : null}
      {notice === 'blocking' && job.status === 'awaiting-confirm' ? <Notice tone="warn">پیش از اجرا باید موارد مسدودکننده را برطرف کنید.</Notice> : null}
      {job.status === 'rejected' || job.status === 'failed' ? <ErrorText>{(job.error ?? '').replace(/^[a-z_]+: /, '') || 'انتقال ناموفق بود.'}</ErrorText> : null}

      {job.status === 'draft' ? (
        <Section title="منتظر داده از وردپرس">
          <p className="leading-8 text-muted">در وردپرس، در «ابزارها › Edvora Migrator» نشانی و کد اتصال را وارد و «ارسال به ادوورا» را بزنید. پس از رسیدن داده، گزارش بررسی اینجا ساخته می‌شود.</p>
          {connection ? (
            <p className="text-sm text-muted">
              شناسهٔ اتصال: <span dir="ltr" className="font-latin">{connection.connectionId}</span> · {connectionUsable(connection) === 'ok' ? `اعتبار تا ${formatJalali(connection.expiresAt, 'd MMMM yyyy، HH:mm')}` : 'غیرفعال'}
            </p>
          ) : null}
          {connection && run && connectionUsable(connection) === 'ok' ? <RevokeButton connectionId={connection.connectionId} back={`/staff/import/${job.id}`} /> : null}
          <a href={`/staff/import/${job.id}`} className={btnSecondary()}>
            تازه‌سازی
          </a>
        </Section>
      ) : null}

      {running ? (
        <Section title={job.status === 'media' || job.status === 'committing' ? 'در حال انتقال' : 'در حال آماده‌سازی گزارش'}>
          <p className="text-sm leading-7 text-muted">می‌توانید این صفحه را ببندید؛ کار در پس‌زمینه ادامه دارد.</p>
          <ProgressPoller jobId={job.id} initial={{ status: job.status, ...progress }} />
        </Section>
      ) : null}

      {job.status === 'awaiting-confirm' && report ? <DryRunReport jobId={job.id} report={report} choices={choices} run={run} claims={claims} /> : null}

      {job.status === 'done' && summary ? <Summary jobId={job.id} summary={summary} finishedAt={job.finishedAt ?? null} purgeAfter={job.purgeAfter ?? null} purgedAt={job.purgedAt ?? null} run={run} /> : null}
      {job.status === 'done' && report ? <HeldUsers jobId={job.id} report={report} choices={choices} run={run} purged={Boolean(job.purgedAt)} claims={claims} /> : null}

      {run && ['draft', 'ingesting', 'ready', 'dry-run', 'awaiting-confirm', 'media', 'committing'].includes(job.status) ? (
        <Section title="لغو">
          <CancelImportButton jobId={job.id} />
        </Section>
      ) : null}
      {run && (job.status === 'failed' || job.status === 'cancelled') && !job.purgedAt ? (
        <Section title="ادامه">
          <p className="text-sm leading-7 text-muted">انتقال از آخرین دستهٔ ذخیره‌شده ادامه پیدا می‌کند؛ آنچه قبلاً وارد شده دوباره ساخته نمی‌شود.</p>
          <ResumeImportButton jobId={job.id} />
        </Section>
      ) : null}
      {run && job.status === 'done' && !job.purgedAt ? (
        <Section title="اجرای دوباره">
          <p className="text-sm leading-7 text-muted">پس از افزودن شماره برای کاربران نگه‌داشته، یا برای گرفتن تغییرات تازه، گزارش را دوباره بسازید و تأیید کنید. موارد تکراری دوباره ساخته نمی‌شوند.</p>
          <ReplanButton jobId={job.id} />
        </Section>
      ) : null}
    </div>
  )
}
