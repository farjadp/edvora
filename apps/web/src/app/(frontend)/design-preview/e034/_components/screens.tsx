import { cx } from '@edvora/ui'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { DEMO_TENANT, SAMPLE_EMAIL, SAMPLE_PHONE_LATIN, type DemoTenant } from '../_lib/data'
import type { OptionId } from '../_lib/options'
import { Icon, QrPlaceholder } from './art'
import { CodeField, LockGate, MockForm, PasswordField, PrimaryButton, ResendTimer } from './interactive'
import { AlertRegion, Field, Notice, SupportLine } from './kit'
import { disp, linkCls, secondaryCls } from './ui'

/**
 * Screen content, written once and shared by the three options (the spec: «Form card content is identical in all three»).
 * Copy is verbatim from docs/ux/E-034-login.md. Strings in the spec that were in [brackets] are used without brackets.
 */
export type ScreenContent = {
  title: string
  sub?: ReactNode
  body: ReactNode
  /** `status` screens have no form: in option C their title becomes the big headline. */
  kind: 'form' | 'status'
  /** Platform (Edvora) page instead of an academy page. */
  neutral?: boolean
  /** Small label above the title, e.g. «مدیریت» on the Payload skin. */
  tag?: string
  /** A Payload toast mock, rendered above the card. */
  toast?: ReactNode
}

export type Ctx = { o: OptionId; tenant: DemoTenant; live: boolean; qs: string }

const PHONE_FA = '۰۹۱۲۳۴۵۶۷۸۹'

function href(c: Ctx, id: string) {
  return `/design-preview/e034/${c.o}/${id}${c.qs}`
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-6 grid gap-3">{children}</div>
}

function GhostLink({ c, to, children }: { c: Ctx; to: string; children: ReactNode }) {
  return (
    <Link href={href(c, to)} className={secondaryCls(c.o)}>
      {children}
    </Link>
  )
}

/* ---------------------------------------------------------------- student -- */

function PhoneForm({ c, error, busy, value = '', alert, extra }: { c: Ctx; error?: string; busy?: boolean; value?: string; alert?: ReactNode; extra?: ReactNode }) {
  const o = c.o
  return (
    <>
      {extra}
      <MockForm label="دریافت کد ورود" busy={busy}>
        <Field
          o={o}
          id="phone"
          name="phone"
          type="tel"
          label="شماره موبایل"
          dir="ltr"
          latin
          inputMode="tel"
          autoComplete="tel"
          placeholder={PHONE_FA}
          defaultValue={value}
          invalid={Boolean(error)}
          readOnly={busy}
          describedBy="phone-alert"
        />
        <div className="mt-5">
          <AlertRegion o={o} id="phone-alert">
            {error ?? alert}
          </AlertRegion>
        </div>
        <PrimaryButton o={o} busy={busy} disabled={busy}>
          {busy ? 'در حال ارسال…' : 'دریافت کد ورود'}
        </PrimaryButton>
      </MockForm>
      <p className="mt-6 text-sm text-muted">
        کارمند آکادمی هستید؟{' '}
        <Link href={href(c, 't-empty')} className={cx(linkCls, 'text-sm')}>
          ورود کارکنان
        </Link>
      </p>
    </>
  )
}

function CodeStep({ c, alert, newUser, resend = 'timer', invalid, busy }: { c: Ctx; alert?: ReactNode; newUser?: boolean; resend?: 'timer' | 'ready'; invalid?: boolean; busy?: boolean }) {
  const o = c.o
  return (
    <>
      <p className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 leading-7">
        <span>
          کد ۵رقمی به <span dir="ltr" className="inline-block font-bold tabular-nums">{PHONE_FA}</span> پیامک شد.
        </span>
        <Link href={href(c, 's-phone')} className={cx(linkCls, 'text-sm')}>
          <Icon name="pencil" className="me-1.5 size-4" />
          ویرایش شماره
        </Link>
      </p>
      <MockForm label="ورود با کد" busy={busy}>
        <div className="grid gap-5">
          <CodeField o={o} label="کد ورود" length={5} invalid={invalid} describedBy="code-alert" />
          {newUser ? <Field o={o} id="name" name="name" label="نام و نام خانوادگی (فقط بار اول)" autoComplete="name" /> : null}
        </div>
        <div className="mt-5">
          <AlertRegion o={o} id="code-alert">
            {alert}
          </AlertRegion>
        </div>
        <PrimaryButton o={o} busy={busy} disabled={busy}>
          {busy ? 'در حال ورود…' : 'ورود'}
        </PrimaryButton>
      </MockForm>
      <div className="mt-4">
        {resend === 'timer' ? (
          <ResendTimer o={o} seconds={45} live={c.live} />
        ) : (
          <button type="button" className={cx(linkCls, 'gap-2')}>
            <Icon name="refresh" className="size-4" />
            کد نرسید؟ ارسال دوباره
          </button>
        )}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ staff -- */

function StaffForm({
  c,
  emailError,
  passwordError,
  alert,
  notice,
  busy,
  disabled,
  emailValue = '',
  hintPhone,
}: {
  c: Ctx
  emailError?: string
  passwordError?: string
  alert?: ReactNode
  notice?: ReactNode
  busy?: boolean
  disabled?: boolean
  emailValue?: string
  hintPhone?: boolean
}) {
  const o = c.o
  return (
    <>
      {notice ? <Notice o={o}>{notice}</Notice> : null}
      <MockForm label="ورود کارکنان" busy={busy}>
        <div className="grid gap-5">
          <Field
            o={o}
            id="email"
            name="email"
            type="email"
            label="ایمیل"
            dir="ltr"
            latin
            autoComplete="username"
            inputMode="email"
            placeholder={SAMPLE_EMAIL}
            defaultValue={emailValue}
            invalid={Boolean(emailError) || hintPhone}
            error={emailError}
            disabled={disabled}
            readOnly={busy}
            hint={
              hintPhone ? (
                <>
                  اینجا ایمیل کارکنان لازم است. دانشجو هستید؟{' '}
                  <Link href={href(c, 's-phone')} className={cx(linkCls, 'min-h-0 text-sm')}>
                    با شماره موبایل وارد شوید
                  </Link>
                  .
                </>
              ) : undefined
            }
          />
          <PasswordField o={o} label="رمز عبور" invalid={Boolean(passwordError)} error={passwordError} disabled={disabled} defaultValue={busy ? 'password-sample' : undefined} describedBy="staff-alert" />
        </div>
        <div className="mt-5">
          <AlertRegion o={o} id="staff-alert">
            {alert}
          </AlertRegion>
        </div>
        <PrimaryButton o={o} busy={busy} disabled={busy || disabled}>
          {busy ? 'در حال ورود…' : 'ورود'}
        </PrimaryButton>
      </MockForm>
      <p className="mt-5 text-sm leading-7 text-muted">رمز را فراموش کرده‌اید؟ از مدیر آکادمی بخواهید رمز تازه برایتان تعیین کند.</p>
      <Actions>
        <GhostLink c={c} to="s-phone">
          دانشجو هستید؟ ورود با شماره موبایل
        </GhostLink>
      </Actions>
    </>
  )
}

function Verify({ c, alert, hint, locked }: { c: Ctx; alert?: ReactNode; hint?: string; locked?: boolean }) {
  const o = c.o
  const form = (disabled: boolean) => (
    <MockForm label="تأیید دومرحله‌ای">
      <CodeField o={o} label="کد تأیید" length={6} disabled={disabled} invalid={Boolean(alert) && !locked} describedBy="v-alert" hint={hint} />
      <div className="mt-5">
        <AlertRegion o={o} id="v-alert">
          {disabled ? undefined : alert}
        </AlertRegion>
      </div>
      <PrimaryButton o={o} disabled={disabled}>
        تأیید و ادامه
      </PrimaryButton>
    </MockForm>
  )
  return (
    <>
      <p dir="ltr" className="mb-5 inline-block max-w-full truncate font-latin text-sm font-bold">
        {SAMPLE_EMAIL}
      </p>
      {locked ? (
        <LockGate o={o} seconds={15 * 60 - 1} live={c.live} text="چند بار کد اشتباه وارد شد. تا ۱۵ دقیقهٔ دیگر امکان ورود ندارید." locked={form(true)} open={form(false)} openStatus="می‌توانید دوباره امتحان کنید." />
      ) : (
        form(false)
      )}
      <details className="mt-5 border-b border-line pb-3 text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center font-medium">گوشی خود را ندارید؟</summary>
        <p className="leading-7 text-muted">از مدیر آکادمی بخواهید تأیید دومرحله‌ای حساب شما را بازنشانی کند.</p>
      </details>
      <Actions>
        <GhostLink c={c} to="t-empty">
          خروج از حساب
        </GhostLink>
      </Actions>
    </>
  )
}

function Enrol({ c }: { c: Ctx }) {
  const o = c.o
  const step = (n: string, children: ReactNode) => (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3">
      <span aria-hidden="true" className={cx(disp, 'grid size-8 place-items-center border border-line-strong text-lg font-black', o === 'c' ? 'rounded-none' : 'rounded-full')}>
        {n}
      </span>
      <div className="min-w-0 grid gap-3 pt-0.5">{children}</div>
    </li>
  )
  return (
    <>
      <p role="note" className="mb-6 flex items-start gap-2.5 border-s-4 border-accent ps-4 text-sm leading-7">
        <Icon name="alert" className="mt-1" />
        اگر گوشی خود را گم کنید، فقط مدیر آکادمی می‌تواند دسترسی شما را بازنشانی کند.
      </p>
      <ol className="grid gap-7">
        {step('۱', <p>یک برنامهٔ احراز هویت روی گوشی نصب کنید.<span className="block text-sm text-muted">Google Authenticator، FreeOTP، Aegis یا مشابه.</span></p>)}
        {step(
          '۲',
          <>
            <p>کد QR را اسکن کنید.</p>
            <QrPlaceholder className="size-40 rounded-md border border-line-strong p-2" />
            <p className="text-sm leading-7 text-muted">اگر نمی‌توانید اسکن کنید، این کلید را دستی وارد کنید:</p>
            <div className="flex flex-wrap items-center gap-3">
              <code dir="ltr" className="rounded-md bg-sunken px-3 py-2 font-latin text-sm font-bold tracking-wider">JBSW Y3DP EHPK 3PXP</code>
              <button type="button" className={cx(secondaryCls(o === 'c' ? 'a' : o), 'w-auto px-4')}>کپی کلید</button>
            </div>
          </>,
        )}
        {step(
          '۳',
          <MockForm label="فعال‌سازی">
            <CodeField o={o} label="کد شش‌رقمی‌ای را که برنامه نشان می‌دهد وارد کنید." length={6} />
            <div className="mt-5">
              <PrimaryButton o={o}>فعال‌سازی</PrimaryButton>
            </div>
          </MockForm>,
        )}
      </ol>
    </>
  )
}

/* ------------------------------------------------------------------ admin -- */

function PayloadForm({ c, name }: { c: Ctx; name: string }) {
  const o = c.o
  return (
    <>
      <MockForm label={`ورود به بخش مدیریت ${name}`}>
        <div className="grid gap-5">
          <Field o={o} id="admin-email" name="email" type="email" label="ایمیل" dir="ltr" latin autoComplete="username" inputMode="email" placeholder={SAMPLE_EMAIL} />
          <PasswordField o={o} label="رمز عبور" />
        </div>
        <div className="mt-5">
          <AlertRegion o={o} id="admin-alert" />
        </div>
        <PrimaryButton o={o}>ورود</PrimaryButton>
      </MockForm>
      <p className="mt-5 flex items-start gap-2.5 text-sm leading-7">
        <Icon name="compass" className="mt-1 size-4" />
        <span>
          کد دومرحله‌ای دارید؟{' '}
          <Link href={href(c, 't-empty')} className={cx(linkCls, 'min-h-0 text-sm')}>
            از صفحهٔ ورود کارکنان وارد شوید.
          </Link>
        </span>
      </p>
    </>
  )
}

function Toast({ c, children }: { c: Ctx; children: ReactNode }) {
  return (
    <div role="alert" className={cx('flex items-start gap-2.5 border bg-surface px-4 py-3 text-sm leading-7 shadow-sm', c.o === 'c' ? 'rounded-none border-ink' : 'rounded-lg border-danger/60')}>
      <Icon name="alert" className="mt-1 text-danger" />
      <p>
        <strong className="text-danger">خطا.</strong> {children}
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------- the map -- */

export function getScreen(id: string, c: Ctx): ScreenContent | null {
  const name = c.tenant.name
  const t = c.tenant
  switch (id) {
    case 's-phone':
      return { kind: 'form', title: 'ورود یا ثبت‌نام', sub: 'شماره موبایل خود را بنویسید تا کد ورود برایتان پیامک شود. رمز عبور لازم نیست.', body: <PhoneForm c={c} /> }
    case 's-phone-error':
      return { kind: 'form', title: 'ورود یا ثبت‌نام', sub: 'شماره موبایل خود را بنویسید تا کد ورود برایتان پیامک شود. رمز عبور لازم نیست.', body: <PhoneForm c={c} value="09123" error="شماره موبایل درست نیست. با ۰۹ شروع می‌شود و ۱۱ رقم دارد؛ مثل ۰۹۱۲۳۴۵۶۷۸۹." /> }
    case 's-submitting':
      return { kind: 'form', title: 'ورود یا ثبت‌نام', sub: 'شماره موبایل خود را بنویسید تا کد ورود برایتان پیامک شود. رمز عبور لازم نیست.', body: <PhoneForm c={c} busy value={SAMPLE_PHONE_LATIN} /> }
    case 's-session':
      return { kind: 'form', title: 'ورود یا ثبت‌نام', sub: 'شماره موبایل خود را بنویسید تا کد ورود برایتان پیامک شود. رمز عبور لازم نیست.', body: <PhoneForm c={c} extra={<Notice o={c.o}>برای ادامه، وارد شوید.</Notice>} /> }
    case 's-code':
      return { kind: 'form', title: 'کد را وارد کنید', body: <CodeStep c={c} /> }
    case 's-code-new':
      return { kind: 'form', title: 'کد را وارد کنید', body: <CodeStep c={c} newUser /> }
    case 's-code-wrong':
      return { kind: 'form', title: 'کد را وارد کنید', body: <CodeStep c={c} invalid alert="کد درست نیست. دوباره بررسی کنید." /> }
    case 's-code-expired':
      return { kind: 'form', title: 'کد را وارد کنید', body: <CodeStep c={c} resend="ready" alert="کد منقضی شده است. کد تازه بگیرید." /> }
    case 's-locked':
      return {
        kind: 'form',
        title: 'کد را وارد کنید',
        body: (
          <>
            <div role="alert" className={cx('mb-5 border-danger p-4', c.o === 'c' ? 'border-s-4 ps-4' : cx('border-2', c.o === 'a' ? 'rounded-lg' : 'rounded-md'))}>
              <p className="flex items-start gap-2.5 leading-7">
                <Icon name="lock" className="mt-1 text-danger" />
                <span>
                  <strong className="text-danger">قفل.</strong> چند بار کد اشتباه وارد شد. کد تازه بگیرید.
                </span>
              </p>
            </div>
            <MockForm label="دریافت کد تازه">
              <PrimaryButton o={c.o}>کد نرسید؟ ارسال دوباره</PrimaryButton>
            </MockForm>
            <p className="mt-6 text-sm text-muted">
              شمارهٔ <span dir="ltr" className="inline-block font-bold tabular-nums text-ink">{PHONE_FA}</span> را اشتباه نوشته‌اید؟{' '}
              <Link href={href(c, 's-phone')} className={cx(linkCls, 'min-h-0 text-sm')}>ویرایش شماره</Link>
            </p>
          </>
        ),
      }
    case 's-ratelimit':
      return {
        kind: 'form',
        title: 'ورود یا ثبت‌نام',
        sub: 'شماره موبایل خود را بنویسید تا کد ورود برایتان پیامک شود. رمز عبور لازم نیست.',
        body: (
          <LockGate
            o={c.o}
            seconds={15 * 60 - 1}
            live={c.live}
            text="درخواست‌های زیادی ثبت شد. ۱۵ دقیقهٔ دیگر دوباره امتحان کنید."
            locked={<MockForm label="دریافت کد ورود"><Field o={c.o} id="phone" name="phone" type="tel" label="شماره موبایل" dir="ltr" latin inputMode="tel" autoComplete="tel" defaultValue={SAMPLE_PHONE_LATIN} disabled /><div className="mt-5"><PrimaryButton o={c.o} disabled>دریافت کد ورود</PrimaryButton></div></MockForm>}
            open={<PhoneForm c={c} value={SAMPLE_PHONE_LATIN} />}
            openStatus="می‌توانید دوباره امتحان کنید."
          />
        ),
      }
    case 's-suspended':
      return {
        kind: 'form',
        title: 'کد را وارد کنید',
        body: (
          <>
            <div className="mb-5"><AlertRegion o={c.o} id="s-alert">ورود با این شماره ممکن نیست. با پشتیبانی آکادمی تماس بگیرید.</AlertRegion></div>
            <SupportLine o={c.o} label="پشتیبانی آکادمی:" phone={t.phone} />
            <Actions>
              <GhostLink c={c} to="s-phone">بازگشت</GhostLink>
            </Actions>
          </>
        ),
      }

    case 't-empty':
      return { kind: 'form', title: 'ورود کارکنان', sub: 'برای ورود به میز کار و بخش مدیریت.', body: <StaffForm c={c} /> }
    case 't-validation':
      return { kind: 'form', title: 'ورود کارکنان', sub: 'برای ورود به میز کار و بخش مدیریت.', body: <StaffForm c={c} emailValue="name@" emailError="ایمیل را کامل بنویسید؛ مثل name@example.com." passwordError="رمز عبور را وارد کنید." /> }
    case 't-wrong':
      return { kind: 'form', title: 'ورود کارکنان', sub: 'برای ورود به میز کار و بخش مدیریت.', body: <StaffForm c={c} emailValue={SAMPLE_EMAIL} alert="ایمیل یا رمز عبور درست نیست." /> }
    case 't-phone-hint':
      return { kind: 'form', title: 'ورود کارکنان', sub: 'برای ورود به میز کار و بخش مدیریت.', body: <StaffForm c={c} emailValue={SAMPLE_PHONE_LATIN} hintPhone /> }
    case 't-suspended':
      return { kind: 'form', title: 'ورود کارکنان', sub: 'برای ورود به میز کار و بخش مدیریت.', body: <StaffForm c={c} emailValue={SAMPLE_EMAIL} alert="حساب شما غیرفعال است. با مدیر آکادمی تماس بگیرید." /> }
    case 't-locked':
      return {
        kind: 'form',
        title: 'ورود کارکنان',
        sub: 'برای ورود به میز کار و بخش مدیریت.',
        body: (
          <LockGate
            o={c.o}
            seconds={10 * 60 - 1}
            live={c.live}
            text="ورود موقتاً بسته شده است. ۱۰ دقیقهٔ دیگر دوباره امتحان کنید."
            locked={<StaffForm c={c} emailValue={SAMPLE_EMAIL} disabled />}
            open={<StaffForm c={c} emailValue={SAMPLE_EMAIL} />}
            openStatus="می‌توانید دوباره امتحان کنید."
          />
        ),
      }
    case 't-submitting':
      return { kind: 'form', title: 'ورود کارکنان', sub: 'برای ورود به میز کار و بخش مدیریت.', body: <StaffForm c={c} busy emailValue={SAMPLE_EMAIL} /> }
    case 't-expired':
      return { kind: 'form', title: 'ورود کارکنان', sub: 'برای ورود به میز کار و بخش مدیریت.', body: <StaffForm c={c} notice="نشست شما تمام شده است. دوباره وارد شوید." /> }
    case 't-out':
      return { kind: 'form', title: 'ورود کارکنان', sub: 'برای ورود به میز کار و بخش مدیریت.', body: <StaffForm c={c} notice="از حساب خارج شدید." /> }
    case 't-2fa':
      return { kind: 'form', title: 'تأیید دومرحله‌ای', sub: 'کد ۶رقمی را از برنامهٔ احراز هویت گوشی خود وارد کنید.', body: <Verify c={c} /> }
    case 't-2fa-wrong':
      return { kind: 'form', title: 'تأیید دومرحله‌ای', sub: 'کد ۶رقمی را از برنامهٔ احراز هویت گوشی خود وارد کنید.', body: <Verify c={c} alert="کد درست نیست. ۳ بار دیگر می‌توانید امتحان کنید." hint="هنوز درست نیست؟ ساعت گوشی باید روی حالت خودکار باشد." /> }
    case 't-2fa-locked':
      return { kind: 'form', title: 'تأیید دومرحله‌ای', sub: 'کد ۶رقمی را از برنامهٔ احراز هویت گوشی خود وارد کنید.', body: <Verify c={c} locked /> }
    case 't-enrol':
      return { kind: 'form', title: 'فعال‌سازی تأیید دومرحله‌ای', body: <Enrol c={c} /> }

    case 'a-skin':
      return { kind: 'form', tag: 'مدیریت', title: `ورود به بخش مدیریت ${name}`, body: <PayloadForm c={c} name={name} /> }
    case 'a-error':
      return { kind: 'form', tag: 'مدیریت', title: `ورود به بخش مدیریت ${name}`, toast: <Toast c={c}>ایمیل یا رمز عبور درست نیست.</Toast>, body: <PayloadForm c={c} name={name} /> }
    case 'a-suspended':
      return { kind: 'form', tag: 'مدیریت', title: `ورود به بخش مدیریت ${name}`, toast: <Toast c={c}>حساب شما غیرفعال است. با مدیر آکادمی تماس بگیرید.</Toast>, body: <PayloadForm c={c} name={name} /> }
    case 'a-moved':
      return {
        kind: 'status',
        tag: 'مدیریت',
        title: 'ورود به بخش مدیریت از صفحهٔ ورود کارکنان است.',
        body: (
          <>
            <p className="leading-8">همان ایمیل و رمز عبور را آن‌جا وارد کنید؛ اگر تأیید دومرحله‌ای دارید، همان‌جا کد را می‌پرسیم.</p>
            <Actions>
              <Link href={href(c, 't-empty')} className={cx('inline-flex w-full items-center font-bold bg-brand text-brand-ink hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus', c.o === 'a' && 'h-12 justify-center gap-2 rounded-lg', c.o === 'b' && 'h-12 justify-center gap-2 rounded-md ring-1 ring-inset ring-brand-ink/30', c.o === 'c' && 'h-14 justify-between rounded-none px-5 text-lg')}>
                رفتن به ورود کارکنان
                {c.o === 'c' ? <Icon name="arrow" /> : <Icon name="arrow" className="size-4" />}
              </Link>
            </Actions>
          </>
        ),
      }

    case 'forgot':
      return {
        kind: 'status',
        title: 'رمز را فراموش کرده‌اید؟',
        body: (
          <>
            <p className="leading-8">از مدیر آکادمی بخواهید رمز تازه برایتان تعیین کند.</p>
            <div className="mt-5">
              <SupportLine o={c.o} label="پشتیبانی آکادمی:" phone={t.phone} />
            </div>
            <Actions>
              <GhostLink c={c} to="t-empty">بازگشت به ورود</GhostLink>
            </Actions>
          </>
        ),
      }
    case 'tenant-unknown':
      return {
        kind: 'status',
        neutral: true,
        title: 'این نشانی به آکادمی‌ای وصل نیست.',
        body: <p className="leading-8">نشانی را بررسی کنید یا از پیوند رسمی آکادمی وارد شوید.</p>,
      }
    case 'maintenance':
      return {
        kind: 'status',
        title: 'در حال به‌روزرسانی هستیم',
        body: (
          <p className="leading-8">
            ساعت <span dir="ltr" className="inline-block font-bold tabular-nums">۱۴:۰۰</span> دوباره سر بزنید.
          </p>
        ),
      }
    case 'error-server':
      return { kind: 'form', title: 'ورود یا ثبت‌نام', sub: 'شماره موبایل خود را بنویسید تا کد ورود برایتان پیامک شود. رمز عبور لازم نیست.', body: <PhoneForm c={c} value={SAMPLE_PHONE_LATIN} alert="مشکلی پیش آمد. دوباره امتحان کنید." /> }
    case 'error-network':
      return {
        kind: 'form',
        title: 'ورود یا ثبت‌نام',
        sub: 'شماره موبایل خود را بنویسید تا کد ورود برایتان پیامک شود. رمز عبور لازم نیست.',
        body: (
          <>
            <PhoneForm c={c} value={SAMPLE_PHONE_LATIN} alert="اتصال برقرار نشد. اینترنت را بررسی کنید و دوباره امتحان کنید." />
            <div className="mt-4">
              <button type="button" className={cx(linkCls, 'gap-2')}>
                <Icon name="wifi-off" className="size-4" />
                تلاش دوباره
              </button>
            </div>
          </>
        ),
      }
    default:
      return null
  }
}

export { DEMO_TENANT }
