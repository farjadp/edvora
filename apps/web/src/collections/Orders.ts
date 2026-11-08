import { canChangeOrderStatusManually, lockedOrderChanges, priceOrder, type OrderStatus } from '@edvora/core'
import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook, CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { allow, allowCreate, anyOf, canIn, guard, isSystemWrite, nobody, ownRecords } from '../access/permissions'
import { auditChange } from '../hooks/audit'
import { CheckoutError, findCoupon, toCoreCoupon } from '../lib/coupons'
import { idOf } from '../lib/ids'

const STATUS = [
  { value: 'pending', label: { fa: 'در انتظار پرداخت', en: 'Pending' } },
  { value: 'partially_paid', label: { fa: 'پرداخت قسطی', en: 'Partially paid' } },
  { value: 'paid', label: { fa: 'پرداخت شده', en: 'Paid' } },
  { value: 'failed', label: { fa: 'ناموفق', en: 'Failed' } },
  { value: 'refunded', label: { fa: 'مسترد شده', en: 'Refunded' } },
  { value: 'cancelled', label: { fa: 'لغو شده', en: 'Cancelled' } },
]

/** An order with its instalment schedule and every gateway attempt. All amounts in rials. */
const SCOPE = { course: 'course', cohort: 'cohort' }

const amount = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : 0)

/**
 * ACC-02: an order created by a person (REST, admin) is priced here from the course/cohort and an academy coupon.
 * Amounts, instalments and payments sent by the caller are replaced; a status other than pending is refused, and
 * any discount needs `discount.give` and a valid coupon (its own limits apply). Server code (checkout, import,
 * seed) runs without a user and is not touched. Runs before validation so the computed totals satisfy `required`.
 */
const priceOnCreate: CollectionBeforeValidateHook = async ({ data, req, operation }) => {
  if (operation !== 'create' || !req.user || isSystemWrite(req) || !data) return data
  if ((data.status ?? 'pending') !== 'pending') throw new APIError('A new order is always pending; only a payment marks it paid', 403)
  if (Array.isArray(data.payments) && data.payments.length > 0) throw new APIError('Payments are recorded by the payment flow only', 403)
  if ((data.source ?? 'site') !== 'site') throw new APIError('Only the WordPress import creates imported orders', 403)

  const tenantId = idOf(data.tenant)
  const courseId = idOf(data.course)
  if (tenantId === null || courseId === null) return data // required-field validation answers this
  const course = await req.payload.findByID({ collection: 'courses', id: courseId, depth: 0, overrideAccess: true, req, disableErrors: true })
  if (!course || idOf(course.tenant) !== tenantId) throw new APIError('This course is not in this academy', 400)
  let price: number | null | undefined = course.price
  const cohortId = idOf(data.cohort)
  if (cohortId !== null) {
    const cohort = await req.payload.findByID({ collection: 'cohorts', id: cohortId, depth: 0, overrideAccess: true, req, disableErrors: true })
    if (!cohort || idOf(cohort.course) !== courseId) throw new APIError('This cohort is not part of the course', 400)
    price = cohort.priceOverride ?? course.price
  }
  if (typeof price !== 'number') throw new APIError('This course has no price yet', 400)

  const code = typeof data.couponCode === 'string' ? data.couponCode.trim() : ''
  if ((code || amount(data.discount) > 0) && !(await canIn(req, tenantId, 'discount.give'))) {
    throw new APIError('Giving a discount needs discount.give', 403)
  }
  if (!code && amount(data.discount) > 0) throw new APIError('A discount comes from one of the academy’s coupon codes', 400)
  let coupon = null
  try {
    coupon = await findCoupon(req.payload, tenantId, code, req)
  } catch (e) {
    if (e instanceof CheckoutError) throw new APIError(e.message, 400)
    throw e
  }

  const priced = priceOrder({ price, coupon: toCoreCoupon(coupon), maxInstalments: course.maxInstalments, firstDueDate: new Date() })
  return {
    ...data,
    subtotal: priced.subtotal,
    discount: priced.discount,
    total: priced.total,
    couponCode: coupon?.code ?? null,
    status: 'pending',
    source: 'site',
    instalments: priced.instalments.map((p) => ({ index: p.index, amount: p.amount, dueDate: p.dueDate.toISOString(), status: 'pending' })),
    payments: [],
  }
}

/**
 * ACC-03: after creation, money fields change only through the payment flow (server code). A person may cancel an
 * unpaid order; marking it paid by hand needs the manual-payment flow (record + approve by a second person,
 * ADR 006), which is not built yet, so it is refused here.
 */
const lockMoney: CollectionBeforeChangeHook = async ({ data, originalDoc, req, operation }) => {
  if (operation !== 'update' || !req.user || isSystemWrite(req) || !data || !originalDoc) return data
  const locked = lockedOrderChanges(originalDoc, data)
  if (locked.length > 0) throw new APIError(`${locked.join(', ')} change only through the payment flow`, 403)
  if ('status' in data && data.status !== undefined) {
    const from = (originalDoc.status ?? 'pending') as OrderStatus
    if (!canChangeOrderStatusManually(from, data.status as OrderStatus)) {
      throw new APIError('Paid and refunded come only from the payment flow (manual payments need a second person)', 403)
    }
  }
  return data
}

export const Orders: CollectionConfig = {
  slug: 'orders',
  labels: { singular: { fa: 'سفارش', en: 'Order' }, plural: { fa: 'سفارش‌ها', en: 'Orders' } },
  admin: {
    components: { beforeListTable: ['/components/admin/ListKpis#ListKpis'] }, defaultColumns: ['id', 'user', 'course', 'total', 'status', 'createdAt'], group: { fa: 'فروش', en: 'Sales' } },
  access: {
    read: anyOf(ownRecords('user'), allow('orders.view', SCOPE)),
    // Students' orders are created by the checkout server action (server code, no API access needed).
    create: allowCreate('orders.create_for_lead'),
    update: allow('orders.edit', SCOPE),
    delete: nobody,
  },
  hooks: {
    beforeValidate: [priceOnCreate],
    beforeChange: [guard({ create: ['orders.create_for_lead'], update: ['orders.edit'], fields: SCOPE }), lockMoney],
    afterChange: [auditChange('orders')],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
        { name: 'course', type: 'relationship', relationTo: 'courses', required: true },
        { name: 'cohort', type: 'relationship', relationTo: 'cohorts' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'subtotal', type: 'number', required: true, min: 0 },
        { name: 'discount', type: 'number', defaultValue: 0, min: 0 },
        { name: 'total', type: 'number', required: true, min: 0 },
        { name: 'couponCode', type: 'text' },
      ],
    },
    { name: 'status', type: 'select', required: true, defaultValue: 'pending', index: true, options: STATUS },
    {
      // E-032: imported orders are history only (no payment flow, no notifications).
      name: 'source',
      type: 'select',
      defaultValue: 'site',
      index: true,
      label: { fa: 'منبع', en: 'Source' },
      options: [
        { value: 'site', label: { fa: 'سایت', en: 'Site' } },
        { value: 'import', label: { fa: 'انتقال از وردپرس', en: 'WordPress import' } },
      ],
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'instalments',
      type: 'array',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'index', type: 'number', required: true },
            { name: 'amount', type: 'number', required: true },
            { name: 'dueDate', type: 'date', required: true },
            {
              name: 'status',
              type: 'select',
              defaultValue: 'pending',
              options: [
                { value: 'pending', label: { fa: 'سررسید نشده', en: 'Pending' } },
                { value: 'paid', label: { fa: 'پرداخت شده', en: 'Paid' } },
              ],
            },
          ],
        },
        { name: 'paidAt', type: 'date' },
      ],
    },
    {
      name: 'payments',
      type: 'array',
      label: { fa: 'تراکنش‌ها', en: 'Gateway attempts' },
      admin: { readOnly: true },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'instalmentIndex', type: 'number', required: true },
            // 'zarinpal' | 'mock' | … for live attempts, 'imported' for history brought in by the WordPress import.
            { name: 'provider', type: 'text', required: true },
            { name: 'authority', type: 'text', required: true, index: true },
            { name: 'amount', type: 'number', required: true },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'status',
              type: 'select',
              defaultValue: 'started',
              options: [
                { value: 'started', label: 'Started' },
                { value: 'verified', label: 'Verified' },
                { value: 'failed', label: 'Failed' },
              ],
            },
            { name: 'refId', type: 'text' },
            { name: 'cardPan', type: 'text' },
            { name: 'error', type: 'text' },
          ],
        },
        {
          type: 'row',
          fields: [
            // E-032: the original WooCommerce gateway id (e.g. WC_ZPal) and its title, for imported history.
            { name: 'gateway', type: 'text' },
            { name: 'gatewayTitle', type: 'text' },
          ],
        },
      ],
    },
  ],
}
