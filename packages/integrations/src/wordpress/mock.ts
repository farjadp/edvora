/**
 * Mock WordPress source (AGENTS.md "every adapter has a mock"): a small Persian sample site with WooCommerce
 * (IRT) + Woo Memberships + LifterLMS + Tutor + Digits phones. Every record is invented test data
 * (`example.ir`, test phone numbers); it covers the importer's edge cases:
 * duplicate phone, user without phone, foreign phone, fractional price, unmapped product, unsupported question
 * types, SpotPlayer/Presto lessons, Persian URL-encoded slugs, Arabic ي/ك, guest order matched by phone.
 */
import { makeRecord, type ManifestInput, type SourceRecord } from './format'
import { sha256Hex } from './signature'
import { MockSource } from './sources'

export const MOCK_HOME_URL = 'https://academy.example.ir'
export const MOCK_SITE_ID = sha256Hex(`${MOCK_HOME_URL}|wp_`)
export const MOCK_TENANT = 'iba'
export const MOCK_SECRET = 'edvora-test-secret'

const enc = (s: string) => encodeURIComponent(s).toLowerCase()
const json = (v: unknown) => `json:${JSON.stringify(v)}`

export const mockManifest: ManifestInput = {
  format: 'edvora-wp-export',
  formatVersion: 1,
  pluginVersion: '1.0.0',
  createdAtGmt: '2026-11-06T10:00:00Z',
  connectionId: 'cnx_mock',
  tenantSlug: MOCK_TENANT,
  site: {
    siteId: MOCK_SITE_ID,
    homeUrl: MOCK_HOME_URL,
    siteUrl: MOCK_HOME_URL,
    name: 'آکادمی نمونه',
    wpVersion: '5.7.21',
    phpVersion: '7.4.33',
    locale: 'fa_IR',
    timezone: 'Asia/Tehran',
    gmtOffset: 3.5,
    permalinkStructure: '/%postname%/',
    uploadsBaseUrl: `${MOCK_HOME_URL}/wp-content/uploads`,
  },
  plugins: [
    { slug: 'woocommerce', folder: 'woocommerce', version: '5.4.4', active: true },
    { slug: 'woocommerce-memberships', folder: 'woocommerce-memberships', version: '1.27.4', active: true },
    { slug: 'lifterlms', folder: 'lifterlmsfa', version: '4.21.3', active: true },
    { slug: 'tutor', folder: 'tutor', version: '2.7.0', active: true },
    { slug: 'digits', folder: 'digits', version: '7.7', active: true },
  ],
  theme: { stylesheet: 'buddyboss-theme', template: 'buddyboss-theme', version: '1.0' },
  woo: { currency: 'IRT', hpos: false, priceDecimals: 0 },
  lifterlms: { currency: 'IRR' },
  tutor: { currency: 'USD', monetizeBy: 'wc' },
  counts: {},
}

const user = (id: number, login: string, email: string, meta: Record<string, string>, roles: string[] = ['subscriber']) =>
  makeRecord('wp.user', id, { ID: String(id), user_login: login, user_email: email, user_registered: '2021-03-04 08:12:00', display_name: login, user_nicename: login }, { meta: { wp_capabilities: json(Object.fromEntries(roles.map((r) => [r, true]))), ...meta } })

const post = (kind: string, id: number, data: Record<string, string>, meta: Record<string, string> = {}, rel?: Record<string, string[]>) =>
  makeRecord(kind, id, { ID: String(id), post_status: 'publish', post_date: '2022-01-01 12:30:00', post_date_gmt: '2022-01-01 09:00:00', post_content: '', post_excerpt: '', menu_order: '0', post_parent: '0', post_author: '1', ...data }, { meta, ...(rel ? { rel } : {}) })

const order = (id: number, data: Record<string, string>, items: Record<string, unknown>[], meta: Record<string, string> = {}) =>
  makeRecord(
    'woo.order',
    id,
    {
      id: String(id),
      currency: 'IRT',
      discount_total: '0',
      tax_total: '0',
      billing_first_name: '',
      billing_last_name: '',
      billing_email: '',
      billing_phone: '',
      payment_method: 'WC_ZPal',
      payment_method_title: 'زرین‌پال',
      transaction_id: '',
      date_created_gmt: '2022-05-01 12:00:00',
      date_paid_gmt: '2022-05-01 12:03:10',
      date_completed_gmt: '',
      parent_id: '0',
      type: 'shop_order',
      ...data,
    },
    { meta, items },
  )

const line = (id: number, productId: number, name: string, subtotal: string, total = subtotal) => ({ id: String(id), type: 'line_item', name, product_id: String(productId), variation_id: '0', qty: 1, subtotal, total })
const um = (id: number, userId: number, postId: number, key: string, value: string, at = '2022-05-01 12:00:00') =>
  makeRecord('lifterlms.user_meta', id, { user_id: String(userId), post_id: String(postId), meta_key: key, meta_value: value, updated_date: at })

const BRAND = 'برندسازی'

export const mockRecords: SourceRecord[] = [
  // ---- users (Digits phones in every shape)
  user(1, 'admin', 'admin@example.ir', { first_name: 'مدیر', last_name: 'سایت', digits_phone: '+989121110001' }, ['administrator']),
  user(2, 'sara', 'Sara@Example.ir', { first_name: 'سارا', last_name: 'كريمي', digits_phone: '+989121234567', melli_code: '0499370899', billing_city: 'تهران' }),
  user(3, 'ali', 'ali@example.ir', { first_name: 'علي', last_name: 'رضايي', digits_phone_no: '9351234567', digt_countrycode: '+98', national_code: '1234567890' }),
  user(4, 'maryam', 'maryam@example.ir', { first_name: 'مریم', last_name: 'نوری', mobile: '۰۹۱۲۷۷۷۸۸۸۸' }),
  user(5, 'maryam2', 'maryam2@example.ir', { first_name: 'مریم', last_name: 'احمدی', billing_phone: '0912 777 8888' }),
  user(6, 'nophone', 'nophone@example.ir', { first_name: 'بی', last_name: 'شماره' }),
  user(7, 'john', 'john@example.com', { first_name: 'John', last_name: 'Doe', digits_phone: '+13214446666' }),
  user(8, 'negar', 'negar@example.ir', { first_name: 'نگار', last_name: 'محمدی', mobile: '09131112222' }, ['subscriber', 'tutor_instructor']),

  // ---- terms, media, posts
  makeRecord('wp.term', 70, { term_id: '70', name: 'برند', slug: enc('برند'), taxonomy: 'category', parent: '0', description: '', count: '1' }),
  post('wp.attachment', 50, { post_type: 'attachment', post_title: 'کاور دوره', post_mime_type: 'image/jpeg', guid: `${MOCK_HOME_URL}/wp-content/uploads/2022/01/cover.jpg` }, { _wp_attached_file: '2022/01/cover.jpg', _wp_attachment_image_alt: 'کاور دوره برندسازی' }),
  post('wp.attachment', 51, { post_type: 'attachment', post_title: 'ویدیو جلسه', post_mime_type: 'video/mp4', guid: `${MOCK_HOME_URL}/wp-content/uploads/2022/01/intro.mp4` }, { _wp_attached_file: '2022/01/intro.mp4' }),
  post('wp.attachment', 52, { post_type: 'attachment', post_title: 'بروشور', post_mime_type: 'application/pdf', guid: 'https://cdn.example-cdn.ir/brochure.pdf' }),
  post(
    'wp.post',
    60,
    { post_type: 'post', post_title: 'برندينگ چيست؟', post_name: enc('برندینگ-چیست'), post_content: '<p onclick="x()">متن مقاله</p>[gallery ids="1,2"]<script>alert(1)</script>', post_excerpt: '<b>خلاصه</b>' },
    { _thumbnail_id: '50' },
    { terms: ['70'] },
  ),
  post('wp.post', 61, { post_type: 'page', post_title: 'درباره ما', post_name: 'about', post_content: '[vc_row][vc_column]متن[/vc_column][/vc_row]' }, { _elementor_edit_mode: 'builder' }),
  post('wp.post', 62, { post_type: 'post', post_title: 'زباله', post_name: 'trash', post_status: 'trash' }),

  // ---- WooCommerce
  post('woo.product', 100, { post_type: 'product', post_title: `دوره ${BRAND}`, post_name: enc(`دوره-${BRAND}`), post_excerpt: 'دوره جامع' }, { _regular_price: '8470000', _price: '8470000', _thumbnail_id: '50' }),
  post('woo.product', 101, { post_type: 'product', post_title: 'تفکر استراتژیک (آنلاین)', post_name: enc('تفکر-استراتژیک') }, { _regular_price: '23450000', _sale_price: '20000000' }),
  post('woo.product', 102, { post_type: 'product', post_title: 'کارگاه کوچینگ', post_name: 'coaching' }, { _regular_price: '1234.56', _related_course: '1101' }),
  post('woo.product', 103, { post_type: 'product', post_title: 'بلیت همایش', post_name: 'event-ticket' }, { _regular_price: '500000' }),
  post('woo.coupon', 200, { post_type: 'shop_coupon', post_title: 'norooz' }, { discount_type: 'percent', coupon_amount: '20', date_expires: '1893456000', usage_limit: '100', usage_count: '3' }),
  post('woo.coupon', 201, { post_type: 'shop_coupon', post_title: 'FIXED50' }, { discount_type: 'fixed_cart', coupon_amount: '50000', date_expires: '1600000000', product_ids: json([100]) }),
  post('woo.coupon', 202, { post_type: 'shop_coupon', post_title: 'BAD' }, { discount_type: 'percent', coupon_amount: '150' }),
  order(300, { status: 'wc-completed', total: '8470000', customer_id: '2', transaction_id: 'A00000000000000000000000000123456789' }, [line(1, 100, `دوره ${BRAND}`, '8470000')], { _zarinpal_authority: 'A00000000000000000000000000123456789' }),
  order(
    301,
    { status: 'wc-processing', total: '31370000', customer_id: '3', payment_method: 'WC_Gateway_Zibal', payment_method_title: 'زیبال', transaction_id: 'Z-1' },
    [line(2, 100, `دوره ${BRAND}`, '8470000', '8445000'), line(3, 101, 'تفکر استراتژیک', '23450000', '23425000'), { id: '4', type: 'coupon', code: 'fixed50', discount: '50000' }],
    { _zibal_track_id: '9988' },
  ),
  order(302, { status: 'wc-refunded', total: '23450000', customer_id: '2' }, [line(5, 101, 'تفکر استراتژیک', '23450000')]),
  order(303, { status: 'wc-pending', total: '8470000', customer_id: '4' }, [line(6, 100, `دوره ${BRAND}`, '8470000')]),
  order(304, { status: 'wc-completed', total: '1234', customer_id: '0', billing_phone: '+98 935 123 4567' }, [line(7, 102, 'کارگاه کوچینگ', '1234')]),
  order(305, { status: 'wc-completed', total: '500000', customer_id: '8' }, [line(8, 103, 'بلیت همایش', '500000')]),
  order(306, { status: 'wc-cancelled', total: '8470000', customer_id: '2' }, [line(9, 100, `دوره ${BRAND}`, '8470000')]),
  order(307, { status: 'wc-completed', total: '8470000', customer_id: '6' }, [line(10, 100, `دوره ${BRAND}`, '8470000')]),
  order(308, { status: 'wc-completed', total: '99.5', customer_id: '2', currency: 'IRR' }, [line(11, 100, `دوره ${BRAND}`, '99.5')]),
  post('woo.membership_plan', 400, { post_type: 'wc_membership_plan', post_title: 'عضویت طلایی' }, { _product_ids: json(['100']) }),
  post('woo.membership', 410, { post_type: 'wc_user_membership', post_author: '4', post_parent: '400', post_status: 'wcm-active' }, { _start_date: '2022-06-01 00:00:00' }),
  post('woo.membership', 411, { post_type: 'wc_user_membership', post_author: '3', post_parent: '400', post_status: 'wcm-expired' }, { _start_date: '2021-06-01 00:00:00', _end_date: '2022-06-01 00:00:00' }),

  // ---- LifterLMS (Arabic ي in the course title: must still match the Woo product title)
  post('lifterlms.course', 1100, { post_type: 'course', post_title: 'دوره برندسازي', post_name: enc(`دوره-${BRAND}`), post_excerpt: 'برند از صفر' }, { _thumbnail_id: '50' }),
  post('lifterlms.course', 1101, { post_type: 'course', post_title: 'کارگاه کوچینگ', post_name: 'coaching' }),
  post('lifterlms.course', 1102, { post_type: 'course', post_title: 'دوره خالی', post_name: 'empty' }),
  post('lifterlms.section', 1150, { post_type: 'section', post_title: 'فصل اول' }, { _llms_order: '1', _llms_parent_course: '1100' }),
  post('lifterlms.section', 1151, { post_type: 'section', post_title: 'فصل دوم' }, { _llms_order: '2', _llms_parent_course: '1100' }),
  post('lifterlms.section', 1152, { post_type: 'section', post_title: 'جلسات' }, { _llms_order: '1', _llms_parent_course: '1101' }),
  post('lifterlms.lesson', 1200, { post_type: 'lesson', post_title: 'جلسه سوم', post_name: enc('جلسه-سوم'), post_content: '<p>متن جلسه</p>' }, { _llms_parent_course: '1100', _llms_parent_section: '1151', _llms_order: '1', _llms_video_embed: 'https://cdn.example.ir/v/3.m3u8', _llms_quiz: '1400', _llms_require_passing_grade: 'yes' }),
  post('lifterlms.lesson', 1201, { post_type: 'lesson', post_title: 'جلسه دوم', post_name: 'lesson-2' }, { _llms_parent_course: '1100', _llms_parent_section: '1150', _llms_order: '2', _llms_drip_method: 'enrollment', _llms_days_before_available: '7' }),
  post('lifterlms.lesson', 1202, { post_type: 'lesson', post_title: 'جلسه اول', post_name: 'lesson-1' }, { _llms_parent_course: '1100', _llms_parent_section: '1150', _llms_order: '1', _llms_free_lesson: 'yes', _llms_video_embed: 'https://www.youtube.com/watch?v=abc' }),
  post('lifterlms.lesson', 1203, { post_type: 'lesson', post_title: 'جلسه پرستو', post_name: 'presto', post_content: '<!-- wp:presto-player/reusable-display {"id":5} /-->' }, { _llms_parent_course: '1100', _llms_parent_section: '1151', _llms_order: '2' }),
  post('lifterlms.lesson', 1204, { post_type: 'lesson', post_title: 'جلسه اسپات', post_name: 'spot', post_content: '[spotplayer id="x"]' }, { _llms_parent_course: '1101', _llms_parent_section: '1152', _llms_order: '1' }),
  post('lifterlms.access_plan', 1300, { post_type: 'llms_access_plan', post_title: 'پرداخت کامل' }, { _llms_price: '1', _llms_product_id: '1100', _llms_frequency: '0' }),
  post('lifterlms.access_plan', 1301, { post_type: 'llms_access_plan', post_title: 'پرداخت کامل' }, { _llms_price: '7770000', _llms_product_id: '1101', _llms_frequency: '0' }),
  post('lifterlms.access_plan', 1302, { post_type: 'llms_access_plan', post_title: 'موقت' }, { _llms_price: '1', _llms_product_id: '1102', _llms_frequency: '0' }),
  post('lifterlms.quiz', 1400, { post_type: 'llms_quiz', post_title: 'آزمون فصل دوم' }, { _llms_lesson_id: '1200', _llms_passing_percent: '70', _llms_limit_attempts: 'yes', _llms_allowed_attempts: '3', _llms_limit_time: 'no' }),
  post('lifterlms.question', 1500, { post_type: 'llms_question', post_title: 'برند چیست؟', menu_order: '1' }, { _llms_question_type: 'choice', _llms_multi_choices: 'no', _llms_points: '2', _llms_parent_id: '1400', _llms_choice_a: json({ choice: 'هویت', correct: true, marker: 'A' }), _llms_choice_b: json({ choice: 'لوگو', correct: false, marker: 'B' }) }),
  post('lifterlms.question', 1501, { post_type: 'llms_question', post_title: 'کدام‌ها درست‌اند؟', menu_order: '2' }, { _llms_question_type: 'choice', _llms_multi_choices: 'yes', _llms_parent_id: '1400', _llms_choice_a: json({ choice: 'الف', correct: true, marker: 'A' }), _llms_choice_b: json({ choice: 'ب', correct: true, marker: 'B' }), _llms_choice_c: json({ choice: 'ج', correct: false, marker: 'C' }) }),
  post('lifterlms.question', 1502, { post_type: 'llms_question', post_title: 'برند همان لوگو است.', menu_order: '3' }, { _llms_question_type: 'true_false', _llms_parent_id: '1400', _llms_choice_a: json({ choice: 'True', correct: false, marker: 'A' }), _llms_choice_b: json({ choice: 'False', correct: true, marker: 'B' }) }),
  post('lifterlms.question', 1503, { post_type: 'llms_question', post_title: 'مرتب کنید', menu_order: '4' }, { _llms_question_type: 'reorder', _llms_parent_id: '1400' }),
  post('lifterlms.question', 1504, { post_type: 'llms_question', post_title: 'توضیح دهید', menu_order: '5' }, { _llms_question_type: 'short_answer', _llms_parent_id: '1400' }),
  post('lifterlms.certificate', 1600, { post_type: 'llms_my_certificate', post_title: 'گواهی برندسازی', post_author: '2', guid: `${MOCK_HOME_URL}/?post_type=llms_my_certificate&p=1600` }, { _llms_related: '1100', _llms_awarded: '2023-03-01 10:00:00', _llms_sequential_id: '12' }),
  post('lifterlms.order', 1700, { post_type: 'llms_order', post_title: 'سفارش' }),
  um(1, 2, 1100, '_status', 'enrolled', '2022-05-01 12:00:00'),
  um(2, 2, 1100, '_start_date', '2022-05-01 16:30:00'),
  um(3, 2, 1202, '_is_complete', 'yes'),
  um(4, 2, 1201, '_is_complete', 'yes'),
  um(5, 2, 1100, '_status', 'enrolled', '2023-01-01 12:00:00'),
  um(6, 3, 1100, '_status', 'enrolled', '2022-05-01 12:00:00'),
  um(7, 3, 1100, '_status', 'cancelled', '2022-09-01 12:00:00'),
  um(8, 6, 1101, '_status', 'enrolled'),
  um(9, 2, 1204, '_is_complete', 'yes'),
  um(10, 2, 1600, '_certificate_earned', '1600'),

  // ---- Tutor (linked to Woo product 101 by `_tutor_course_product_id`)
  post('tutor.course', 2000, { post_type: 'courses', post_title: 'تفکر استراتژیک', post_name: enc('تفکر-استراتژیک') }, { _tutor_course_product_id: '101', _tutor_course_price_type: 'paid' }),
  post('tutor.topic', 2100, { post_type: 'topics', post_title: 'مقدمه', post_parent: '2000', menu_order: '1' }),
  post('tutor.lesson', 2200, { post_type: 'lesson', post_title: 'آشنایی', post_name: 'intro', post_parent: '2100', menu_order: '1' }, { _video: json({ source: 'html5', source_video_id: '51', runtime: { hours: '00', minutes: '12', seconds: '30' } }), _is_preview: '1' }),
  post('tutor.lesson', 2201, { post_type: 'lesson', post_title: 'ابزارها', post_name: 'tools', post_parent: '2100', menu_order: '2' }, { _video: json({ source: 'youtube', source_youtube: 'https://youtu.be/xyz' }) }),
  post('tutor.quiz', 2300, { post_type: 'tutor_quiz', post_title: 'آزمون مقدمه', post_parent: '2100' }, { tutor_quiz_option: json({ passing_grade: 80, attempts_allowed: 3, time_limit: { time_value: 10, time_type: 'minutes' } }) }),
  makeRecord('tutor.question', 2400, { question_id: '2400', quiz_id: '2300', question_title: 'استراتژی یعنی؟', question_type: 'single_choice', question_mark: '1', question_order: '1' }, { items: [{ answer_title: 'برنامه بلندمدت', is_correct: '1', answer_order: '1' }, { answer_title: 'تاکتیک', is_correct: '0', answer_order: '2' }] }),
  makeRecord('tutor.question', 2401, { question_id: '2401', quiz_id: '2300', question_title: 'استراتژی قابل تغییر است.', question_type: 'true_false', question_mark: '1', question_order: '2' }, { items: [{ answer_title: 'درست', is_correct: '1', answer_order: '1' }, { answer_title: 'نادرست', is_correct: '0', answer_order: '2' }] }),
  makeRecord('tutor.question', 2402, { question_id: '2402', quiz_id: '2300', question_title: 'جفت کنید', question_type: 'matching', question_mark: '1', question_order: '3' }, { items: [] }),
  makeRecord('tutor.question', 2403, { question_id: '2403', quiz_id: '2300', question_title: 'یک کلمه: هویت سازمان؟', question_type: 'short_answer', question_mark: '1', question_order: '4' }, { items: [{ answer_title: 'برند', is_correct: '1', answer_order: '1' }] }),
  post('tutor.enrollment', 2500, { post_type: 'tutor_enrolled', post_author: '8', post_parent: '2000', post_status: 'completed', post_date_gmt: '2023-02-01 08:00:00' }),
  post('tutor.enrollment', 2501, { post_type: 'tutor_enrolled', post_author: '2', post_parent: '2000', post_status: 'pending' }),
  makeRecord('tutor.progress', '8:2200', { user_id: '8', lesson_id: '2200', completed_at: '2023-02-02 08:00:00' }),
]

/** Fresh mock source over the sample site (records are shared, treat them as read-only). */
export function createMockSource(overrides: { manifest?: Partial<ManifestInput>; records?: SourceRecord[] } = {}): MockSource {
  return new MockSource({ ...mockManifest, ...overrides.manifest }, overrides.records ?? mockRecords)
}
