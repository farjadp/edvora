import { formatJalali, formatToman } from '@edvora/core'
import { MODEL_SUGGESTIONS, AI_PROVIDERS } from '@edvora/integrations/ai'
import type { Metadata } from 'next'
import { ActionForm } from '../../../../../../components/staff/assistant/AssistantForms'
import { AssistantHeader } from '../../../../../../components/staff/assistant/AssistantTabs'
import { Card, Notice, fieldInput, linkClass } from '../../../../../../components/staff/ui'
import { requireAi } from '../../../../../../lib/ai/pageAccess'
import { effectiveProviderName, loadAiConfig, publicConfig } from '../../../../../../lib/ai/settings'
import { monthUsage } from '../../../../../../lib/ai/usage'
import { saveSettingsAction, testConnectionAction, toggleRoleAction } from '../actions'

export const metadata: Metadata = { title: 'تنظیمات · دستیار هوشمند' }

const PROVIDER_FA: Record<(typeof AI_PROVIDERS)[number], string> = {
  custom: 'درگاه سازگار با OpenAI (مثلاً AvalAI یا GapGPT) — پیشنهادی برای سرور در ایران',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  gemini: 'Google Gemini',
  mock: 'آزمایشی (بدون اتصال؛ برای آزمودن)',
}
const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n)
const numVal = (n: number | null | undefined) => (n == null ? '' : String(n))

function Check({ name, label, checked, hint }: { name: string; label: string; checked: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-3 text-sm leading-7">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-1.5 size-4 accent-[var(--c-primary)]" />
      <span>
        <span className="font-bold">{label}</span>
        {hint ? <span className="block text-muted">{hint}</span> : null}
      </span>
    </label>
  )
}

function Field({ name, label, value, hint, type = 'text', list, dir }: { name: string; label: string; value?: string; hint?: string; type?: string; list?: string; dir?: 'ltr' }) {
  return (
    <label className="grid gap-1.5 text-sm font-bold">
      {label}
      <input name={name} type={type} defaultValue={value} list={list} dir={dir} inputMode={type === 'text' && /Limit|Price|per/.test(name) ? 'numeric' : undefined} className={fieldInput} autoComplete="off" />
      {hint ? <span className="font-normal text-muted">{hint}</span> : null}
    </label>
  )
}

/** E-046 · provider, model, write-only key, test connection, privacy, limits, who may use it. ai.manage. */
export default async function AssistantSettings() {
  const s = await requireAi('/staff/assistant/settings', 'manage')
  const payload = s.req.payload
  const raw = await loadAiConfig(payload, s.tenant.id)
  const cfg = publicConfig(raw)
  const [usage, roles] = await Promise.all([
    monthUsage(payload, s.tenant.id, cfg.budget),
    payload.find({ collection: 'roles', where: { and: [{ tenant: { equals: s.tenant.id } }, { archived: { not_equals: true } }] }, sort: 'name', limit: 100, depth: 0, overrideAccess: true }),
  ])
  const forced = effectiveProviderName(cfg) !== cfg.provider
  const suggestions = [...new Set(Object.values(MODEL_SUGGESTIONS).flatMap((m) => m.chat))]

  return (
    <div className="grid max-w-4xl gap-6">
      <AssistantHeader current="settings" name={cfg.name} manage />
      {forced ? <Notice tone="warn">این سرور با AI_PROVIDER_OVERRIDE=mock اجرا شده؛ همهٔ آکادمی‌ها از ارائه‌دهندهٔ آزمایشی استفاده می‌کنند و کلید واقعی به کار نمی‌رود.</Notice> : null}

      <Card className="grid gap-5">
        <h2 className="text-lg font-black">ارائه‌دهنده و مدل</h2>
        <ActionForm action={saveSettingsAction} submit="ذخیرهٔ تنظیمات" className="grid gap-5">
          <Check name="enabled" label={`${cfg.name} در این آکادمی روشن باشد`} checked={cfg.enabled} />
          <Field name="assistantName" label="نام دستیار" value={cfg.customName ?? ''} hint="خالی = «دانا»، نام پیش‌فرض ادوورا. حداکثر ۲۴ نویسه؛ در همهٔ صفحه‌ها و در معرفی خودش به کار می‌رود." />
          <label className="grid gap-1.5 text-sm font-bold">
            ارائه‌دهنده
            <select name="provider" defaultValue={cfg.provider} className={fieldInput}>
              {AI_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_FA[p]}
                </option>
              ))}
            </select>
          </label>
          <Field name="model" label="نام مدل" value={cfg.model} list="ai-models" dir="ltr" hint="مثلاً gpt-5-mini، claude-opus-5-5 یا gemini-2.5-flash؛ برای درگاه‌ها نامی که درگاه اعلام کرده است." />
          <datalist id="ai-models">
            {suggestions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <Field name="baseUrl" label="نشانی درگاه (فقط برای سازگار با OpenAI)" value={cfg.baseUrl ?? ''} dir="ltr" hint="نشانی کامل با https، معمولاً به ‎/v1 ختم می‌شود." />
          <div className="grid gap-1.5">
            <Field name="newApiKey" type="password" label={cfg.hasKey ? `کلید API (ثبت شده: ${cfg.keyHint ?? '••••'})` : 'کلید API (ثبت نشده)'} dir="ltr" hint="فقط برای ثبت یا تغییر کلید پر کنید. کلید رمزگذاری‌شده نگه داشته می‌شود و هرگز دوباره نمایش داده نمی‌شود." />
            {cfg.hasKey ? <Check name="clearApiKey" label="کلید فعلی پاک شود" checked={false} /> : null}
          </div>
          <Field name="embeddingModel" label="مدل نمایه‌سازی (اختیاری)" value={cfg.embeddingModel ?? ''} dir="ltr" hint="خالی = پیش‌فرض ارائه‌دهنده. با Claude و حالت آزمایشی، نمایه‌سازی محلی و بدون ارسال انجام می‌شود. پس از تغییر، نمایهٔ اسناد را بازسازی کنید." />

          <fieldset className="grid gap-3 rounded-xl border border-line p-4">
            <legend className="px-2 text-sm font-black">حریم خصوصی: چه داده‌ای از دانشجویان برای ارائه‌دهنده فرستاده شود</legend>
            <Check name="names" label="نام‌ها" checked={cfg.privacy.names} hint="برای پرسش‌هایی مثل «وضعیت علی چیست؟» لازم است. نام‌هایی که خودتان در پیام می‌نویسید همیشه فرستاده می‌شوند." />
            <Check name="phones" label="شمارهٔ موبایل و تلفن" checked={cfg.privacy.phones} />
            <Check name="emails" label="نشانی ایمیل" checked={cfg.privacy.emails} />
            <Check name="nationalCodes" label="کد ملی" checked={cfg.privacy.nationalCodes} />
            <p className="text-sm leading-7 text-muted">شمارهٔ کارت بانکی و شبا همیشه پوشانده می‌شود. موارد خاموش، پیش از ارسال با برچسب‌هایی مثل [تلفن] جایگزین می‌شوند.</p>
          </fieldset>

          <fieldset className="grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-2">
            <legend className="px-2 text-sm font-black">سقف‌ها</legend>
            <Field name="perMinute" label="پیام در دقیقه برای هر نفر" value={numVal(cfg.rate.perMinute)} />
            <Field name="perDay" label="پیام در روز برای هر نفر" value={numVal(cfg.rate.perDay)} />
            <Field name="monthlyTokenLimit" label="سقف توکن ماهانهٔ آکادمی" value={numVal(cfg.budget.monthlyTokenLimit)} hint="خالی = بدون سقف" />
            <Field name="monthlyCostLimitRial" label="سقف هزینهٔ ماهانه (ریال)" value={numVal(cfg.budget.monthlyCostLimitRial)} hint="با قیمت‌های زیر حساب می‌شود." />
            <Field name="inputPricePerMillionRial" label="قیمت هر میلیون توکن ورودی (ریال)" value={numVal(cfg.budget.inputPricePerMillionRial)} />
            <Field name="outputPricePerMillionRial" label="قیمت هر میلیون توکن خروجی (ریال)" value={numVal(cfg.budget.outputPricePerMillionRial)} />
          </fieldset>
        </ActionForm>
      </Card>

      <Card className="grid gap-3">
        <h2 className="text-lg font-black">آزمایش اتصال</h2>
        <p className="leading-8 text-muted">یک درخواست بسیار کوچک با همین کلید و مدل از سرور فرستاده می‌شود.</p>
        {cfg.lastTest ? (
          <p className="text-sm">
            آخرین آزمایش ({formatJalali(cfg.lastTest.at, 'd MMMM yyyy، HH:mm')}): {cfg.lastTest.ok ? 'موفق' : `ناموفق — ${cfg.lastTest.error ?? ''}`}
          </p>
        ) : null}
        <ActionForm action={testConnectionAction} submit="آزمایش اتصال" tone="secondary" />
      </Card>

      <Card className="grid gap-3">
        <h2 className="text-lg font-black">مصرف این ماه</h2>
        <p className="leading-8">
          {fa(usage.messages)} پاسخ · {fa(usage.inputTokens)} توکن ورودی · {fa(usage.outputTokens)} توکن خروجی
          {cfg.budget.inputPricePerMillionRial || cfg.budget.outputPricePerMillionRial ? ` · هزینهٔ تقریبی ${formatToman(usage.cost)}` : ''}
        </p>
      </Card>

      <Card className="grid gap-3">
        <h2 className="text-lg font-black">چه نقش‌هایی از دستیار استفاده کنند</h2>
        <p className="leading-8 text-muted">
          دسترسی با مجوز «گفت‌وگو با دستیار هوشمند» (ai.use) روی نقش داده می‌شود. دستیار همیشه فقط در حد دسترسی‌های خود شخص داده می‌بیند و کار انجام می‌دهد. تغییر نقش به دسترسی «ساختن و ویرایش نقش‌ها» نیاز دارد؛ همچنین می‌توانید از{' '}
          <a href="/admin/collections/roles" className={linkClass}>
            ویرایشگر نقش‌ها
          </a>{' '}
          استفاده کنید.
        </p>
        <ul className="grid gap-2">
          {roles.docs.map((r) => {
            const has = (r.permissions ?? []).includes('ai.use')
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
                <span>
                  <span className="font-bold">{r.name}</span> <span className="text-sm text-muted">{has ? '· دسترسی دارد' : '· دسترسی ندارد'}</span>
                </span>
                <ActionForm action={toggleRoleAction} submit={has ? 'برداشتن دسترسی' : 'دادن دسترسی'} tone="secondary" className="grid gap-1">
                  <input type="hidden" name="roleId" value={r.id} />
                  <input type="hidden" name="grant" value={has ? 'false' : 'true'} />
                </ActionForm>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card className="grid gap-3">
        <h2 className="text-lg font-black">دسترسی از ایران</h2>
        <p className="leading-8 text-muted">
          سرویس‌های OpenAI، Anthropic و Google درخواست‌های سرورهای داخل ایران را نمی‌پذیرند. وقتی سایت روی سرور ایرانی است، از «درگاه سازگار با OpenAI» (مانند AvalAI یا GapGPT) با کلید همان درگاه استفاده کنید. در این حالت پیام‌ها از سرور آن شرکت می‌گذرند؛ تنظیمات حریم خصوصی بالا را با دقت انتخاب کنید.
        </p>
      </Card>
    </div>
  )
}
