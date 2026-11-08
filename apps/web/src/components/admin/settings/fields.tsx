import type { ReactNode } from 'react'

/**
 * Plain form primitives for the settings hub (E-047). Server components; styled by `ed-set*` classes in custom.scss
 * (Payload admin has no Tailwind). Every input has a visible label and optional help text tied by aria-describedby.
 */
type Base = { name: string; label: string; help?: string; id?: string }
const idOf = (b: Base) => b.id ?? `f-${b.name.replace(/[^a-zA-Z0-9]+/g, '-')}`

function Help({ id, help }: { id: string; help?: string }) {
  return help ? (
    <p id={`${id}-help`} className="ed-set__help">
      {help}
    </p>
  ) : null
}

export function TextField(props: Base & { value?: string | null; type?: 'text' | 'email' | 'url' | 'tel' | 'number'; dir?: 'ltr' | 'rtl'; placeholder?: string; required?: boolean; maxLength?: number; autoComplete?: string }) {
  const id = idOf(props)
  return (
    <div className="ed-set__field">
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        name={props.name}
        type={props.type ?? 'text'}
        defaultValue={props.value ?? ''}
        dir={props.dir}
        placeholder={props.placeholder}
        required={props.required}
        maxLength={props.maxLength}
        autoComplete={props.autoComplete ?? 'off'}
        aria-describedby={props.help ? `${id}-help` : undefined}
        className="ed-set__input"
      />
      <Help id={id} help={props.help} />
    </div>
  )
}

export function TextArea(props: Base & { value?: string | null; rows?: number; maxLength?: number }) {
  const id = idOf(props)
  return (
    <div className="ed-set__field">
      <label htmlFor={id}>{props.label}</label>
      <textarea id={id} name={props.name} rows={props.rows ?? 3} defaultValue={props.value ?? ''} maxLength={props.maxLength} aria-describedby={props.help ? `${id}-help` : undefined} className="ed-set__input" />
      <Help id={id} help={props.help} />
    </div>
  )
}

export function Select(props: Base & { value?: string | null; options: readonly { value: string; fa: string }[]; allowEmpty?: string }) {
  const id = idOf(props)
  return (
    <div className="ed-set__field">
      <label htmlFor={id}>{props.label}</label>
      <select id={id} name={props.name} defaultValue={props.value ?? ''} aria-describedby={props.help ? `${id}-help` : undefined} className="ed-set__input">
        {props.allowEmpty !== undefined ? <option value="">{props.allowEmpty}</option> : null}
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.fa}
          </option>
        ))}
      </select>
      <Help id={id} help={props.help} />
    </div>
  )
}

export function Checkbox(props: Base & { checked?: boolean | null }) {
  const id = idOf(props)
  return (
    <div className="ed-set__check">
      <input id={id} type="checkbox" name={props.name} defaultChecked={Boolean(props.checked)} aria-describedby={props.help ? `${id}-help` : undefined} />
      <label htmlFor={id}>{props.label}</label>
      <Help id={id} help={props.help} />
    </div>
  )
}

/** Image upload with the current file shown; type and size are checked again on the server (by content). */
export function ImageField(props: Base & { url?: string | null; accept: string; removable?: boolean }) {
  const id = idOf(props)
  return (
    <div className="ed-set__field">
      <label htmlFor={id}>{props.label}</label>
      <div className="ed-set__image">
        {props.url ? <img src={props.url} alt="" className="ed-set__thumb" /> : <span className="ed-set__thumb ed-set__thumb--empty">بدون تصویر</span>}
        <input id={id} type="file" name={props.name} accept={props.accept} aria-describedby={`${id}-help`} className="ed-set__file" />
      </div>
      <p id={`${id}-help`} className="ed-set__help">
        {props.help}
      </p>
      {props.url && props.removable !== false ? (
        <div className="ed-set__check">
          <input id={`${id}-remove`} type="checkbox" name={`${props.name}.remove`} />
          <label htmlFor={`${id}-remove`}>حذف تصویر فعلی</label>
        </div>
      ) : null}
    </div>
  )
}

/** A write-only secret: the stored value is never sent to the browser. */
export function SecretField(props: Base & { isSet: boolean; opens: boolean; setAt?: string | null }) {
  const id = idOf(props)
  const state = !props.isSet ? 'ذخیره نشده' : props.opens ? `ذخیره شده${props.setAt ? ` (${props.setAt})` : ''}` : 'ذخیره شده ولی باز نمی‌شود (کلید سرور عوض شده) — دوباره وارد کنید'
  return (
    <div className="ed-set__field">
      <label htmlFor={id}>{props.label}</label>
      <input id={id} name={props.name} type="password" autoComplete="new-password" dir="ltr" placeholder={props.isSet ? '•••••••• (برای تغییر، مقدار تازه بنویسید)' : ''} aria-describedby={`${id}-help`} className="ed-set__input" />
      <p id={`${id}-help`} className="ed-set__help">
        <span className="c-pill c-pill--neutral" data-testid={`secret-state-${props.name}`}>
          {state}
        </span>{' '}
        {props.help ?? 'رمزنگاری‌شده نگه‌داری می‌شود و هرگز نمایش داده نمی‌شود. خالی بگذارید تا تغییر نکند.'}
      </p>
      {props.isSet ? (
        <div className="ed-set__check">
          <input id={`${id}-clear`} type="checkbox" name={`${props.name}.clear`} />
          <label htmlFor={`${id}-clear`}>حذف کلید ذخیره‌شده</label>
        </div>
      ) : null}
    </div>
  )
}

export function Fieldset({ legend, help, children }: { legend: string; help?: string; children: ReactNode }) {
  return (
    <fieldset className="ed-set__fieldset">
      <legend>{legend}</legend>
      {help ? <p className="ed-set__help">{help}</p> : null}
      {children}
    </fieldset>
  )
}

/** The form shell: multipart POST to the section's route handler, explicit academy, save button. */
export function SettingsForm({ section, academy, children, submit = 'ذخیرهٔ تغییرات', extra }: { section: string; academy: number | null; children: ReactNode; submit?: string; extra?: ReactNode }) {
  return (
    <form method="post" action={`/api/settings/${section}`} encType="multipart/form-data" className="ed-set__form">
      {academy !== null ? <input type="hidden" name="academy" value={academy} /> : null}
      {children}
      <div className="ed-set__actions">
        <button type="submit" name="intent" value="save" className="c-btn c-btn--primary">
          {submit}
        </button>
        {extra}
      </div>
    </form>
  )
}
