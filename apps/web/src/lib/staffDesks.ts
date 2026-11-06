import { meets, type DeskKey, type StaffPerms } from '@edvora/core/staff'

/** Placeholder copy per desk (UX §5) and the optional link to the Payload list the person can read. */
const COPY: Record<DeskKey, { description: string; link?: { label: string; href: string; needs: string } }> = {
  overview: { description: 'خلاصهٔ وضعیت آکادمی: فروش، ثبت‌نام‌ها و کارهای نیازمند توجه اینجا نمایش داده می‌شود.' },
  leads: {
    description: 'صف کار روزانهٔ مشاوران، تماس‌ها و پیگیری‌ها اینجا نمایش داده می‌شود.',
    link: { label: 'رفتن به فهرست مشتریان بالقوه', href: '/admin/collections/leads', needs: 'leads.view' },
  },
  finance: {
    description: 'پرداخت‌ها، اقساط، رسیدهای دستی و بازگشت وجه اینجا نمایش داده می‌شود.',
    link: { label: 'رفتن به فهرست سفارش‌ها', href: '/admin/collections/orders', needs: 'orders.view' },
  },
  students: { description: 'پروندهٔ کامل هر دانشجو: ثبت‌نام، پرداخت‌ها و پیام‌ها اینجا نمایش داده می‌شود.' },
  teaching: {
    description: 'دوره‌ها و گروه‌های شما، تکالیف و کلاس‌های زنده اینجا نمایش داده می‌شود.',
    link: { label: 'رفتن به فهرست دوره‌ها', href: '/admin/collections/courses', needs: 'courses.view' },
  },
  support: { description: 'درخواست‌های پشتیبانی و پاسخ به آن‌ها اینجا نمایش داده می‌شود.' },
  content: {
    description: 'متن صفحه‌ها، مقاله‌ها و رسانه‌ها اینجا نمایش داده می‌شود.',
    link: { label: 'رفتن به فهرست مقاله‌ها', href: '/admin/collections/posts', needs: 'content.edit' },
  },
}

export function deskCopy(desk: DeskKey, who: StaffPerms): { description: string; adminLink?: { label: string; href: string } } {
  const c = COPY[desk]
  if (desk === 'overview' && meets(who, { any: ['settings.edit', 'roles.manage'] })) {
    return { description: c.description, adminLink: { label: 'رفتن به تنظیمات و راه‌اندازی', href: '/admin' } }
  }
  const link = c.link && meets(who, { any: [c.link.needs] }) ? { label: c.link.label, href: c.link.href } : undefined
  return { description: c.description, adminLink: link }
}
