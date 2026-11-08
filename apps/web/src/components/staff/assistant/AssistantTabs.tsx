import { cx } from '@edvora/ui'
import { focusRing } from '@edvora/ui/classes'
import { ASSISTANT_TAGLINE } from '@edvora/core/ai/identity'
import { AssistantMark } from '../../assistant/AssistantMark'

const TABS = [
  { key: 'chats', label: 'گفت‌وگوها', href: '/staff/assistant', manage: false },
  { key: 'documents', label: 'اسناد دانش', href: '/staff/assistant/documents', manage: true },
  { key: 'memory', label: 'حافظه', href: '/staff/assistant/memory', manage: true },
  { key: 'settings', label: 'تنظیمات', href: '/staff/assistant/settings', manage: true },
] as const

/** Header + tabs of «دستیار هوشمند». Manager-only tabs are hidden for people with `ai.use` only. */
export function AssistantHeader({ current, manage, name, intro }: { current: (typeof TABS)[number]['key']; manage: boolean; name: string; intro?: string }) {
  return (
    <header className="grid gap-3">
      <div className="flex items-center gap-3">
        <AssistantMark size={44} />
        <h1 className="text-2xl font-black">
          {name}
          <span className="block text-sm font-medium text-muted">{ASSISTANT_TAGLINE}</span>
        </h1>
      </div>
      <p className="max-w-3xl leading-8 text-muted">
        {intro ??
          `${name} از اسناد بارگذاری‌شده، یادداشت‌های حافظهٔ تأییدشده و گفت‌وگوهای پیشین خود شما پاسخ می‌دهد و منبع هر پاسخ را نشان می‌دهد. این «بازیابی» است، نه آموزش مدل: چیزی برای آموزش هوش مصنوعی فرستاده نمی‌شود.`}
      </p>
      <nav aria-label="بخش‌های دستیار" className="flex flex-wrap gap-2 border-b border-line pb-2">
        {TABS.filter((t) => manage || !t.manage).map((t) => (
          <a
            key={t.key}
            href={t.href}
            aria-current={t.key === current ? 'page' : undefined}
            className={cx('rounded-lg px-3 py-1.5 text-sm font-bold', focusRing, t.key === current ? 'bg-wash text-ink' : 'text-muted hover:bg-sunken hover:text-ink')}
          >
            {t.label}
          </a>
        ))}
      </nav>
    </header>
  )
}
