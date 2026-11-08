import { formatJalali } from '@edvora/core'
import {
  FONT_DISPLAY,
  INTEGRATION_LABELS,
  INTEGRATION_PROVIDERS,
  MESSAGE_EVENTS,
  PLAN_LIMITS,
  PLAN_LIMIT_LABELS,
  SITE_TOGGLES,
  SOCIAL_PLATFORMS,
  STAFF_2FA_POLICIES,
  UPLOAD_RULES,
  VARIABLE_LABELS,
  type IntegrationKind,
  type UploadSlot,
} from '@edvora/core/settings'
import { toPersianDigits } from '@edvora/core/digits'
import type { ReactNode } from 'react'
import type { IntegrationRow } from '../../../lib/settings'
import { mediaUrl } from '../../../lib/settings'
import type { Tenant } from '../../../payload-types'
import { ColourPreview } from './ColourPreview'
import { Checkbox, Fieldset, ImageField, SecretField, Select, SettingsForm, TextArea, TextField } from './fields'

export type SectionData = {
  academy: number | null
  tenant: Tenant | null
  integrations: Partial<Record<IntegrationKind, IntegrationRow>>
  pages: { id: number; title: string }[]
  platform: {
    staff2fa: string
    academyProviders: Partial<Record<IntegrationKind, boolean | null>>
    env: { label: string; value: string; configured: boolean }[]
    academies: Pick<Tenant, 'id' | 'name' | 'slug' | 'plan' | 'domains' | 'features' | 'limits'>[]
    editing: number | null
  } | null
}

const accept = (slot: UploadSlot) =>
  UPLOAD_RULES[slot].types.map((t) => (t === 'jpeg' ? 'image/jpeg' : t === 'ico' ? 'image/x-icon,.ico' : `image/${t}`)).join(',')
const uploadHelp = (slot: UploadSlot, extra = '') =>
  `${UPLOAD_RULES[slot].types.map((t) => t.toUpperCase()).join('، ')} · حداکثر ${toPersianDigits(String(Math.round(UPLOAD_RULES[slot].maxBytes / 1000)))} کیلوبایت · SVG پذیرفته نمی‌شود.${extra ? ` ${extra}` : ''}`
const fa = (n: number) => toPersianDigits(String(n))
/** Existing rows plus two blank ones (no JavaScript needed to add a row; clear a row to remove it). */
const withBlanks = <T,>(list: T[] | null | undefined, blank: T, n = 2): T[] => [...(list ?? []), ...Array.from({ length: n }, () => blank)]

function NoAcademy() {
  return <p className="ed-set__empty">برای این بخش، یک آکادمی را از انتخاب‌گر بالای منو یا فهرست بالا برگزینید.</p>
}

function need(d: SectionData, render: (t: Tenant, academy: number) => ReactNode): ReactNode {
  return d.tenant && d.academy !== null ? render(d.tenant, d.academy) : <NoAcademy />
}

// ---------------------------------------------------------------- Academy

export function IdentitySection(d: SectionData) {
  return need(d, (t, academy) => (
    <SettingsForm section="identity" academy={academy}>
      <TextField name="name" label="نام آکادمی" value={t.name} required maxLength={120} help="در سربرگ سایت، عنوان صفحه‌ها، پیامک‌ها و گواهی‌ها." />
      <TextField name="tagline" label="شعار" value={t.tagline} maxLength={200} help="یک جمله زیر نام آکادمی و در توضیح پیش‌فرض صفحه‌ها." />
      <div className="ed-set__grid">
        <ImageField name="logo" label="لوگو (زمینهٔ روشن)" url={mediaUrl(t.logo)} accept={accept('logo')} help={uploadHelp('logo', 'ارتفاع نمایش ۳۶ پیکسل؛ PNG شفاف بهتر است.')} />
        <ImageField name="logoDark" label="لوگو (زمینهٔ تیره)" url={mediaUrl(t.logoDark)} accept={accept('logoDark')} help={uploadHelp('logoDark', 'خالی = همان لوگوی روشن.')} />
        <ImageField name="favicon" label="نماد زبانه (favicon)" url={mediaUrl(t.favicon)} accept={accept('favicon')} help={uploadHelp('favicon', 'مربع، دست‌کم ۴۸×۴۸.')} />
        <ImageField name="ogImage" label="تصویر اشتراک‌گذاری (OG)" url={mediaUrl(t.ogImage)} accept={accept('ogImage')} help={uploadHelp('ogImage', 'وقتی پیوند سایت در پیام‌رسان‌ها فرستاده می‌شود؛ ۱۲۰۰×۶۳۰.')} />
      </div>
    </SettingsForm>
  ))
}

export function AppearanceSection(d: SectionData) {
  return need(d, (t, academy) => (
    <SettingsForm section="appearance" academy={academy}>
      <ColourPreview primary={t.primaryColor ?? '#1A56DB'} accent={t.accentColor ?? '#F59E0B'} academy={t.name} />
      <Select name="defaultTheme" label="پوستهٔ پیش‌فرض سایت" value={t.defaultTheme ?? 'light'} options={[{ value: 'light', fa: 'روشن' }, { value: 'dark', fa: 'تیره' }]} help="بازدیدکننده می‌تواند با دکمهٔ پوسته عوضش کند." />
      <Select name="fontDisplay" label="قلم عنوان‌ها" value={t.fontDisplay ?? 'morabba'} options={FONT_DISPLAY} help="فقط قلم‌هایی که روی سرور خود ادورا میزبانی می‌شوند. متن اصلی همیشه وزیرمتن است." />
    </SettingsForm>
  ))
}

export function ContactSection(d: SectionData) {
  return need(d, (t, academy) => (
    <SettingsForm section="contact" academy={academy}>
      <div className="ed-set__grid">
        <TextField name="phone" label="تلفن" value={t.contact?.phone} dir="ltr" type="tel" maxLength={40} />
        <TextField name="email" label="ایمیل" value={t.contact?.email} dir="ltr" type="email" maxLength={200} />
      </div>
      <TextField name="address" label="نشانی" value={t.contact?.address} maxLength={300} />
      <Fieldset legend="شبکه‌های اجتماعی" help="فقط نشانی‌های https. برای حذف یک ردیف، نشانی‌اش را خالی کنید.">
        {withBlanks(t.contact?.social, { platform: 'instagram', url: '' } as never).map((s, i) => (
          <div className="ed-set__row" key={i}>
            <Select name={`social.${i}.platform`} label="شبکه" value={(s as { platform?: string }).platform} options={SOCIAL_PLATFORMS} />
            <TextField name={`social.${i}.url`} label="نشانی" value={(s as { url?: string }).url} dir="ltr" type="url" placeholder="https://" />
          </div>
        ))}
      </Fieldset>
    </SettingsForm>
  ))
}

export function SeoSection(d: SectionData) {
  return need(d, (t, academy) => (
    <SettingsForm section="seo" academy={academy}>
      <TextField name="titleSuffix" label="پسوند عنوان صفحه‌ها" value={t.seo?.titleSuffix} maxLength={80} help={`مثلاً «دورهٔ MBA · ${t.name}». خالی = نام آکادمی.`} />
      <TextArea name="description" label="توضیح پیش‌فرض" value={t.seo?.description} maxLength={300} help="برای صفحه‌هایی که توضیح خودشان را ندارند. ۱۲۰ تا ۱۶۰ نویسه بهتر است." />
      <TextField name="keywords" label="کلیدواژه‌ها" value={t.seo?.keywords} maxLength={300} help="با ویرگول جدا کنید." />
      <Checkbox name="noindex" label="سایت را از موتورهای جست‌وجو پنهان کن" checked={t.seo?.noindex} help="برای سایت آزمایشی یا پیش از راه‌اندازی." />
    </SettingsForm>
  ))
}

export function HomepageSection(d: SectionData) {
  return need(d, (t, academy) => (
    <SettingsForm section="homepage" academy={academy}>
      <Fieldset legend="نوار اطلاع‌رسانی" help="یک خط بالای همهٔ صفحه‌ها.">
        <Checkbox name="noticeEnabled" label="نمایش نوار" checked={t.notice?.enabled} />
        <TextField name="noticeText" label="متن نوار" value={t.notice?.text} maxLength={200} />
      </Fieldset>
      <Fieldset legend="خدمات" help="برای حذف، عنوان و متن ردیف را خالی کنید.">
        {withBlanks(t.services, { title: '', text: '' } as never).map((s, i) => (
          <div className="ed-set__row" key={i}>
            <TextField name={`services.${i}.title`} label="عنوان" value={(s as { title?: string }).title} maxLength={120} />
            <TextField name={`services.${i}.text`} label="توضیح" value={(s as { text?: string | null }).text} maxLength={600} />
          </div>
        ))}
      </Fieldset>
      <Fieldset legend="آمار" help="فقط عددهای واقعی و قابل اثبات.">
        {withBlanks(t.stats, { value: '', label: '' } as never).map((s, i) => (
          <div className="ed-set__row" key={i}>
            <TextField name={`stats.${i}.value`} label="عدد" value={(s as { value?: string }).value} maxLength={30} />
            <TextField name={`stats.${i}.label`} label="عنوان" value={(s as { label?: string }).label} maxLength={80} />
          </div>
        ))}
      </Fieldset>
      <Fieldset legend="برندهای همراه" help={uploadHelp('clientLogo', 'برای حذف، نام را خالی کنید.')}>
        {withBlanks(t.clientLogos, { name: '', logo: null } as never).map((c, i) => {
          const row = c as { name?: string; logo?: unknown }
          const logoId = row.logo && typeof row.logo === 'object' ? (row.logo as { id: number }).id : typeof row.logo === 'number' ? row.logo : ''
          return (
            <div className="ed-set__row" key={i}>
              <TextField name={`clientLogos.${i}.name`} label="نام برند" value={row.name} maxLength={80} />
              <input type="hidden" name={`clientLogos.${i}.logo`} value={String(logoId)} />
              <ImageField name={`clientLogos.${i}.file`} label="لوگو" url={mediaUrl(row.logo)} accept={accept('clientLogo')} removable={false} help="" />
            </div>
          )
        })}
      </Fieldset>
      <p className="ed-set__help">
        متن «مانیفست / دربارهٔ ما» ویرایشگر متن غنی دارد:{' '}
        <a href={`/admin/collections/tenants/${academy}`} className="ed-set__link">
          ویرایش در صفحهٔ آکادمی
        </a>
      </p>
    </SettingsForm>
  ))
}

export function CertificatesSection(d: SectionData) {
  return need(d, (t, academy) => (
    <SettingsForm section="certificates" academy={academy}>
      <TextField name="certificatePrefix" label="پیشوند کد گواهی" value={t.certificatePrefix} dir="ltr" required maxLength={6} help="دو تا شش حرف بزرگ لاتین. کدها این شکل‌اند: PREFIX-PROGRAM-001. تغییرش روی گواهی‌های صادرشده اثری ندارد." />
      <div className="ed-set__grid">
        <TextField name="signerName" label="نام امضاکننده" value={t.certificateSigner?.name} maxLength={120} />
        <TextField name="signerTitle" label="سمت امضاکننده" value={t.certificateSigner?.title} maxLength={120} help="مثلاً «رئیس آکادمی»." />
      </div>
      <ImageField name="signature" label="تصویر امضا" url={mediaUrl(t.certificateSigner?.signature)} accept={accept('signature')} help={uploadHelp('signature', 'زمینهٔ شفاف.')} />
    </SettingsForm>
  ))
}

export function NotificationsSection(d: SectionData) {
  return need(d, (t, academy) => {
    const find = (event: string, channel: string) => (t.messageTemplates ?? []).find((m) => m.event === event && m.channel === channel)
    return (
      <SettingsForm section="notifications" academy={academy}>
        <p className="ed-set__help">
          متغیرها را با دو آکولاد بنویسید، مثل {'{{name}}'}. قالب خاموش یا خالی = متن پیش‌فرض ادورا. کد ورود از الگوی تأییدشدهٔ سرویس پیامک فرستاده می‌شود؛ متن آن در پنل سرویس پیامک است.
        </p>
        {MESSAGE_EVENTS.map((e) => (
          <Fieldset key={e.key} legend={e.fa} help={`متغیرها: ${e.vars.map((v) => `{{${v}}} ${VARIABLE_LABELS[v] ?? ''}`).join(' · ')}`}>
            {(['sms', 'email'] as const).map((channel) => {
              const m = find(e.key, channel)
              const k = `t.${e.key}.${channel}`
              return (
                <div key={channel} className="ed-set__tpl">
                  <Checkbox name={`${k}.enabled`} label={channel === 'sms' ? 'پیامک روشن' : 'ایمیل روشن'} checked={m?.enabled} />
                  {channel === 'email' ? <TextField name={`${k}.subject`} label="موضوع ایمیل" value={m?.subject} maxLength={150} /> : null}
                  <TextArea name={`${k}.body`} label={channel === 'sms' ? 'متن پیامک' : 'متن ایمیل'} value={m?.body} rows={channel === 'sms' ? 2 : 4} maxLength={1000} />
                </div>
              )
            })}
          </Fieldset>
        ))}
      </SettingsForm>
    )
  })
}

export function LoginSection(d: SectionData) {
  return need(d, (t, academy) => (
    <SettingsForm section="login" academy={academy}>
      <TextField name="title" label="عنوان صفحهٔ ورود" value={t.loginTexts?.title} maxLength={120} help="خالی = «ورود به پنل دانشجویی»." />
      <TextArea name="subtitle" label="متن زیر عنوان" value={t.loginTexts?.subtitle} maxLength={300} />
      <TextField name="help" label="راهنمای پایین فرم" value={t.loginTexts?.help} maxLength={300} help="مثلاً شمارهٔ پشتیبانی برای کسی که کد دریافت نمی‌کند." />
    </SettingsForm>
  ))
}

export function FeaturesSection(d: SectionData) {
  return need(d, (t, academy) => (
    <SettingsForm section="features" academy={academy}>
      <Fieldset legend="بخش‌های سایت" help="خاموش = صفحه و پیوندش در منو پنهان می‌شود؛ داده‌ها پاک نمی‌شوند.">
        {SITE_TOGGLES.map((s) => (
          <Checkbox key={s.key} name={s.key} label={s.fa} help={s.help} checked={(t.toggles as Record<string, boolean | null | undefined> | null | undefined)?.[s.key] ?? true} />
        ))}
      </Fieldset>
      <Fieldset legend="انگیزش و پیشرفت" help="امتیاز، سطح، نشان و جشن‌ها. خاموش کردن تاریخچه را نگه می‌دارد. تنظیمات ریز در صفحهٔ آکادمی است.">
        <Checkbox name="gamificationEnabled" label="گیمیفیکیشن روشن" checked={t.gamification?.enabled} />
      </Fieldset>
      <p className="ed-set__help">
        ماژول‌های طرح ({(t.features ?? []).join('، ') || '—'}) را ادورا روشن می‌کند، نه آکادمی.
      </p>
    </SettingsForm>
  ))
}

export function LegalSection(d: SectionData) {
  return need(d, (t, academy) => {
    const id = (v: unknown) => (v && typeof v === 'object' ? String((v as { id: number }).id) : v ? String(v) : '')
    const opts = d.pages.map((p) => ({ value: String(p.id), fa: p.title }))
    return (
      <SettingsForm section="legal" academy={academy}>
        <p className="ed-set__help">
          متن هر صفحه را در{' '}
          <a href="/admin/collections/pages" className="ed-set__link">
            صفحه‌ها
          </a>{' '}
          بنویسید و این‌جا انتخابش کنید. پیوندشان در پانویس سایت و صفحهٔ پرداخت می‌آید.
        </p>
        <Select name="terms" label="قوانین و مقررات" value={id(t.legal?.terms)} options={opts} allowEmpty="— هیچ —" />
        <Select name="privacy" label="حریم خصوصی" value={id(t.legal?.privacy)} options={opts} allowEmpty="— هیچ —" />
        <Select name="refund" label="شرایط بازپرداخت" value={id(t.legal?.refund)} options={opts} allowEmpty="— هیچ —" />
      </SettingsForm>
    )
  })
}

// ---------------------------------------------------------------- Integrations

function IntegrationForm({ kind, row, academy, allowed }: { kind: IntegrationKind; row?: IntegrationRow; academy: number; allowed: boolean }) {
  const L = INTEGRATION_LABELS[kind]
  const cfg = (row?.config ?? {}) as Record<string, string | number | boolean | undefined>
  const val = (k: string) => (cfg[k] === undefined || cfg[k] === null ? '' : String(cfg[k]))
  return (
    <section className="ed-set__card" id={kind} aria-labelledby={`int-${kind}`} data-testid={`integration-${kind}`}>
      <header className="ed-set__card-head">
        <h3 id={`int-${kind}`}>{L.fa}</h3>
        {row?.lastTest?.at ? (
          <span className={`c-pill ${row.lastTest.ok ? 'c-pill--ok' : 'c-pill--danger'}`}>
            آخرین آزمون: {row.lastTest.ok ? 'موفق' : 'ناموفق'} · {formatJalali(row.lastTest.at)}
          </span>
        ) : null}
      </header>
      <p className="ed-set__help">{L.help}</p>
      {!allowed ? <p className="c-alert">ادورا سرویس اختصاصی {L.fa} را برای آکادمی‌ها بسته است؛ سرویس مشترک پلتفرم به کار می‌رود.</p> : null}
      <form method="post" action="/api/settings/integrations" encType="multipart/form-data" className="ed-set__form">
        <input type="hidden" name="academy" value={academy} />
        <input type="hidden" name="kind" value={kind} />
        <Select name="provider" id={`f-${kind}-provider`} label="سرویس‌دهنده" value={row?.provider ?? 'mock'} options={INTEGRATION_PROVIDERS[kind]} />
        <Checkbox name="enabled" id={`f-${kind}-enabled`} label="استفاده از این سرویس به جای سرویس مشترک ادورا" checked={row?.enabled} />
        {kind === 'sms' ? (
          <Fieldset legend="کاوه‌نگار">
            <TextField name="config.sender" id="f-sms-sender" label="شمارهٔ خط فرستنده" value={val('sender')} dir="ltr" maxLength={20} help="خالی = خط پیش‌فرض حساب." />
            <TextField name="config.otpTemplate" id="f-sms-otp" label="نام الگوی کد ورود" value={val('otpTemplate')} dir="ltr" maxLength={60} help="الگوی تأییدشده در پنل کاوه‌نگار (verify lookup)." />
          </Fieldset>
        ) : null}
        {kind === 'email' ? (
          <Fieldset legend="SMTP">
            <div className="ed-set__grid">
              <TextField name="config.host" id="f-email-host" label="سرور" value={val('host')} dir="ltr" maxLength={200} placeholder="smtp.example.ir" />
              <TextField name="config.port" id="f-email-port" label="درگاه (port)" value={val('port') || '587'} dir="ltr" type="number" />
              <TextField name="config.username" id="f-email-user" label="نام کاربری" value={val('username')} dir="ltr" maxLength={200} />
              <TextField name="config.fromEmail" id="f-email-from" label="ایمیل فرستنده" value={val('fromEmail')} dir="ltr" type="email" maxLength={200} />
              <TextField name="config.fromName" id="f-email-name" label="نام فرستنده" value={val('fromName')} maxLength={120} />
            </div>
            <Checkbox name="config.secure" id="f-email-secure" label="TLS از ابتدا (درگاه ۴۶۵)" checked={cfg.secure === true} />
          </Fieldset>
        ) : null}
        {kind === 'live' ? (
          <Fieldset legend="BigBlueButton">
            <TextField name="config.baseUrl" id="f-live-url" label="نشانی سرور" value={val('baseUrl')} dir="ltr" type="url" placeholder="https://bbb.example.ir/bigbluebutton/" />
            <Select name="config.checksum" id="f-live-checksum" label="الگوریتم checksum" value={val('checksum') || 'sha256'} options={[{ value: 'sha256', fa: 'SHA-256' }, { value: 'sha512', fa: 'SHA-512' }, { value: 'sha1', fa: 'SHA-1' }]} />
          </Fieldset>
        ) : null}
        <SecretField name="secret" id={`f-${kind}-secret`} label={L.secret} isSet={Boolean(row?.hasSecret)} opens={Boolean(row?.secretOpens)} setAt={row?.secretSetAt ? formatJalali(row.secretSetAt) : null} />
        <div className="ed-set__actions">
          <button type="submit" name="intent" value="save" className="c-btn c-btn--primary">
            ذخیره
          </button>
          <button type="submit" name="intent" value="test" className="c-btn">
            آزمون اتصال
          </button>
        </div>
      </form>
    </section>
  )
}

export function IntegrationsSection(d: SectionData) {
  return need(d, (_t, academy) => (
    <div className="ed-set__stack">
      <p className="ed-set__help">
        کلیدها رمزنگاری‌شده (AES-256-GCM) نگه‌داری می‌شوند و هیچ‌وقت به مرورگر برنمی‌گردند. تا وقتی سرویس اختصاصی روشن و کلیددار نیست، سرویس مشترک ادورا به کار می‌رود. کلاس زندهٔ اختصاصی فعلاً ذخیره و آزموده می‌شود و در نسخهٔ بعد به کار می‌افتد.
      </p>
      {(['sms', 'email', 'live'] as const).map((k) => (
        <IntegrationForm key={k} kind={k} row={d.integrations[k]} academy={academy} allowed={d.platform ? d.platform.academyProviders[k] !== false : true} />
      ))}
    </div>
  ))
}

// ---------------------------------------------------------------- Platform

export function PlatformProvidersSection(d: SectionData) {
  const p = d.platform
  if (!p) return <NoAcademy />
  return (
    <div className="ed-set__stack">
      <section className="ed-set__card" aria-labelledby="env-title">
        <h3 id="env-title">سرویس‌های پیش‌فرض پلتفرم (متغیرهای محیطی)</h3>
        <p className="ed-set__help">مقدار کلیدها نمایش داده نمی‌شود؛ فقط این‌که تنظیم شده‌اند یا نه. برای تغییر، متغیر محیطی سرور را عوض کنید.</p>
        <table className="ed-set__table">
          <thead>
            <tr>
              <th scope="col">سرویس</th>
              <th scope="col">سرویس‌دهنده</th>
              <th scope="col">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {p.env.map((e) => (
              <tr key={e.label}>
                <th scope="row">{e.label}</th>
                <td dir="ltr">{e.value}</td>
                <td>{e.configured ? <span className="c-pill c-pill--ok">آماده</span> : <span className="c-pill c-pill--warn">ناقص</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <SettingsForm section="platform-providers" academy={null}>
        <Select name="staff2fa" label="تأیید دومرحله‌ای کارکنان" value={p.staff2fa} options={STAFF_2FA_POLICIES} help="«اجباری» هر کسی را که دسترسی کارکنان دارد پیش از کار به ثبت تأیید دومرحله‌ای می‌فرستد." />
        <Fieldset legend="سرویس اختصاصی آکادمی‌ها" help="خاموش = آکادمی‌ها فقط سرویس مشترک ادورا را دارند، حتی اگر کلید خودشان را وارد کرده باشند.">
          {(['sms', 'email', 'live'] as const).map((k) => (
            <Checkbox key={k} name={`allow.${k}`} label={INTEGRATION_LABELS[k].fa} checked={p.academyProviders[k] !== false} />
          ))}
        </Fieldset>
      </SettingsForm>
    </div>
  )
}

export function PlatformAcademiesSection(d: SectionData) {
  const p = d.platform
  if (!p) return <NoAcademy />
  const editing = p.academies.find((a) => a.id === p.editing) ?? null
  const FEATURES = [
    ['site', 'سایت عمومی'],
    ['lms', 'آموزش (LMS)'],
    ['payments', 'پرداخت'],
    ['crm', 'CRM'],
    ['certificates', 'گواهی'],
    ['live', 'کلاس زنده'],
    ['consulting', 'مشاوره'],
    ['b2b', 'سازمانی'],
  ] as const
  return (
    <div className="ed-set__stack">
      <table className="ed-set__table" data-testid="platform-academies">
        <thead>
          <tr>
            <th scope="col">آکادمی</th>
            <th scope="col">طرح</th>
            <th scope="col">دامنه‌ها</th>
            <th scope="col">
              <span className="c-sr">ویرایش</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {p.academies.map((a) => (
            <tr key={a.id}>
              <th scope="row">
                {a.name} <span className="c-muted">({a.slug})</span>
              </th>
              <td>{a.plan}</td>
              <td dir="ltr">{(a.domains ?? []).map((x) => x.domain).join(', ') || '—'}</td>
              <td>
                <a className="c-btn c-btn--small" href={`/admin/settings/platform-academies?edit=${a.id}`}>
                  ویرایش
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ed-set__help">
        ساختن آکادمی تازه:{' '}
        <a className="ed-set__link" href="/admin/collections/tenants/create">
          آکادمی جدید
        </a>
      </p>
      {editing ? (
        <section className="ed-set__card" aria-labelledby="edit-academy">
          <h3 id="edit-academy">{editing.name}</h3>
          <SettingsForm section="platform-academies" academy={null}>
            <input type="hidden" name="academyId" value={editing.id} />
            <Select name="plan" label="طرح" value={editing.plan ?? 'starter'} options={[{ value: 'starter', fa: 'Starter' }, { value: 'growth', fa: 'Growth' }, { value: 'pro', fa: 'Academy Pro' }]} />
            <TextArea name="domains" label="دامنه‌ها" value={(editing.domains ?? []).map((x) => x.domain).join('\n')} rows={3} help="هر دامنه در یک خط، بدون http. یک دامنه فقط مال یک آکادمی است." />
            <div className="ed-set__grid">
              {PLAN_LIMITS.map((k) => (
                <TextField key={k} name={k} label={PLAN_LIMIT_LABELS[k]} type="number" value={editing.limits?.[k] == null ? '' : String(editing.limits[k])} help="خالی = بی‌سقف" />
              ))}
            </div>
            <Fieldset legend="ماژول‌های فعال">
              {FEATURES.map(([v, label]) => (
                <div className="ed-set__check" key={v}>
                  <input id={`feat-${v}`} type="checkbox" name="features" value={v} defaultChecked={(editing.features ?? []).includes(v)} />
                  <label htmlFor={`feat-${v}`}>{label}</label>
                </div>
              ))}
            </Fieldset>
          </SettingsForm>
        </section>
      ) : null}
      <p className="c-muted">{fa(p.academies.length)} آکادمی</p>
    </div>
  )
}

export const SECTION_COMPONENTS: Record<string, (d: SectionData) => ReactNode> = {
  identity: IdentitySection,
  appearance: AppearanceSection,
  contact: ContactSection,
  seo: SeoSection,
  homepage: HomepageSection,
  certificates: CertificatesSection,
  notifications: NotificationsSection,
  login: LoginSection,
  features: FeaturesSection,
  legal: LegalSection,
  integrations: IntegrationsSection,
  'platform-providers': PlatformProvidersSection,
  'platform-academies': PlatformAcademiesSection,
}
