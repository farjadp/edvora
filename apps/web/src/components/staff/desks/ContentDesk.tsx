import { formatJalali } from '@edvora/core'
import { DataTable, EmptyState, EntityCell, FilterBar, FilterSearch, FilterSelect, KpiCard, KpiGrid, Pagination, Panel, Pill, QuickActions, type Column } from '@edvora/ui/console'
import type { PayloadRequest, Where } from 'payload'
import { PERIOD_DAYS, PAGE_SIZE, count, fa, one, pageParam, pagerOf, sortHref, sortOf, staffAccess, staffCtx } from '../../../lib/consoleData'
import type { StaffSession } from '../../../lib/staff'
import type { Post, User } from '../../../payload-types'
import { DeskPage, MainSide, PageHeader, consoleBtn } from '../Desk'

const BASE = '/staff/content'
type Props = { s: StaffSession & { user: User; req: PayloadRequest }; sp: Record<string, string | string[] | undefined> }

const isLive = (p: Post, now: number) => Boolean(p.publishedAt) && new Date(p.publishedAt!).getTime() <= now

/** Content desk: posts, testimonials, media. A post is "published" when its publish date has passed. */
export async function ContentDesk({ s, sp }: Props) {
  const c = staffCtx(s)
  const now = Date.now()
  const q = one(sp.q).trim()
  const state = one(sp.state)
  const page = pageParam(sp.page)
  const sorted = sortOf(one(sp.sort), ['publishedAt', 'title', 'updatedAt'], '-updatedAt')
  const params = { q: q || undefined, state: state || undefined, sort: one(sp.sort) || undefined }
  const where: Where[] = [{ tenant: { equals: s.tenant.id } }]
  if (q) where.push({ title: { contains: q } })
  const nowIso = new Date(now).toISOString()
  if (state === 'published') where.push({ publishedAt: { less_than_equal: nowIso } })
  if (state === 'scheduled') where.push({ publishedAt: { greater_than: nowIso } })
  if (state === 'draft') where.push({ publishedAt: { exists: false } })

  const [published, scheduled, drafts, media, testimonials, list] = await Promise.all([
    count(c, 'posts', { publishedAt: { less_than_equal: nowIso } }),
    count(c, 'posts', { publishedAt: { greater_than: nowIso } }),
    count(c, 'posts', { publishedAt: { exists: false } }),
    count(c, 'media'),
    count(c, 'testimonials', { approvedForUse: { equals: true } }),
    s.req.payload.find({ collection: 'posts', where: { and: where }, sort: sorted.sort, page, limit: PAGE_SIZE, depth: 0, overrideAccess: false, req: s.req }).catch(() => null),
  ])
  const columns: Column<Post>[] = [
    { key: 'title', header: 'عنوان', sort: sortHref(BASE, params, 'title', sorted), cell: (p) => <EntityCell icon="post" title={p.title} code={p.slug} href={`/admin/collections/posts/${p.id}`} /> },
    { key: 'author', header: 'نویسنده', cell: (p) => <span className="text-muted">{p.author || '—'}</span> },
    {
      key: 'state',
      header: 'وضعیت',
      cell: (p) => (isLive(p, now) ? <Pill tone="ok">منتشرشده</Pill> : p.publishedAt ? <Pill tone="info">زمان‌بندی‌شده</Pill> : <Pill tone="neutral">پیش‌نویس</Pill>),
    },
    { key: 'publishedAt', header: 'انتشار', sort: sortHref(BASE, params, 'publishedAt', sorted), cell: (p) => <span className="whitespace-nowrap text-muted">{p.publishedAt ? formatJalali(p.publishedAt, 'd MMM yyyy') : '—'}</span> },
    { key: 'updatedAt', header: 'ویرایش', sort: sortHref(BASE, params, 'updatedAt', sorted), cell: (p) => <span className="whitespace-nowrap text-muted">{formatJalali(p.updatedAt, 'd MMM yyyy')}</span> },
  ]
  const pager = list ? pagerOf(BASE, params, list.page ?? 1, list.totalPages, list.totalDocs) : null
  const acc = staffAccess(s)
  const n = (v: number | null) => (v === null ? '—' : fa(v))
  return (
    <DeskPage desk="content">
      <PageHeader
        title="محتوا"
        subtitle={`مقاله‌ها، روایت‌ها و رسانهٔ ${s.tenant.name}. شمارش‌ها وضعیت فعلی است، نه تغییر در ${fa(PERIOD_DAYS)} روز گذشته.`}
        actions={
          acc.create.posts ? (
            <a href="/admin/collections/posts/create" className={consoleBtn.primary}>
              + مقالهٔ تازه
            </a>
          ) : null
        }
      />
      <KpiGrid>
        <KpiCard label="مقالهٔ منتشرشده" value={n(published)} icon="post" href="/admin/collections/posts" />
        <KpiCard label="پیش‌نویس و زمان‌بندی‌شده" value={drafts === null || scheduled === null ? '—' : fa(drafts + scheduled)} icon="calendar" hint={drafts === null || scheduled === null ? undefined : `${fa(drafts)} پیش‌نویس، ${fa(scheduled)} زمان‌بندی‌شده`} />
        <KpiCard label="روایت تأییدشده" value={n(testimonials)} icon="star" href="/admin/collections/testimonials" />
        <KpiCard label="فایل رسانه" value={n(media)} icon="media" href="/admin/collections/media" />
      </KpiGrid>
      <FilterBar action={BASE} resetHref={BASE}>
        <FilterSearch label="جست‌وجوی عنوان" placeholder="عنوان مقاله" defaultValue={q} />
        <FilterSelect name="state" label="وضعیت انتشار" defaultValue={state} options={[{ value: '', label: 'همه' }, { value: 'published', label: 'منتشرشده' }, { value: 'scheduled', label: 'زمان‌بندی‌شده' }, { value: 'draft', label: 'پیش‌نویس' }]} />
      </FilterBar>
      <MainSide
        main={
          <Panel title="مقاله‌ها" subtitle={list ? `نمایش ${fa(list.docs.length)} از ${fa(list.totalDocs)} نتیجه` : undefined} headingId="h-posts">
            {list ? (
              <>
                <DataTable caption="فهرست مقاله‌ها" columns={columns} rows={list.docs} rowKey={(p) => String(p.id)} empty={<EmptyState icon="post" title="مقاله‌ای پیدا نشد." description="مقالهٔ تازه بسازید یا فیلتر را تغییر دهید." />} />
                {pager?.show ? <Pagination summary={pager.summary} pages={pager.pages} prev={pager.prev} next={pager.next} /> : null}
              </>
            ) : (
              <EmptyState icon="lock" title="فهرست مقاله‌ها برای نقش شما فعال نیست." />
            )}
          </Panel>
        }
        side={
          <Panel title="میان‌برها" headingId="h-quick">
            <QuickActions
              items={[
                ...(acc.create.posts ? [{ key: 'post', icon: 'post' as const, title: 'مقالهٔ تازه', hint: 'نوشتن برای مجله', href: '/admin/collections/posts/create' }] : []),
                { key: 'media', icon: 'media' as const, title: 'کتابخانهٔ رسانه', hint: 'تصویر و فایل‌ها', href: '/admin/collections/media' },
                { key: 'testi', icon: 'star' as const, title: 'روایت‌ها', hint: 'روایت دانش‌آموختگان', href: '/admin/collections/testimonials' },
              ]}
            />
          </Panel>
        }
      />
    </DeskPage>
  )
}
