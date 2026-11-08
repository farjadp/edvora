import { PAYMENT_METHOD_KEYS, PAYMENT_METHODS, USDT_NETWORK_KEYS, isValidCardNumber, looksLikeWallet, tomanToRial, type PaymentMethodKey } from '@edvora/core'
import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook, CollectionConfig, Field } from 'payload'
import { APIError } from 'payload'
import { allow, nobody } from '../access/permissions'
import { lockSandboxPaymentSecrets } from '../access/sandbox'
import { auditChange } from '../hooks/audit'
import { idOf } from '../lib/ids'
import { CREDENTIAL_KEYS, openCredentials, sealCredentials, type CredentialKey } from '../lib/paymentSecrets'

/** Credentials each gateway needs (mirrors the integrations adapters; kept here so the admin bundle stays pure). */
const NEEDS: Partial<Record<PaymentMethodKey, readonly CredentialKey[]>> = {
  mellat: ['terminalId', 'username', 'password'],
  saman: ['terminalId'],
  zarinpal: ['merchantId'],
  zibal: ['merchantId'],
  idpay: ['apiKey'],
  payir: ['apiKey'],
  nextpay: ['apiKey'],
}

const CRED_LABELS: Record<CredentialKey, { fa: string; en: string }> = {
  merchantId: { fa: 'شناسهٔ پذیرنده (Merchant ID)', en: 'Merchant ID' },
  terminalId: { fa: 'شمارهٔ ترمینال', en: 'Terminal ID' },
  username: { fa: 'نام کاربری درگاه', en: 'Username' },
  password: { fa: 'رمز درگاه', en: 'Password' },
  apiKey: { fa: 'کلید API', en: 'API key' },
}

const kindOf = (d: unknown) => {
  const m = (d as { method?: unknown } | undefined)?.method
  return typeof m === 'string' && m in PAYMENT_METHODS ? PAYMENT_METHODS[m as PaymentMethodKey].kind : null
}
const isMethod = (key: PaymentMethodKey) => (data: unknown) => (data as { method?: unknown } | undefined)?.method === key

/** Write-only inputs: never stored as typed, never read back. The hook seals them into `credentialsSealed`. */
const credentialInputs: Field[] = CREDENTIAL_KEYS.map((k) => ({
  name: `cred_${k}`,
  type: 'text',
  virtual: true,
  label: CRED_LABELS[k],
  admin: {
    autoComplete: 'off',
    description: { fa: 'برای تغییر، مقدار تازه را وارد کنید. خالی بگذارید تا مقدار ذخیره‌شده بماند.', en: 'Type a new value to replace it. Leave empty to keep the stored value.' },
    condition: (data: unknown) => {
      const m = (data as { method?: PaymentMethodKey } | undefined)?.method
      return Boolean(m && NEEDS[m]?.includes(k))
    },
  },
  hooks: { afterRead: [() => undefined] },
}))

/** One academy can configure each method once. */
const uniquePerAcademy: CollectionBeforeValidateHook = async ({ data, req, originalDoc, operation }) => {
  if (!data) return data
  const tenant = idOf(data.tenant ?? originalDoc?.tenant)
  const method = data.method ?? originalDoc?.method
  if (tenant === null || !method) return data
  if (operation === 'update' && originalDoc && data.method && data.method !== originalDoc.method) throw new APIError('The method of a row cannot change; add a new row instead', 400)
  const dup = await req.payload.find({
    collection: 'payment-methods',
    where: { and: [{ tenant: { equals: tenant } }, { method: { equals: method } }, ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : [])] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (dup.docs.length > 0) throw new APIError('This method is already configured for this academy', 400)
  return data
}

/**
 * Seals credentials (ADR 017 §4), converts the toman rate to rials, and checks that an enabled method is usable.
 * Runs for every write; whatever a caller sends in `credentialsSealed` / `credentialsSet` / `usdtRateRial` is replaced.
 */
const sealAndCheck: CollectionBeforeChangeHook = async ({ data, originalDoc, req, operation }) => {
  if (!data) return data
  const before =
    operation === 'update' && originalDoc?.id
      ? await req.payload.findByID({ collection: 'payment-methods', id: originalDoc.id, depth: 0, overrideAccess: true, showHiddenFields: true, req })
      : null
  const stored = openCredentials(before?.credentialsSealed ?? null) ?? {}
  const next = { ...stored }
  for (const k of CREDENTIAL_KEYS) {
    const v = (data as Record<string, unknown>)[`cred_${k}`]
    if (typeof v === 'string' && v.trim() !== '') next[k] = v.trim()
    delete (data as Record<string, unknown>)[`cred_${k}`]
  }
  const keys = CREDENTIAL_KEYS.filter((k) => Boolean(next[k]))
  data.credentialsSealed = keys.length ? sealCredentials(next) : null
  data.credentialsSet = keys

  const method = (data.method ?? before?.method) as PaymentMethodKey
  const kind = PAYMENT_METHODS[method]?.kind
  if (kind === 'usdt') {
    const toman = data.usdtRateToman
    const rateRial = typeof toman === 'number' && toman > 0 ? tomanToRial(Math.round(toman)) : null
    if (rateRial !== (before?.usdtRateRial ?? null)) data.usdtRateUpdatedAt = rateRial ? new Date().toISOString() : null
    data.usdtRateRial = rateRial
  }

  if (data.enabled) {
    const fail = (m: string) => {
      throw new APIError(m, 400)
    }
    if (kind === 'gateway' && data.mode === 'live') {
      const missing = (NEEDS[method] ?? []).filter((k) => !next[k])
      if (missing.length) fail(`Live mode needs: ${missing.join(', ')}`)
    }
    if (kind === 'card') {
      const cards = (data.cards ?? []) as { number?: string | null }[]
      if (cards.length === 0) fail('Card-to-card needs at least one card number')
    }
    if (kind === 'usdt') {
      if (!data.usdtLegalAck) fail('Tether: confirm the academy has done its own legal check before enabling it')
      if (!data.usdtRateRial) fail('Tether needs a rate (toman per 1 USDT)')
      const wallets = (data.wallets ?? []) as { network?: string; address?: string }[]
      if (wallets.length === 0) fail('Tether needs at least one wallet address')
    }
  }
  return data
}

export const PaymentMethods: CollectionConfig = {
  slug: 'payment-methods',
  labels: { singular: { fa: 'روش پرداخت', en: 'Payment method' }, plural: { fa: 'روش‌های پرداخت', en: 'Payment methods' } },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'method', 'enabled', 'mode', 'position'],
    group: { fa: 'فروش', en: 'Sales' },
    description: {
      fa: 'روش‌هایی که دانشجو هنگام پرداخت می‌بیند. اطلاعات درگاه رمزگذاری می‌شود و هرگز نمایش داده نمی‌شود. اگر هیچ روشی تعریف نشود، درگاه پیش‌فرض ادورا استفاده می‌شود.',
      en: 'Methods students see at checkout. Gateway credentials are encrypted and never shown. With no rows, the instance default gateway is used.',
    },
  },
  defaultSort: 'position',
  access: {
    read: allow('payments.settings'),
    create: allow('payments.settings'),
    update: allow('payments.settings'),
    // Turn a method off instead; rows are kept for the history of payments made with them.
    delete: nobody,
  },
  hooks: {
    // E-029: demo sandboxes never hold real payment secrets (ADR 013).
    beforeValidate: [lockSandboxPaymentSecrets, uniquePerAcademy],
    beforeChange: [sealAndCheck],
    afterChange: [auditChange('payment-methods')],
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'method',
          type: 'select',
          required: true,
          index: true,
          label: { fa: 'روش', en: 'Method' },
          options: PAYMENT_METHOD_KEYS.map((k) => ({ value: k, label: PAYMENT_METHODS[k].label })),
        },
        { name: 'enabled', type: 'checkbox', defaultValue: false, label: { fa: 'فعال', en: 'Enabled' } },
        { name: 'position', type: 'number', defaultValue: 10, label: { fa: 'ترتیب نمایش', en: 'Order' }, admin: { description: { fa: 'عدد کوچک‌تر بالاتر', en: 'Lower first' } } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'title', type: 'text', required: true, label: { fa: 'نام نمایشی (فارسی)', en: 'Display name (Persian)' } },
        {
          name: 'mode',
          type: 'select',
          defaultValue: 'sandbox',
          required: true,
          label: { fa: 'حالت', en: 'Mode' },
          options: [
            { value: 'sandbox', label: { fa: 'آزمایشی', en: 'Sandbox' } },
            { value: 'live', label: { fa: 'واقعی', en: 'Live' } },
          ],
          admin: { condition: (d) => kindOf(d) === 'gateway' || kindOf(d) === 'usdt' },
        },
      ],
    },
    {
      name: 'instructions',
      type: 'textarea',
      label: { fa: 'راهنمای کوتاه برای دانشجو', en: 'Short note for students' },
      admin: { condition: (d) => kindOf(d) !== 'manual' },
    },
    {
      type: 'collapsible',
      label: { fa: 'اطلاعات درگاه (رمزگذاری‌شده)', en: 'Gateway credentials (encrypted)' },
      admin: { condition: (d) => kindOf(d) === 'gateway' },
      fields: [
        {
          name: 'credentialsSet',
          type: 'select',
          hasMany: true,
          label: { fa: 'مقادیر ذخیره‌شده', en: 'Stored values' },
          options: CREDENTIAL_KEYS.map((k) => ({ value: k, label: CRED_LABELS[k] })),
          admin: { readOnly: true, description: { fa: 'فقط نشان می‌دهد کدام مقدار ذخیره شده است؛ خود مقدار هرگز نمایش داده نمی‌شود.', en: 'Which values are stored. The values are never shown.' } },
        },
        ...credentialInputs,
      ],
    },
    // Sealed JSON of the credentials. Hidden from REST, GraphQL and the admin; only server code opens it.
    { name: 'credentialsSealed', type: 'text', hidden: true },
    {
      name: 'cards',
      type: 'array',
      label: { fa: 'کارت‌های مقصد', en: 'Destination cards' },
      admin: { condition: isMethod('card') },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'number',
              type: 'text',
              required: true,
              label: { fa: 'شمارهٔ کارت (۱۶ رقم)', en: 'Card number' },
              validate: (v: unknown) => (typeof v === 'string' && isValidCardNumber(v)) || 'شمارهٔ کارت معتبر نیست',
            },
            { name: 'holder', type: 'text', required: true, label: { fa: 'به نام', en: 'Holder' } },
            { name: 'bank', type: 'text', label: { fa: 'بانک', en: 'Bank' } },
          ],
        },
      ],
    },
    {
      name: 'usdtWarning',
      type: 'ui',
      admin: { condition: isMethod('usdt'), components: { Field: '/components/admin/UsdtWarning#UsdtWarning' } },
    },
    {
      name: 'usdtLegalAck',
      type: 'checkbox',
      defaultValue: false,
      label: { fa: 'آکادمی بررسی حقوقی خود را انجام داده و مسئولیت پذیرش تتر را می‌پذیرد', en: 'The academy has done its own legal check and accepts responsibility' },
      admin: { condition: isMethod('usdt') },
    },
    {
      type: 'row',
      admin: { condition: isMethod('usdt') },
      fields: [
        {
          name: 'usdtRateToman',
          type: 'number',
          min: 1,
          label: { fa: 'نرخ هر تتر (تومان)', en: 'Rate: toman per 1 USDT' },
          admin: { description: { fa: 'دستی تنظیم می‌شود؛ ادورا نرخ را از جایی نمی‌خواند.', en: 'Set by hand; no rate feed.' }, step: 1 },
        },
        { name: 'usdtRateRial', type: 'number', admin: { readOnly: true, description: { fa: 'همان نرخ به ریال (محاسبهٔ خودکار)', en: 'Same rate in rials (computed)' } }, label: { fa: 'نرخ به ریال', en: 'Rate in rials' } },
        { name: 'usdtRateUpdatedAt', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } }, label: { fa: 'آخرین تغییر نرخ', en: 'Rate changed at' } },
      ],
    },
    {
      name: 'wallets',
      type: 'array',
      label: { fa: 'کیف پول‌های آکادمی', en: 'Academy wallets' },
      admin: { condition: isMethod('usdt') },
      validate: (rows: unknown) => {
        const list = Array.isArray(rows) ? (rows as { network?: string }[]) : []
        const nets = list.map((r) => r.network)
        return new Set(nets).size === nets.length || 'برای هر شبکه فقط یک کیف پول'
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'network',
              type: 'select',
              required: true,
              label: { fa: 'شبکه', en: 'Network' },
              options: USDT_NETWORK_KEYS.map((n) => ({ value: n, label: n === 'trc20' ? 'TRC20 (ترون)' : 'BEP20 (BSC)' })),
            },
            {
              name: 'address',
              type: 'text',
              required: true,
              label: { fa: 'آدرس کیف پول', en: 'Address' },
              validate: (v: unknown, { siblingData }: { siblingData: { network?: string } }) => {
                const net = siblingData?.network === 'bep20' ? 'bep20' : 'trc20'
                return (typeof v === 'string' && looksLikeWallet(net, v)) || 'آدرس با شبکه هم‌خوانی ندارد'
              },
            },
          ],
        },
      ],
    },
    {
      name: 'manualChannels',
      type: 'select',
      hasMany: true,
      defaultValue: ['cash', 'pos', 'transfer'],
      label: { fa: 'شیوه‌های ثبت دستی', en: 'Manual channels' },
      options: [
        { value: 'cash', label: { fa: 'نقدی', en: 'Cash' } },
        { value: 'pos', label: { fa: 'کارت‌خوان', en: 'POS' } },
        { value: 'transfer', label: { fa: 'واریز بانکی', en: 'Bank transfer' } },
        { value: 'other', label: { fa: 'سایر', en: 'Other' } },
      ],
      admin: { condition: isMethod('manual') },
    },
  ],
}
