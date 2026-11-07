# WordPress LMS landscape: research for the WordPress importer

**Purpose:** input for designing Edvora's "one-click migration from WordPress" importer.
**Accessed:** every source was accessed on **2026-11-06** unless a line says otherwise.
**Method:** primary sources first. That means plugin source code (GitHub clones at a pinned commit, wordpress.org release zips, wordpress.org SVN), the wordpress.org Plugins API, vendor developer docs, and live HTML or `/wp-json/` fingerprints of real Iranian sites. Third-party blogs are used only where nothing primary was reachable, and they are marked *(secondary)*.
**Conventions:** `[n]` points to the numbered Sources list at the end. `[unverified]` means no source confirmed the claim. "Verified in source" means I read the code myself (file paths given). Quotes are under 15 words.

> TL;DR for the importer team
> 1. Most Iranian academies on WordPress sell courses as **WooCommerce products** in **Toman (`IRT`)**, using a **local theme with its own course builder** (Studiare/استادیار leads by a wide margin). Video is delivered through **SpotPlayer** licences, and login goes through **Digits** or the theme's built-in OTP [30][31][35][36][53].
> 2. Among real LMS plugins, **Tutor LMS** (100k installs) and **LearnPress** (70k) are the realistic ones [1]. **LifterLMS** matters because **Iran Brand Academy runs it** (LifterLMS 4.21.3 in a renamed folder, on WordPress 5.7.21 and WooCommerce 5.4.4) [54].
> 3. Every IRT/IRR amount must be multiplied into integer rials. WooCommerce stores order totals as decimals in the shop currency, and Iranian shops overwhelmingly use `IRT` [16][42][53].
> 4. The WXR export (Tools > Export) is **not enough**. It has no custom LMS tables, no usermeta (so no Digits phone numbers), no WooCommerce HPOS tables, and no password hashes [28]. The importer needs a **database dump** or **authenticated REST**.

---

## Contents

- [A. WordPress LMS plugins](#a-wordpress-lms-plugins)
  - [A.0 Summary table](#a0-summary-table)
  - [A.1 LearnDash](#a1-learndash)
  - [A.2 Tutor LMS](#a2-tutor-lms)
  - [A.3 LearnPress](#a3-learnpress)
  - [A.4 LifterLMS](#a4-lifterlms)
  - [A.5 Masteriyo](#a5-masteriyo)
  - [A.6 Sensei LMS](#a6-sensei-lms)
  - [A.7 MasterStudy LMS](#a7-masterstudy-lms)
  - [A.8 Academy LMS](#a8-academy-lms)
  - [A.9 Corrections to the brief](#a9-corrections-to-the-brief)
- [B. Course selling: WooCommerce and memberships](#b-course-selling-woocommerce-and-memberships)
- [C. WordPress users and passwords](#c-wordpress-users-and-passwords)
- [D. The Iranian WordPress ecosystem](#d-the-iranian-wordpress-ecosystem)
- [E. Conclusions, recommendation and mapping](#e-conclusions-recommendation-and-mapping)
- [Sources](#sources)

---

## A. WordPress LMS plugins

Every subsection uses the same template: **Install signal · Licence · Hierarchy · Post types · Custom tables · Key meta · Enrollment and progress · Commerce link · Export/import · REST API · Importer notes.**

### A.0 Summary table

| Plugin | wp.org active installs [1] | Latest version [1] | Course → section → item | Custom tables | REST namespace |
| --- | --- | --- | --- | --- | --- |
| LearnDash | not on wp.org (commercial) | n/a | `sfwd-courses` → (sections in course meta) → `sfwd-lessons` → `sfwd-topic` / `sfwd-quiz` | `learndash_user_activity(_meta)`, `learndash_pro_quiz_*` | `ldlms/v1`, `ldlms/v2` [11] |
| Tutor LMS | 100,000+ | 4.2.0 (repo trunk: 4.2.1) | `courses` → `topics` → `lesson` / `tutor_quiz` / `tutor_assignments` | `tutor_quiz_*`, `tutor_orders`, `tutor_coupons`, … | `tutor/v1` |
| LearnPress | 70,000+ | 4.4.13 | `lp_course` → `learnpress_sections` row → `lp_lesson` / `lp_quiz` | `learnpress_*` (12+) | `lp/v1`, `learnpress/v1` |
| LifterLMS | 10,000+ | 11.0.1 | `course` → `section` → `lesson` (+ `llms_quiz`) | `lifterlms_user_postmeta`, `lifterlms_quiz_attempts`, … | `llms/v1` |
| MasterStudy LMS | 10,000+ | 3.7.58 | `stm-courses` → `stm_lms_curriculum_sections` row → `stm-lessons` / `stm-quizzes` | `stm_lms_*` (17 tables) | `masterstudy-lms/v2` |
| Sensei LMS | 9,000+ | 4.26.4 | `course` → `module` taxonomy → `lesson` → `quiz` | `sensei_lms_progress`, `sensei_lms_quiz_*` | `sensei-internal/v1` (internal only) |
| Masteriyo | 6,000+ | 3.5.1 | `mto-course` → `mto-section` → `mto-lesson` / `mto-quiz` | `masteriyo_user_items`, `masteriyo_order_items`, … | `masteriyo/v1` |
| Academy LMS | **closed on wp.org since 2026-10-11** (temporary, pending review) [1][55] | SVN trunk 4.0.8 [8] | `academy_courses` → curriculum array in postmeta → rows in `academy_lessons` | `academy_lessons`, `academy_lessonmeta`, … | (not confirmed) |

wp.org install counts are rounded buckets, and the API returns them as integers [1].

---

### A.1 LearnDash

- **Install signal:** not distributed on wordpress.org. I found no first-party install figure that I could confirm `[unverified]`. Third-party 2026 pricing pages give entry plans of roughly $199–$259 per year *(secondary)* [15].
- **Licence:** commercial with an annual licence [15]. The code licence was not checked `[unverified]`.
- **Hierarchy:** course `sfwd-courses` → lesson `sfwd-lessons` → topic `sfwd-topic` → quiz `sfwd-quiz`. Quizzes can attach to a course, a lesson or a topic. This is confirmed indirectly by two competitors' migrators. Academy's LearnDash migrator walks `learndash_course_get_sections()`, then finds topics and quizzes through postmeta `lesson_id = <lesson>` [8] (`addons/migration-tool/classes/learndash.php`). LearnPress's migrator reads the course postmeta `course_sections` for section headings [9] (`inc/LearnDashMigration/LearnDashDataDump.php`).
- **Course steps:** the class `LDLMS_Course_Steps` has `load_steps_meta()`, `save_steps_meta()` and `set_steps_count_meta()` [12]. The brief's key name **`ld_course_steps` is not confirmed** by any public page I could load `[unverified]`. Use LearnDash's API functions (`learndash_course_get_steps_by_type()`, used by both migrators [8][9]) or read the dump empirically.
- **Settings meta:** each post type keeps a **serialized array** in postmeta named after the type. Examples are `_sfwd-courses` with key `sfwd-courses_course_price`, and `_sfwd-lessons` with `sfwd-lessons_lesson_video_url`. Other keys inside these arrays include `sfwd-topic_lesson_video_url`, `sfwd-courses_expire_access_days`, `sfwd-courses_course_seats_limit`, `sfwd-courses_course_prerequisite`, `sfwd-quiz_passingpercentage`, and materials keys such as `sfwd-lessons_lesson_materials` [8]. The course-grid video is in `_learndash_course_grid_video_embed_code` [8].
- **Quiz questions:** quiz postmeta `ld_quiz_questions` lists question post IDs. Each question post has `question_pro_id`, which points to `{prefix}learndash_pro_quiz_question`. Older installs use `{prefix}wp_pro_quiz_question`, so code should check both [8]. Columns read by the migrator are `id, title, points, question, answer_type, answer_data`. `answer_data` is serialized PHP objects `[unverified: exact class]`. `answer_type` values include `single`, `multiple` and `cloze_answer` [8]. Quiz statistics live in `learndash_pro_quiz_statistic` [9].
- **Enrollment and progress:**
  - Usermeta `course_{ID}_access_from` holds a timestamp. It is documented as "user meta 'course_XXX_access_from'" [10].
  - Usermeta `_sfwd-course_progress` (a serialized array) and `_sfwd-quizzes` are read by the LearnPress migrator [9] (`LearnDashStudentDataMigration.php` lines 48 and 185–186).
  - Table `{prefix}learndash_user_activity` has columns `user_id, course_id, activity_type, activity_status, activity_started…`. Rows with `activity_type='access'` and `activity_status=0` are treated as enrollments, and rows with `activity_type='course'` and `activity_status=1` as completions [8]. A companion table `learndash_user_activity_meta` exists *(secondary)*.
- **Commerce link:** native price types live in course settings (`sfwd-courses_course_price` [8]). The WooCommerce/EDD integrations are separate add-ons `[unverified: meta keys]`.
- **Export/import:** built in under LearnDash LMS > Settings > Advanced > Import/Export. It produces a zip of courses, lessons, topics and quizzes, with no single-course export *(secondary)* [14].
- **REST API:** `ldlms/v1` and `ldlms/v2`. The v2 reference covers courses, lessons, topics, quizzes, questions, essays, groups, price types and user course progress. Its examples authenticate with `X-WP-Nonce` and the `wordpress_logged_in` cookie [11]. Application passwords are generic WordPress REST authentication [27], so they should also work `[unverified for LearnDash specifically]`. Versions before 4.10.3 exposed REST data without authentication (CVE-2024-1208/1210) *(secondary)* [13].
- **Importer notes:** reading LearnDash is the hardest of all, because of serialized PHP arrays, two generations of quiz tables, and course-builder "shared steps". Unserializing PHP needs a library on Node `[unverified: pick one]`.

---

### A.2 Tutor LMS

Verified in source at github.com/themeum/tutor commit `2df35d2` (header `Version: 4.2.1`, `License: GPLv2 or later`) [3].

- **Install signal:** 100,000+ active installs. Version 4.2.0 updated 2026-10-27 [1]. Tutor LMS Elementor Addons has 30,000+ [1].
- **Licence:** GPLv2+. A paid "Pro" add-on exists [3].
- **Hierarchy and post types:** `courses` → `topics` (the topic's `post_parent` is the course; ordered by `menu_order`, from `classes/Utils.php::get_topics`) → `lesson`, `tutor_quiz` and `tutor_assignments` (their `post_parent` is the topic). Lesson-to-course lookups also use postmeta `_tutor_course_id_for_lesson`. Other post types are `tutor_zoom_meeting` and `tutor-google-meet` [3].
- **Enrollment:** a post of type **`tutor_enrolled`** whose `post_author` is the student and whose `post_parent` is the course. Cancelling sets `post_status` to a cancel status or deletes the row. Postmeta `_tutor_enrolled_by_order_id` and `_tutor_enrolled_by_product_id` are defined in `models/EnrollmentModel.php` [3].
- **Progress:** usermeta **`_tutor_completed_lesson_id_{lessonId}`** per completed lesson (`classes/Utils.php` lines 805 and 1534). Course completion is a **comment** with `comment_type = 'course_completed'` [3].
- **Price meta:** `_tutor_course_price_type` (free/paid) [3]. With native monetization, `tutor_course_price` and `tutor_course_sale_price` (constants `COURSE_PRICE_META` and `COURSE_SALE_PRICE_META`). With WooCommerce, `_tutor_course_product_id` points to the product and the price is the product's `_regular_price`/`_sale_price` [3]. The setting `monetize_by` can be `tutor` (native, the default), `wc` or `pmpro` (`classes/Utils.php` lines 537–549 and 1197; `ecommerce/Ecommerce.php: MONETIZE_BY = 'tutor'`). The native default `currency_code` is `USD` with `number_of_decimals` set to 2 (`classes/Tutor.php` line 1267), so an Iranian site may have changed this or may still be on the default.
- **Video meta:** postmeta `_video` is an array whose `source` is one of `html5`, `external_url`, `youtube`, `vimeo`, `embedded` or `shortcode` (default `supported_video_sources`, `classes/Tutor.php` lines 1273–1280). Per-source keys are `source_html5`, `source_external_url`, `source_youtube`, `source_vimeo`, `source_embedded`, `source_shortcode`, `source_video_id`, and a newer `source_bunnynet` [3]. This confirms the brief's list, plus Bunny.net.
- **Other course meta:** `_course_duration`, `_tutor_course_level`, `_tutor_course_benefits`, `_tutor_course_requirements`, `_tutor_course_target_audience`, `_tutor_course_material_includes`, `_tutor_attachments`, `_tutor_is_public_course`, `_tutor_course_settings` [3].
- **Custom tables** (`classes/Tutor.php` from line 793):
  - Quiz: `tutor_quiz_attempts`, `tutor_quiz_attempt_answers`, `tutor_quiz_questions` (`question_id, quiz_id, question_title, question_description, answer_explanation, question_type, question_mark, question_settings, question_order`), and `tutor_quiz_question_answers` (`answer_id, belongs_question_id, belongs_question_type, answer_title, is_correct, image_id, answer_two_gap_match, answer_view_format, answer_settings, answer_order`).
  - Question types found in code: `true_false`, `single_choice`, `multiple_choice`, `open_ended`, `fill_in_the_blank`, `short_answer`, `matching`, `image_matching`, `image_answering`, `ordering`, `h5p`, `draw_image` [3].
  - Native e-commerce: **`tutor_orders`** (`transaction_id, user_id, order_type, order_status, payment_status, subtotal_price DECIMAL(13,2), total_price, net_payment, coupon_code, coupon_amount, discount_type ENUM('percentage','flat'), discount_amount, payment_method, payment_payloads, created_at_gmt…`), `tutor_ordermeta`, `tutor_order_items` (`regular_price, sale_price, discount_price, coupon_code`), and **`tutor_coupons`** (`coupon_code, discount_type, discount_amount, applies_to, total_usage_limit, per_user_usage_limit, start_date_gmt, expire_date_gmt`). Also `tutor_coupon_applications`, `tutor_coupon_usages`, `tutor_carts`, `tutor_cart_items` and `tutor_customers`.
  - Other: `tutor_earnings`, `tutor_withdraws`, `tutor_gradebooks(_results)`, and `tutor_subscription*` tables [3].
- **Export/import:** a Tools > "Import/Export" settings tab exists in the free plugin. It is labelled "Import/Export Settings", available since 3.6.0, and rendered by JavaScript (`views/options/template/import_export.php`, `classes/Tools_V2.php` line 309) [3]. Whether the free plugin exports *courses* or only settings was **not confirmed** `[unverified]`.
- **REST API:** namespace `tutor/v1` (`classes/RestAPI.php`) [3]:
  - Routes: `/auth/login`, `/auth/refresh`, `/auth/logout`, `/courses`, `/courses/{id}`, `/topics`, `/lessons`, `/quizzes`, `/quizzes/{id}`, `/quiz-question-answer/{id}`, `/quiz-attempt-details/{id}`, `/course-contents/{id}`, `/course-rating/{id}`, `/author-information/{id}`, `/course-announcement/{id}`.
  - Auth: per-user API key/secret in usermeta `tutor-api-key-secret`, with secrets now HMAC-hashed and JWT access tokens (`restapi/RestAuth.php`) [3].
  - The free API is **read-oriented content only**, with no enrollments or orders endpoints in the free code.
- **Importer notes:** Tutor is easy to read from a database dump, since everything is posts plus clear tables. Watch the dual commerce model (native `tutor_orders` vs WooCommerce orders), and the `DECIMAL(13,2)` money in the site currency.

---

### A.3 LearnPress

Verified in source at github.com/LearnPress/learnpress commit `ae50d1b` (4.4.13) [2].

- **Install signal:** 70,000+ active installs. Version 4.4.13 updated 2026-10-30 [1].
- **Licence:** GPL (a wp.org requirement). Paid add-ons are sold by ThimPress `[unverified: list]`.
- **Post types** (`inc/lp-constants.php`): `lp_course`, `lp_lesson`, `lp_quiz`, `lp_question`, `lp_order` [2].
- **Custom tables** (`config/table/tables-v4.php`) [2]:
  - `learnpress_sections`: `section_id, section_name, section_course_id, section_order, section_description`.
  - `learnpress_section_items`: `section_item_id, section_id, item_id, item_order, item_type`.
  - `learnpress_user_items`: `user_item_id, user_id, item_id, start_time, end_time, item_type, status, graduation, access_level, ref_id, ref_type, parent_id`. This holds enrollment and progress for courses, lessons and quizzes. `parent_id` links items to the course row. `ref_id`/`ref_type` point to the order.
  - `learnpress_user_itemmeta` and `learnpress_user_item_results` (quiz results as longtext).
  - `learnpress_order_items`: `order_item_id, order_item_name, order_id, item_id, item_type`.
  - `learnpress_order_itemmeta`.
  - `learnpress_quiz_questions`: `quiz_id, question_id, question_order`.
  - `learnpress_question_answers`: `question_id, title, … is_true`.
  - `learnpress_question_answermeta`.
  - Also `learnpress_files`, `learnpress_courses` (a denormalized course cache), `learnpress_sessions`, `learnpress_notes`, `learnpress_webhooks` and `learnpress_mcp_api_keys`.
  - The brief's four table names are **confirmed**.
- **Statuses** found in code: user items use `enrolled`, `started`, `in-progress`, `completed`, `finished`, `passed`, `failed`, `purchased`, `cancel`. Orders use `lp-pending`, `lp-processing`, `lp-completed`, `lp-cancelled`, `lp-failed`, `lp-refunded` [2].
- **Question types:** `true_or_false`, `single_choice`, `multi_choice`, `fill_in_blanks`, `sorting_choice` [2].
- **Key meta** (constants `META_KEY_*`) [2]:
  - Course: `_lp_price`, `_lp_regular_price`, `_lp_sale_price`, `_lp_sale_start`, `_lp_sale_end`, `_lp_course_is_sale`, `_lp_duration`, `_lp_max_students`, `_lp_students`, `_lp_level`, `_lp_course_result`, `_lp_passing_condition`, `_lp_final_quiz`, `_lp_no_required_enroll`, `_lp_offline_course`.
  - Lesson: `_lp_preview` (free preview) and `_lp_duration`. A lesson-intro video key `_lp_lesson_video_intro` exists. Lesson video is otherwise **embedded in `post_content`**, since there is no structured video field in core.
  - Order: `_order_currency`, `_order_subtotal`, `_order_total`, `_order_key`, `_payment_method`, `_payment_method_title`, `_transaction_id`, `_user_id`, `_user_ip_address`, `_created_via`, plus refund keys `_lp_refunded_amount` and `_lp_refunded_at`.
- **Commerce:** native `lp_order` with its own gateways. Iranian gateways plug in here: Gateland ships a LearnPress gateway [45], and "IDPay Payment Gateway For LearnPress" is on wp.org (50+ installs) [1]. A WooCommerce-payment add-on exists `[unverified: name and meta]`.
- **Export/import and migration:** the free add-on "LearnPress – Backup & Migration Tool" (`learnpress-import-export`, 5,000+ installs, 4.1.7) exports and imports LearnPress content [1][9]. It also offers a **one-click migration from Tutor LMS and LearnDash** into LearnPress, and its readme says it moves student data [9]. Its source is a useful reference for LearnDash and Tutor data shapes.
- **REST API:** namespaces `lp/v1`, `lp/v1/admin`, `lp/v1/admin/tools` and `learnpress/v1`, found in `inc/` [2]. Endpoint inventory and auth were not documented in this research `[unverified]`.
- **Importer notes:** clean relational design. The main risk is that `user_items` mixes course, lesson and quiz rows, so filter on `item_type` and `parent_id`.

---

### A.4 LifterLMS

Verified in source at github.com/gocodebox/lifterlms commit `8d933dc` (header `Version: 11.0.1`, `License: GPLv3`) [4]. **This is Iran Brand Academy's LMS** (§D.7).

- **Install signal:** 10,000+ active installs. Version 11.0.1 updated 2026-11-04 [1].
- **Licence:** GPLv3. Paid add-ons include a WooCommerce integration `[unverified: name]`.
- **Post types** (`includes/class.llms.post-types.php`): `course`, `section`, `lesson`, `llms_quiz`, `llms_question`, `llms_membership`, `llms_engagement`, `llms_order`, `llms_transaction`, `llms_achievement`, `llms_my_achievement`, `llms_certificate`, `llms_my_certificate`, `llms_coupon`, `llms_voucher`, `llms_access_plan` [4].
- **Meta convention:** all model properties are stored as postmeta with the prefix **`_llms_`** (`abstract.llms.post.model.php`: `$meta_prefix = '_llms_'`) [4].
  - Section: `_llms_order` and `_llms_parent_course`.
  - Lesson: `_llms_order`, `_llms_parent_course`, `_llms_parent_section`, **`_llms_free_lesson`** (yes/no), **`_llms_video_embed`** (an oEmbed URL), `_llms_audio_embed`, `_llms_quiz`, `_llms_quiz_enabled`, `_llms_drip_method`, `_llms_days_before_available`, `_llms_date_available`, `_llms_prerequisite`, `_llms_points`.
  - Course: `_llms_length`, `_llms_capacity`, `_llms_enable_capacity`, `_llms_start_date`, `_llms_end_date`, `_llms_enrollment_start_date`, `_llms_enrollment_end_date`, `_llms_instructors`, `_llms_video_embed`, `_llms_prerequisite`.
  - Access plan (where the price lives): `_llms_price` (**float**), `_llms_sale_price`, `_llms_on_sale`, `_llms_is_free`, `_llms_frequency` (0 = one-time), `_llms_length`, `_llms_period`, `_llms_access_expiration`, `_llms_access_length`, `_llms_access_period`, `_llms_product_id` (links the plan to its course or membership), `_llms_trial_*`, `_llms_sku`, `_llms_availability_restrictions`.
  - Order: `_llms_user_id`, `_llms_product_id`, `_llms_plan_id`, `_llms_total`, `_llms_original_total`, `_llms_currency`, `_llms_coupon_code`, `_llms_coupon_id`, `_llms_coupon_amount`, `_llms_payment_gateway`, `_llms_billing_email`, `_llms_billing_first_name`, `_llms_billing_last_name`, `_llms_order_key`, `_llms_order_type`, `_llms_date_access_expires`, `_llms_date_next_payment`.
  - Transaction: `_llms_order_id`, `_llms_amount`, `_llms_currency`, `_llms_gateway_transaction_id`, `_llms_payment_gateway`, `_llms_payment_type`, `_llms_refund_amount`.
  - Coupon: `_llms_coupon_amount`, `_llms_discount_type`, `_llms_expiration_date`, `_llms_usage_limit`, `_llms_coupon_courses`, `_llms_coupon_membership`.
  - Question: `_llms_question_type`, `_llms_points`, `_llms_multi_choices`, `_llms_parent_id`.
  - Earned certificate (`llms_my_certificate`): `_llms_sequential_id`, `_llms_awarded`, `_llms_engagement`, `_llms_related` [4].
- **Order statuses:** `llms-active`, `llms-pending`, `llms-completed`, `llms-on-hold`, `llms-pending-cancel`, `llms-cancelled`, `llms-expired`, `llms-failed`, `llms-refunded`. Transaction statuses: `llms-txn-succeeded`, `llms-txn-pending`, `llms-txn-failed`, `llms-txn-refunded` [4].
- **Custom tables** (`includes/class.llms.install.php` line 424 onward) [4]:
  - **`lifterlms_user_postmeta`**: `meta_id, user_id, post_id, meta_key, meta_value, updated_date`. This holds **enrollment and progress**. Keys found in code are `_status` (`enrolled`, `expired`, `cancelled`), `_start_date`, `_enrollment_trigger` (e.g. order-based), `_is_complete` (per lesson, section or course), `_completion_trigger`, `_certificate_earned` and `_achievement_earned`.
  - `lifterlms_quiz_attempts`: `student_id, quiz_id, lesson_id, start_date, end_date, status, attempt, grade, questions longtext`.
  - `lifterlms_vouchers_codes`, `lifterlms_voucher_code_redemptions`, `lifterlms_product_to_voucher`, `lifterlms_notifications`, `lifterlms_events`, `lifterlms_events_open_sessions`, `lifterlms_sessions`, `lifterlms_lesson_time_sessions`.
  - REST: `lifterlms_api_keys` and `lifterlms_webhooks` (`libraries/lifterlms-rest/includes/class-llms-rest-install.php`).
- **Currency:** a separate option, `lifterlms_currency` (alongside `lifterlms_decimals` and others), independent of WooCommerce [4]. At IBA the LifterLMS plan prices and the WooCommerce product prices differ (§D.7).
- **Export/import:** course JSON export/import via `includes/admin/class.llms.admin.import.php` (upload import plus "cloud import") and `class-llms-export-api.php` [4]. The JSON schema was not audited `[unverified]`.
- **REST API:** namespace **`llms/v1`**, bundled in core **since LifterLMS 3.34.0 (2019-08-15)**. The changelog says a REST API "is now included in the LifterLMS core" [4] (`CHANGELOG.md` line 5878). Controllers cover access-plans, api-keys, awarded-certificates, certificates, courses, enrollments, instructors, lessons, memberships, orders, questions, quiz-attempts, quizzes, sections, students, students-grades, students-progress and webhooks. Auth uses consumer key/secret, hashed and stored in `lifterlms_api_keys`. It is sent as headers `X-LLMS-CONSUMER-KEY`/`X-LLMS-CONSUMER-SECRET` or HTTP Basic (`class-llms-rest-authentication.php` lines 362–368) [4]. IBA's LifterLMS 4.21.3 therefore has the REST API. On IBA, `courses`, `sections`, `lessons`, `memberships` and `access-plans` answer **without authentication**, while `students` returns 401 (§D.7).
- **Importer notes:** LifterLMS has the best REST coverage of all the plugins (students, enrollments, progress). One authenticated key on IBA is enough to pull everything, without a database dump.

---

### A.5 Masteriyo

Verified in the wp.org release zip, version 3.5.1 (header `License: GNU General Public License v3.0`) [6].

- **Install signal:** 6,000+ active installs. Version 3.5.1 updated 2026-11-05 [1].
- **Post types** (`includes/PostType/*.php`): `mto-course`, `mto-section`, `mto-lesson`, `mto-quiz`, `mto-question`, `mto-order`. Others referenced include `mto-assignment`, `mto-bundle`, `mto-certificate`, `mto-coupon`, `mto-subscription`, `mto-announcement`, `mto-google-meet` and `mto-zoom` [6].
- **Custom tables** (from `database/migrations/`): `masteriyo_user_items` (`user_id CHAR(32)`, `item_id`, `item_type`, `status`, `parent_id`, `date_start`, `date_modified`, `date_end`), `masteriyo_user_itemmeta`, `masteriyo_user_activities` (`activity_type`, `activity_status`, `completed_at`) and `masteriyo_user_activitymeta`. Also `masteriyo_order_items`, `masteriyo_order_itemmeta`, `masteriyo_quiz_attempts`, `masteriyo_quiz_question_rel`, `masteriyo_sessions` and `masteriyo_notifications` [6].
- **Correction:** the brief's **`wp_masteriyo_orders` table does not exist**. Orders are `mto-order` posts, with items in `masteriyo_order_items` [6].
- **Note:** `user_id` is **CHAR(32)**, not BIGINT, in user_items and activities. It may hold guest identifiers `[unverified]`, so cast with care.
- **Enums** (`includes/Enums/`):
  - Question types: `true-false`, `single-choice`, `multiple-choice`, `sortable`, `text-answer`, `matching`, `audio`, `video`, `fill-in-the-blanks`.
  - Video sources: `self-hosted`, `youtube`, `vimeo`, `external`, `embed-video`, `live-stream` (plus `bunny-net` in code).
  - Order statuses: `pending`, `processing`, `on-hold`, `completed`, `cancelled`, `refunded`, `failed`.
  - Course progress: `started`, `progress`, `completed`. User course: `active`/`inactive` [6].
- **Key meta:** `_price`, `_regular_price`, `_sale_price`, `_price_type`, `_access_mode`, `_enrollment_limit`, `_duration`, `_course_id`, `_video_source`, `_video_source_url`, `_video_playback_time`. Order meta: `_total`, `_currency`, `_customer_id`, `_transaction_id`, `_payment_method` [6].
- **Export/import:** `includes/Exporter/` (CourseExporter writes JSON such as `masteriyo-export-quizzes-*.json`, plus SiteExporter and UserCSVExporter) and `includes/Importer/` (CourseImporter, QuizImporter, SiteImporter, UserCSVImporter) [6]. JSON courses and CSV users are confirmed.
- **REST API:** `masteriyo/v1` (48 controllers declare it), `masteriyo/pro/v1` and `masteriyo/store` [6]. Auth was not audited `[unverified]`.

---

### A.6 Sensei LMS

Verified in source at github.com/Automattic/sensei commit `c8e4d0a` (header `Version: 4.26.4`, `License: GPLv2 or later`) [5].

- **Install signal:** 9,000+ active installs. Version 4.26.4 updated 2026-09-29 [1].
- **Post types:** `course`, `lesson`, `quiz`, `question`, `multiple_question`, `sensei_message`. **Modules are a taxonomy** (`module`) `[unverified: registration line not inspected]`.
- **Key meta:** `_lesson_course`, `_lesson_quiz`/`_quiz_lesson`, `_lesson_length`, `_lesson_preview`, `_lesson_video_embed`, `_course_prerequisite`, `_quiz_grade_type`, and the legacy `_course_woocommerce_product` [5].
- **Progress:** two storages exist.
  - Legacy: **comments** with `comment_type` set to `sensei_lesson_status` or `sensei_course_status` (`class-sensei-utils.php`).
  - Newer: tables `sensei_lms_progress` (`post_id, user_id, parent_post_id, type, status, started_at, completed_at, created_at, updated_at`, unique on post, user and type), `sensei_lms_quiz_submissions`, `sensei_lms_quiz_answers` and `sensei_lms_quiz_grades` (`includes/internal/installer/class-schema.php`) [5].
  - The importer must check both.
- **Export/import:** CSV "data port" (`includes/data-port/`: export job, CSV reader, CLI import) [5].
- **REST:** only `sensei-internal/v1` was found, so there is no public data API [5].

---

### A.7 MasterStudy LMS

Verified in the wp.org release zip, version 3.7.58 [7].

- **Install signal:** 10,000+ active installs. Version 3.7.58 updated 2026-11-02 [1]. A Persian-localized MasterStudy *theme* has 843 sales on rtl-theme [30].
- **Post types:** `stm-courses`, `stm-lessons`, `stm-quizzes`, `stm-questions`, `stm-assignments`, `stm-orders`, `stm-course-bundles`, `stm-reviews`, `stm-payout`, `stm-google-meets`, `stm-user-assignment` [7].
- **Custom tables** (`_core/libraries/db/tables/*.table.php`; names from `_core/libraries/db/_names.php`) [7]:
  - `stm_lms_curriculum_sections` (`id, title, course_id`) and `stm_lms_curriculum_materials` (`post_id, post_type, section_id`).
  - **`stm_lms_user_courses`** (`user_id, course_id, current_lesson_id, progress_percent, final_grade, status, subscription_id, bundle_id, start_time INT, end_time INT`). Times are **Unix integers**.
  - `stm_lms_user_lessons`, `stm_lms_user_quizzes`, `stm_lms_user_answers`, `stm_lms_user_assignments`, `stm_lms_order_items` (`order_id, object_id, quantity, price float(24,2)`), `stm_lms_user_cart`, `stm_lms_user_subscriptions`, `stm_lms_user_chat`, `stm_lms_user_bookmarks`, `stm_lms_user_searches`, and the lesson-marker tables.
- **Key meta** (unprefixed): `price`, `sale_price`, `single_sale`, `not_membership`, `duration_info`, `level`, `pricing_mode`, `passing_grade`, `expiration_course`, `current_students`, `coupon_*`. Lesson video uses **`video_type`** plus `lesson_video`, `lesson_video_url`, `lesson_youtube_url`, `lesson_vimeo_url`, `lesson_ext_link_url`, `lesson_stream_url` and `lesson_video_poster`. The order total is `_order_total` [7].
- **REST:** `masterstudy-lms/v2` [7]. Auth was not audited `[unverified]`.

---

### A.8 Academy LMS

Verified in wp.org SVN trunk 4.0.8 (header `License: GPL-3.0+`) [8].

- **Install signal:** **closed on wordpress.org since 2026-10-11**. The notice says the closure "is temporary, pending a full review" [1]. I found no install count I could cite.
- **Data model:** course post type `academy_courses`. Lessons sit **outside `wp_posts`**, in the custom tables `{prefix}academy_lessons` and `{prefix}academy_lessonmeta`. The curriculum is an array in course postmeta `academy_course_curriculum`. Price comes through WooCommerce via `academy_course_product_id`, with `academy_course_type` set to free or paid. Enrollment is a post of type **`academy_enrolled`** (author = user, parent = course, status `completed`), the same pattern as Tutor [8].
- **Migration tool:** a built-in add-on with classes for **LearnDash, LearnPress, LifterLMS, MasterStudy and Tutor** (`addons/migration-tool/classes/*.php`) [8]. These are useful as a second, independent reading of each competitor's schema, and they were used above.

### A.9 Corrections to the brief

| Brief said | Finding |
| --- | --- |
| Masteriyo `wp_masteriyo_orders` | Does not exist. Orders are `mto-order` posts plus `masteriyo_order_items` [6]. |
| LearnDash `ld_course_steps` postmeta | Not confirmed `[unverified]`. Course steps exist [12], but the key name was not visible. Read through LearnDash functions or a dump. |
| Tutor `_video` sources | Confirmed, plus `source_bunnynet` [3]. |
| LearnPress tables | Confirmed, plus `learnpress_user_item_results`, `learnpress_courses`, `learnpress_files` and `learnpress_notes` [2]. |
| Tutor enrollments as `tutor_enrolled` | Confirmed (`post_author` = user, `post_parent` = course) [3]. |
| Academy LMS available on wp.org | Closed since 2026-10-11 [1]. |
| Paid Memberships Pro on wp.org | Closed permanently on 2024-10-17 at the author's request [1]. |

---

## B. Course selling: WooCommerce and memberships

### B.1 WooCommerce core

- **Install signal:** 7,000,000+ active installs. Version 11.2.2 updated 2026-11-04 [1].
- **Order storage, two modes:**
  - **HPOS** has been the default for new stores since **WooCommerce 8.2** (October 2023) [19]. Its tables come from `OrdersTableDataStore.php` [16]:
    - `{prefix}wc_orders`: `id, status, currency varchar(10), type, tax_amount decimal(26,8), total_amount decimal(26,8), customer_id, billing_email, date_created_gmt, date_updated_gmt, parent_order_id, payment_method, payment_method_title, transaction_id, ip_address, user_agent, customer_note`.
    - `{prefix}wc_order_addresses`: `order_id, address_type, first_name, last_name, company, …, email, phone`.
    - `{prefix}wc_order_operational_data`: `created_via, order_key, date_paid_gmt, date_completed_gmt, discount_total_amount, coupon_usages_are_counted, …`.
    - `{prefix}wc_orders_meta`.
    - With HPOS authoritative and sync off, the posts table holds a placeholder post of type `shop_order_placehold` that reserves the ID [19].
  - **Legacy** stores keep orders as `shop_order` posts with postmeta such as `_order_total`, `_order_currency`, `_billing_phone`, `_customer_user` and `_transaction_id` `[unverified: full list; standard WC]`. **IBA runs WooCommerce 5.4.4, which predates HPOS, so IBA is legacy-posts** [54].
- **Line items** (both modes): `{prefix}woocommerce_order_items` and `{prefix}woocommerce_order_itemmeta` [17]. Course linkage is usually item meta `_product_id` → product → LMS mapping `[unverified: standard WC item meta]`.
- **Coupons:** post type `shop_coupon` with meta such as `discount_type`, `coupon_amount`, `usage_limit` and `date_expires` (a Unix timestamp; Parsi Date converts the Jalali input to it on save [46]) `[unverified: full list]`. Usage is also in `{prefix}wc_order_coupon_lookup` [17].
- **Customer data:** usermeta `billing_phone`, `billing_first_name`, `billing_last_name` (customer object) `[unverified: standard WC]`, plus `{prefix}wc_customer_lookup` [17].
- **Other install tables:** `wc_order_stats`, `wc_order_product_lookup`, `wc_product_meta_lookup`, `woocommerce_api_keys`, `woocommerce_payment_tokens`, `woocommerce_downloadable_product_permissions`, `woocommerce_sessions` and more [17].
- **REST:** `/wp-json/wc/v3`. Over HTTPS, consumer key/secret go in HTTP Basic, with a query-string fallback. Over HTTP, one-legged OAuth 1.0a. Example keys start `ck_`/`cs_`. Pagination uses `X-WP-Total` and `X-WP-TotalPages` [20]. The **public Store API** (`/wp-json/wc/store/v1/products`, or `/wc/store/products` on older WC) needs no auth and exposes `currency_code` and `currency_minor_unit`. This makes it a cheap **pre-flight currency check** (§D.6).
- **Currency codes:** WC core defines symbols for **`IRR`** (﷼) and **`IRT`** (تومان) in `get_woocommerce_currency_symbols()` [18]. Persian WooCommerce adds `IRHR` (هزار ریال) and `IRHT` (هزار تومان) [42]. See §D.6.

### B.2 WooCommerce Subscriptions

- **Data:** post type `shop_subscription`, or type `shop_subscription` in `wc_orders` under HPOS. It shares the order schema [21]. Product meta includes `_subscription_price` [21]. The renewal schedule keys (e.g. `_schedule_next_payment`, `_billing_period`) are **not confirmed** in what I could read `[unverified]`.
- **Install signal:** commercial on woocommerce.com. No public count found `[unverified]`.

### B.3 WooCommerce Memberships (used by IBA, v1.27.4 [54])

- **Data:** plans are posts of type `wc_membership_plan`. User memberships are posts of type **`wc_user_membership`** whose `post_parent` is the plan and whose `post_author` is the member. Status is the post status with a `wcm-` prefix. Rules sit in the option `wc_memberships_rules`. Notes are comments [22]. Date keys `_start_date`/`_end_date` come only from a 2020 dump *(secondary)* `[unverified]`.
- **REST:** IBA exposes `wc/v2/memberships`, `wc/v3/memberships` and `wc/v4/memberships` [54].

### B.4 MemberPress

- **Data** (vendor docs): `mepr_transactions` (all payments, including free ones, which decide access), `mepr_subscriptions` (recurring), `mepr_members` (a speed cache), and the membership post type `memberpressproduct`. Members are ordinary `wp_users`/`wp_usermeta` [23].
- **Install signal:** not on wp.org (the API returns "Plugin not found") [1]. Commercial.

### B.5 Paid Memberships Pro

- **Data:** `pmpro_membership_levels`, `pmpro_memberships_users` (status values include `active`, `cancelled`, `admin_cancelled`, `inactive`) and `pmpro_membership_orders` (`id`, `code`, …) [24]. The full column list comes from a forum post *(secondary)*.
- **Install signal:** **closed on wp.org permanently since 2024-10-17 at the author's request**, so it is now distributed by the vendor [1]. Tutor can monetize through PMPro (`monetize_by = 'pmpro'`) [3]. IDPay ships a PMPro gateway (40+ installs) [1].

---

## C. WordPress users and passwords

### C.1 Tables

- `wp_users` (`ID, user_login, user_pass, user_email, user_registered` (UTC) `, display_name, user_activation_key`) and `wp_usermeta`, which holds `first_name`, `last_name`, `{prefix}capabilities` (a serialized role map), and plugin data such as phones (§D.5). The column list is standard core `[unverified: not re-read]`. Storage locations named in the 6.8 post: `wp_users.user_pass`, the usermeta `_application_passwords`, and `wp_users.user_activation_key` [25].

### C.2 Hash formats (verified in `pluggable.php`, trunk [26])

| Prefix | Meaning | Verify outside WordPress |
| --- | --- | --- |
| `$wp$2y$…` | WP ≥ 6.8 default: bcrypt over a **pre-hash** | `pre = base64(HMAC-SHA384(key='wp-sha384', msg=password, raw))`, then `bcrypt.verify(pre, hash.slice(3))` [26] |
| `$2y$…` (no `$wp`) | plain bcrypt, e.g. from plugins | `bcrypt.verify(password, hash)` [26] |
| `$P$…` | phpass portable (WP < 6.8, and any account not yet re-logged-in) | phpass portable algorithm [26] |
| 32-hex | legacy MD5 | `md5(password) === hash` (checked first when `strlen(hash) <= 32`) [26] |
| `$generic$…` | BLAKE2b for **application passwords and reset keys** (≥ 6.8), not user passwords | not needed [25] |
| `$argon2…` | optional via the filter `wp_hash_password_algorithm` [25] | argon2 library |

- **Exact pre-hash, confirmed from code:**
  - `wp_check_password()` computes `base64_encode( hash_hmac( 'sha384', $password, 'wp-sha384', true ) )` and calls `password_verify()` on `substr( $hash, 3 )` [26].
  - The make.wordpress.org post only says "SHA-384 pre-hashing" [25]. The HMAC detail comes from the code, not the post.
  - Passwords over 4096 bytes are rejected [26].
- **Rehash on login:** phpass hashes stay valid. They are rehashed to bcrypt on the next login or password change [25]. **Exports from any site therefore mix `$P$` and `$wp$2y$` hashes.** IBA is on WP 5.7.21, so all its hashes should be `$P$` (or MD5 for very old accounts) [54] `[unverified: no DB access]`.
- **Node libraries (npm registry [29]):**
  - `bcryptjs` 3.0.3 (BSD-3) and `bcrypt` 6.0.0 (MIT). PHP `$2y$` and `$2b$` are the same algorithm, but some JS libraries only accept `$2a$`/`$2b$`, so replace the prefix before verifying `[unverified per library]`.
  - phpass: `phpass` 1.0.0 (MIT, published 2026-09-11), `node-phpass` 1.0.5 (2018), `wordpress-hash-node` 1.0.0 (2016), `wp-passhash` 0.1.0 (2017). All are tiny or old, and the portable algorithm is about 40 lines. **Recommendation:** implement phpass-portable verification in `packages/core` with Vitest vectors produced by real WordPress, rather than taking a dependency.
- **Do we even need passwords?** Edvora **students log in by SMS OTP**, so student hashes are unnecessary. Only staff accounts might want a legacy-password fallback. Recommendation: **do not import hashes by default**. Optionally store `legacyPasswordHash` for admins and instructors only, verify it once, then force a new credential.

### C.3 Application passwords (WP 5.6+)

- Introduced in **WordPress 5.6**. Credentials are sent with **HTTP Basic** (`--user "USERNAME:PASSWORD"`; spaces in the password are optional) [27].
- Available by default only on HTTPS sites. The filter `wp_is_application_passwords_available` can force it on [27].
- Interactive grant flow: `/wp-admin/authorize-application.php?app_name=…&app_id=<uuid>&success_url=…`. On approval WordPress appends `site_url`, `user_login` and `password` to `success_url` [27]. This is the right UX for "one-click": the admin approves in their own WordPress, and Edvora receives a scoped credential.
- Programmatic creation is `POST /wp/v2/users/me/application-passwords`, and a credential can be sanity-checked with `GET /wp-json/wp/v2/users/me` `[unverified: endpoint behaviour not re-read]` [27].
- **Limits:** application passwords authenticate **core and plugin REST routes** that use standard WordPress auth. WooCommerce's `wc/v3` documents its own consumer keys [20]. LifterLMS uses its own keys [4]. Tutor uses its own key/secret plus JWT [3]. Expect to need **per-plugin credentials** for REST mode.

### C.4 WXR export (Tools > Export)

Verified in `wp-admin/includes/export.php` (trunk) [28]:

- Version `WXR_VERSION = 1.2`.
- **Authors only:** the export lists users who are `post_author` of exported posts, with `author_id`, `login`, `email`, `display_name`, `first_name` and `last_name`. **No passwords, no other usermeta, and no non-author users.** So students are absent.
- **Includes:** posts of every post type whose `can_export` is enabled (skipping `auto-draft`), `<wp:postmeta>` (except `_edit_lock`), comments and comment meta, terms, and `wp:attachment_url`.
- **Excludes:** **all custom tables.** That means LearnPress sections and user_items, Tutor quiz and order tables, LifterLMS progress, WooCommerce HPOS orders, `woocommerce_order_items`, and every plugin's usermeta.
- **Verdict:** WXR is good enough for **blog posts, pages and media URLs** only. Use it as the zero-credential "posts" path, never for courses, users or orders.

---

## D. The Iranian WordPress ecosystem

### D.1 Marketplaces: best-selling education themes

**rtl-theme.com (راست‌چین), category "قالب آموزشی", sorted by sales** [30]. The category lists 213 products.

| Theme | Sales | Price (Toman) | What it is built on (product page) |
| --- | --- | --- | --- |
| **Studiare / استادیار** (seller: سان کد / Suncode) | **8,613** | 1,848,000 | **WooCommerce + its own course builder** ("دوره ساز اختصاصی"). Built-in SMS OTP for Melli Payamak, sms.ir, IPPanel, Farazsms, Kavenegar and Rahpayam. Built-in HLS player with a user-name/phone watermark. Seller says SpotPlayer needs SpotPlayer's own plugin. v13.4.2 (changelog 1405/08/12) [31]. |
| Emperor / امپراطور (قهرمان وردپرس) | 2,549 | 2,948,000 | Built on WooCommerce and works with **Tutor LMS**. Seller recommends SpotPlayer. Built-in OTP since v11 [32]. |
| Edumall / اجومال | 2,097 | 1,348,000 | Not checked. Commonly a Tutor LMS theme `[unverified]`. |
| Parsa / پارسا (میهن کد) | 1,790 | 1,698,000 | **WooCommerce + its own sections/lessons on the product edit screen** ("سرفصل ها و دروس… در صفحه ویرایش محصول"). SpotPlayer compatible. OTP. v4.4.6 [33]. |
| Ostadsho / استاد شو (پیشتاز وب) | 1,573 | 1,698,000 | WooCommerce + its own course builder (v3.0). OTP with Kavenegar, sms.ir and ippanel. SpotPlayer answer unclear [34]. |
| MasterStudy (Persian) | 843 | 1,347,000 | Presumably the MasterStudy LMS plugin `[unverified]`. |
| Pooshe / پوشه | 788 | 2,248,000 | WooCommerce file/course shop `[unverified]`. |
| BuddyBoss | 620 | 1,448,000 | BuddyBoss theme. Works with LearnDash and LifterLMS `[unverified on page]`. **IBA uses it** [54]. |
| Eduma | 486 | 1,548,000 | ThimPress theme, normally LearnPress `[unverified on page]`. |
| Ecademy 455 · Diako 432 · Donya 388 · Maxcoach 383 · Turitor 311 | — | — | not checked |

The listing also showed rows labelled "LMS" (3,371) and "آموزش برنامه نویسی" (2,549) that point to `rtlr.ir` referral links. Their mapping to products is ambiguous, so they are excluded [30].

**zhaket.com (ژاکت), category "education", sorted by top sales** [35]. The page shows an **unlabelled number** per product that is probably sales, but the page does not say so.

| Theme | Number shown | Notes |
| --- | --- | --- |
| **Studiare Plus / استادیار پلاس** (seller "وردپرسِ من!") | **10,128** | Product page: 10,128 sales, v11.3, updated 1405/05/18, "based on WooCommerce", supports LMS plugins. SMS login via a separate plugin [36]. A different seller and version line from rtl-theme's Studiare, so possibly a fork or another localization `[unverified]`. |
| Eduma | 1,894 | — |
| BuddyBoss | 629 | — |
| Digiacademy | 338 | Seller says SpotPlayer is untested *(secondary)* [37] |
| Educavo 310 · Edumall 298 · Hortash 154 · Edublink 128 · Learnit 82 · Novinlearn 79 · SkillUP 76 | — | — |
| Atour, Shokrino, Tadris | — | Atour: SpotPlayer auto-licence since v1.4.5. Shokrino is currently unavailable. Tadris has its own player app "icplayer" and needs no WooCommerce *(secondary)* [37] |

**Studiare provenance:** the live `style.css` on a Studiare site says `Theme Name: Studiare`, `Author: Suncode`, `Version: 13.4`, Theme URI on rtl-theme [53]. Themesinfo reports the theme on about 370 sites *(secondary)* [38].

**Pattern:** the dominant Iranian education themes do **not** use an LMS plugin. They sell **WooCommerce products** and keep the syllabus ("سرفصل/درس") in **theme-specific product postmeta**. Studiare's storage format was **not verifiable without a copy of the theme** `[unverified]`.

One concrete, verified example of this pattern is the wp.org plugin **Nias Course (دوره ساز نیاس)** 1.3.3, 200+ installs [1][41]. It stores a WooCommerce product's curriculum as a **Carbon Fields complex field `course_sections`**. Each section has `section_title`, `section_subtitle` and a `lessons` repeater, and each lesson has `lesson_title`, `lesson_label`, `lesson_preview_video{video_type, video_upload, video_url, video_embed}`, `lesson_download{…}`, `lesson_private`, `lesson_duration` and `lesson_content` (`inc/nias-meta.php`) [41]. Carbon Fields flattens such fields into many postmeta rows `[unverified: exact key format]`. The importer needs a **pluggable "theme adapter"** per theme, plus a "manual mapping" fallback.

### D.2 LMS plugins in the Iranian market

- No Persian LearnDash or Tutor Pro listing showed up on rtl-theme or zhaket in my searches. That is a search result, not proof of absence `[unverified]`.
- Gateland (wp.org, 5,000+ installs) ships payment integrations for **LearnDash, LearnPress and LifterLMS** plus WooCommerce, EDD, PMP, RCP and others (`src/Plugins/`) [45]. This shows local demand for those three LMSs.
- IDPay publishes a LearnPress gateway on wp.org (50+ installs) [1].
- Zarinpal documents an official LifterLMS gateway *(secondary, search snippet)*.

### D.3 SpotPlayer (اسپات پلیر)

- **What it is:** a DRM player for video, audio and PDF with watermarking. Licences are created per buyer.
- **API:** `POST https://panel.spotplayer.ir/license/edit/` creates a licence, and `…/license/edit/{_id}` edits one. Headers are `$API` (the key) and `$LEVEL: -1`.
  - Body: `course[]` (SpotPlayer course IDs), `name`, `watermark.texts[].text`, `test`, `offline`, `payload` (e.g. an order ID), `data.limit` (per-course ranges such as `"1,4-6,10-"`), `device.p0…p6`.
  - Response: **`_id`**, **`key`** (the page says to store it with the order and give it to the customer), and `url`, which is relative to `https://dl.spotplayer.ir` [39].
- **WordPress plugin:** distributed as a zip from spotplayer.ir, so not on wp.org. It supports **WooCommerce and EDD**. The product edit page gets a SpotPlayer tab with course IDs (comma-separated, per variation for variable products). The licence is created once the order is completed, or after manual approval [40]. Live plugin slugs observed: **`spotplayer`** (carkhan.ir) and **`wp-spotplayer`** (nikamooz.com) [53].
- **What lives in WordPress:** the original plugin was not downloaded, because it is vendor-hosted and outside the approved source set. Evidence comes from Nias Course, which describes itself as a port of the standalone "اسپات پلیر" plugin. Its compatibility code reads WooCommerce **order meta `_spotplayer_data`** (via `maybe_unserialize`) and uses its `name`, `watermark.texts[0].text` and `key` (`inc/functions.php` lines 28–50). Its own port stores `_nias_spot_data` on the order (with `_id` and `key`) and `_nias_spot_course` on the product [41]. So the original plugin very likely stores the API response, at least `_id` and `key`, in order meta `_spotplayer_data` `[unverified against the original plugin]`.
- **Importer implication:** keep a **`legacyDrm` blob** per order or enrollment, holding the SpotPlayer licence `_id`, `key` and course IDs, so already-licensed students keep watching. Edvora's `lessons.videoUrl` cannot represent SpotPlayer content. Lessons become "external DRM" stubs. This needs an ADR.

### D.4 Iranian payment gateways (WooCommerce)

| Plugin | wp.org | What it stores (verified in source) |
| --- | --- | --- |
| **Zarinpal official** (`zarinpal-woocommerce-payment-gateway`) | 60,000+, v5.1.1 [1] | Gateway id `WC_ZPal`. Order meta `_zarinpal_authority`, `_zarinpal_authority_history`, `_zarinpal_fee_data`. On success it calls **`payment_complete($ref_id)`**, so the **Zarinpal `ref_id` becomes WooCommerce `transaction_id`**, and adds an order note with the tracking code. Card PAN is fetched for display (`card_pan`), not confirmed as stored. Registers `IRR`/`IRT`, and refunds multiply the amount by 10 for Toman (`class-wc-gateway-zarinpal.php` lines 18–30, 369–375, 454–457, 496) [43]. |
| **Zibal** (`zibal-payment-gateway-for-woocommerce`) | 8,000+, v2.1 [1] | Gateway id `WC_Gateway_Zibal`. Order meta `_zibal_track_id`, `_zibal_requested_amount`, `_zibal_payment_state`, `_zibal_transactions`. Calls `payment_complete($Transaction_ID)` [44]. |
| **Gateland** (multi-gateway) | 5,000+, v2.5.1 [1] | Own tables `gateland_transactions`, `gateland_receipts`, `gateland_refunds`, `gateland_cards`, `gateland_gateways`, `gateland_logs`, `gateland_sms`. The transaction model has `amount`, `currency`, `order_id`, `card_number`, `mobile`, `gateway_trans_id`, `gateway_au`, `status`. The WooCommerce order gets meta `authority`. Over 40 gateway classes, including Mellat, Saman, Parsian, Pasargad, IDPay, NextPay, PayPing, Sadad and Jibit [45]. |
| IDPay | `woo-idpay-gateway` **closed 2026-04-07 (security issue)** [1] | — |
| Bank Mellat | `mellat-woocommerce` 2,000+, last updated 2021 [1] | not inspected |
| Pay.ir, NextPay | no dedicated wp.org WooCommerce plugin found [1] | NextPay is available via Gateland [45] |

**Importer rule:** for WooCommerce orders, `transaction_id` (the `wc_orders` column, or `_transaction_id` on legacy installs) maps to `payments.refId`, and gateway-specific meta maps to `payments.authority`. Use `_zarinpal_authority`, `_zibal_track_id` or Gateland's `authority`. Use `payment_method` (gateway id) to choose the provider. Card PAN is rarely stored in order meta. Gateland's `card_number` is the main exception [45].

### D.5 Phone numbers: SMS login plugins

| Plugin | Where the phone lives | Evidence |
| --- | --- | --- |
| **Digits** (UnitedOver; CodeCanyon **8,236 sales**, v9.2, $39 [47]) | usermeta **`digits_phone`** = country code plus number (e.g. `+13214446666`), **`digits_phone_no`** = number only, **`digt_countrycode`** = country code (spelled exactly so by the author; may be a typo) | plugin author's comment [48]. Digits needs the country code with the number, which is why it keeps its own fields [49]. IBA runs Digits (asset `ver=7.7`) [54]. |
| WP SMS / WSMS (7,000+ [1]) | usermeta **`mobile`** | `get_user_meta($post->post_author, 'mobile', true)` in `class-wpsms-notifications.php` line 399 [50] |
| OTP Login With Phone Number (1,000+ [1]) | usermeta **`phone_number`**, and also sets `billing_phone` | update_user_meta keys in source [52] |
| Persian WooCommerce SMS (50,000+ [1]) | Mostly uses WooCommerce billing fields. Its own options use `pwoosms_*` keys | source grep [51]. Exact user key `[unverified]` |
| WooCommerce itself | usermeta `billing_phone` and order billing phone (`wc_order_addresses.phone` or `_billing_phone`) | [16] |
| Studiare, Ostadsho, Emperor built-in OTP | **unknown keys** | product pages only [31][32][34] `[unverified]` |

**Importer rule:** read phone candidates in a fixed priority order: `digits_phone` → `digits_phone_no` + `digt_countrycode` → `mobile` → `phone_number` → `billing_phone` → the latest order billing phone. Run each through `normalizeIranMobile`. On a conflict (two WordPress users normalize to one phone), **send both to a review queue instead of merging silently**, because `users.phone` is unique and is the login key.

### D.6 Currency: IRT vs IRR (the single most dangerous bug)

- WC core knows **`IRR`** and **`IRT`** (symbol "تومان") [18]. Persian WooCommerce (100,000+ installs [1]) registers four codes: `IRR` ریال, `IRHR` هزار ریال, `IRT` تومان, `IRHT` هزار تومان. Its structured-data converter multiplies to rial as follows: **IRT ×10, IRHR ×1,000, IRHT ×10,000, IRR ×1**. A code comment says the default is IRT ("Default currency is IRT also") [42].
- Its gateway base class also accepts free-text currency labels. It maps `toman`, `iranian toman`, `تومان` and similar to IRT, and `rial`, `ریال` and similar to IRR (`class-gateways.php` lines 355–399) [42].
- **Field evidence:** the public Store API on 5 of 5 Iranian WooCommerce sites that answered reported **`currency_code: "IRT"`, `currency_minor_unit: 0`**. The sites were carkhan.ir, nikamooz.com, modireweb.com, maktabsharif.ir and **iranbrandacademy.com** [53][54].
- WooCommerce money columns are `decimal(26,8)` in HPOS [16], Tutor uses `DECIMAL(13,2)` [3], LifterLMS uses float [4], and MasterStudy uses `float(24,2)` [7]. All are in **the site's currency**, not rials.
- **Rule for `packages/core`:** `toRial(amountString, currencyCode)`.
  - Parse the decimal string without floats.
  - Multiply by {IRR: 1, IRT: 10, IRHR: 1000, IRHT: 10000}.
  - **Reject** any result with a fractional part.
  - **Refuse to guess** when the code is unknown, empty, or one of the free-text labels; ask the operator instead.
  - Read the currency **per order** (`wc_orders.currency` / `_order_currency`), not only from the shop option, because a shop may have switched currency over time.
  - LifterLMS and Tutor-native prices use their **own** currency option (`lifterlms_currency`, Tutor `currency_code` default `USD`) [3][4].

### D.7 Iran Brand Academy (iranbrandacademy.com): fingerprint

Collected from the public homepage HTML, `/wp-json/`, public plugin `readme.txt` files and unauthenticated REST [54]. No login was used and no personal data was read.

- **Stack:**
  - WordPress 5.7.21 (generator meta) on PHP 7.4.33 (`x-powered-by`).
  - Theme **`buddyboss-theme`**.
  - **LifterLMS 4.21.3**, installed in a renamed folder **`lifterlmsfa`**. Its readme is LifterLMS's own, `Stable tag: 4.21.3`. An add-on is `random-quiz-addon-for-lifterlms` 1.0.2.
  - **WooCommerce 5.4.4** (pre-HPOS) and **WooCommerce Memberships 1.27.4** (changelog).
  - **Digits** (asset `ver=7.7`).
  - **Presto Player** 1.9.1 (wp.org has 4.5.4 [1]).
  - **WP Shamsi** 4.0.1. **This plugin was closed on wp.org on 2023-07-18 for a security issue** [1][55].
  - Modern Events Calendar 5.13.0, Tickera 3.4.8.4 plus "Bridge for WooCommerce" 1.1.6.4 (by Tickera), SupportCandy 2.2.2, Elementor and Elementor Pro, EmbedPress, NotificationX, 3D FlipBook (dflip lite), jannah-extensions, creame-whatsapp-me, captcha-code-authentication, essential-addons-for-elementor-lite, seating-charts.
- **Public REST namespaces:** `llms/v1`, `wc/v1–v3`, `wc/store`, `wc/v2–v4/memberships`, `presto-player/v1`, `wp/v2` [54].
- **Unauthenticated LifterLMS REST:**
  - `courses`: **29** (`X-WP-Total`; titles such as "Brand MBA XXV" and "Brand DBA IX").
  - `sections`: 116. `memberships`: 3. `access-plans`: 16.
  - `lessons` reports `X-WP-Total: 1091`, but the body was empty for `per_page=5` `[unverified why]`.
  - `students` returns **401** [54].
- **Money:**
  - The WooCommerce Store API shows **`IRT`**, minor unit 0. Example product "تفکر استراتژیک (آنلاین)" is priced at 23,450,000 Toman [54].
  - LifterLMS access plans show different numbers, e.g. 7,770,000, 11,700,000, and many placeholder prices of **1** [54].
  - So **the WooCommerce product, not the LifterLMS plan, is the source of truth for price.** Sales most likely run through WooCommerce → Woo Memberships → LifterLMS membership/course access `[unverified: exact linkage]`.
- **Implications for IBA's migration:**
  - (a) Users: Digits `digits_phone` → `users.phone`.
  - (b) Passwords are phpass `$P$` because of WP 5.7, and are not needed for students.
  - (c) Courses, sections and lessons: pull via `llms/v1` with a LifterLMS API key.
  - (d) Enrollments and progress: `llms/v1/students/*` with the key, or `lifterlms_user_postmeta` from a dump.
  - (e) Orders: legacy `shop_order` posts in IRT, ×10.
  - (f) Memberships: `wc_user_membership` posts.
  - (g) Events and tickets (MEC and Tickera) are **out of scope** for v1 and should be flagged.
  - (h) Video: Presto Player blocks (`pp_video_block` post type) plus `_llms_video_embed`.

### D.8 Real Iranian course sites: what they run

Method: homepage HTML grep for `/wp-content/(themes|plugins)/<slug>` and generator meta, plus the `/wp-json/` index and Store API [53].

| Site | WordPress? | Theme / LMS signal | Commerce / video / login signals |
| --- | --- | --- | --- |
| iranbrandacademy.com | **Yes** (5.7.21) | BuddyBoss + **LifterLMS** | WooCommerce (IRT), Woo Memberships, Digits, Presto Player |
| carkhan.ir | **Yes** | **Studiare** 13.4 + `studiare-core` | WooCommerce (IRT), **`spotplayer`**, **digits**, Persian WooCommerce SMS (`pwsms/*` REST) |
| nikkhooy.ir | **Yes** | **Studiare** + `studiare-core` | WooCommerce, woo-wallet (TeraWallet), Persian WooCommerce REST |
| nikamooz.com | **Yes** | custom theme `nikamooz` | WooCommerce (IRT), **`wp-spotplayer`**, woo-wallet, Persian Gravity Forms SMS, `pwsms/*` |
| daneshjooyar.com | **Yes** (`/wp-json/` 200) | custom theme `daneshlight` + `daneshjooyar-core` | wp-shamsi |
| maktabsharif.ir | **Yes** | theme `ahura` | WooCommerce (IRT), Elementor, torobpay REST |
| modireweb.com | **Yes** | hello-elementor + JetEngine | WooCommerce (IRT), `melipayamak/v1` REST |
| hamyarwp.com | **Yes** (WP 7.1.4) | custom `HamyarWp` | (WordPress-services site, not an academy) |
| learnfiles.com | **Yes** | custom `learnfiles` | — |
| mihanwp.com | likely (REST answers `rest_restricted`) | no `wp-content` on the homepage | — |
| 7learn.com | No | Laravel-style (`csrf-token`, `/build/` assets) | — |
| toplearn.com | No | Laravel + Livewire | — |
| roocket.ir | No | Next.js (`_next/static`) | — |
| faradars.org | No | Next.js | — |
| sabzlearn.ir | No | Nuxt (`__NUXT__`) | — |
| maktabkhooneh.org | No | Nuxt + Laravel | — |
| mongard.ir | No | `/static/` assets (Django-style) | ArvanCloud storage |
| honari.com | — | **closed**: the page says the store shut down after 11 years | — |
| zhaket.com, digikala.com | No | Next.js | — |

**Reading:** the big-brand academies have left WordPress. The **long tail** of small and medium academies (the customers a "migrate from WordPress" button targets) runs **WooCommerce plus a local theme (Studiare) or a custom theme, SpotPlayer, Digits or Persian SMS, IRT**. Fingerprint hit rate was low (many guessed domains did not resolve), so the sample is **small (8 WP education sites)**. Treat the ranking as directional.

### D.9 Persian date plugins

- **Parsi Date** (`wp-parsidate`, 100,000+ installs, v6.5.2 [1]) only changes **display**. It hooks `get_the_time`, `the_date`, `get_the_date`, `get_comment_date`, `date_i18n` and `wp_date` (`inc/App/Core/FixDates.php`). For WooCommerce coupons it converts **Jalali admin input to a Gregorian Unix timestamp** on save (`validateCouponsDate`) and shows Jalali on read [46]. **Stored dates stay Gregorian.**
- **WP-Jalali** (10,000+) was last updated in 2017 and tested up to WP 4.6 [1], so it is abandoned.
- **WP Shamsi** was closed for a security issue in 2023 [1] and is still in use at IBA and Daneshjooyar [53][54].
- **Risk:** themes and form plugins may store **Jalali strings in their own meta**, e.g. course start dates in theme fields. The importer must detect `13xx/14xx` year patterns in date-like meta and convert or flag them `[unverified prevalence]`.

### D.10 Protected video and hosting

- **SpotPlayer** is dominant in the themes' own copy, per [32][33][37] and two live sites [53].
- **ArvanCloud VOD** for WordPress exists on wp.org with only 10+ installs [1].
- **Aparat embeds** are common. `wp-aparat` has 3,000+ installs [1], and Studiare and Parsa support Aparat [31][33].
- **Skyroom** (live classes) has 100+ installs [1], and Studiare's seller mentions it [31].
- **icplayer** belongs to the Tadris theme *(secondary)* [37]. "Guard Player" is mentioned by Emperor's seller [32] `[unverified what it is]`.
- **Presto Player** is at IBA [54].
- **Mapping:** YouTube, Vimeo, Aparat and direct MP4/HLS URLs go to `lessons.videoUrl`. SpotPlayer, Skyroom and Guard Player have no URL, so they become a DRM/external reference plus a manual step.

---

## E. Conclusions, recommendation and mapping

### E.1 Top stacks Iranian academies actually use (ranked)

| # | Stack | Evidence | Strength |
| --- | --- | --- | --- |
| 1 | **WooCommerce (IRT) + Iranian education theme with built-in course builder** (Studiare by far, then Parsa, Ostadsho), plus SpotPlayer, plus Digits or theme OTP, plus Zarinpal | Studiare 8,613 sales on rtl-theme [30] and 10,128 on zhaket [35][36]. Parsa 1,790 and Ostadsho 1,573 [30]. Two live Studiare sites, one with SpotPlayer and Digits [53]. Persian WooCommerce has 100k installs [1]. Zarinpal has 60k [1]. | **Strong** (market plus field) |
| 2 | **WooCommerce + custom theme** (nikamooz, daneshjooyar, maktabsharif, modireweb) | 4 live sites [53] | **Medium** (field, no market data) |
| 3 | **Tutor LMS (± WooCommerce)** | Emperor 2,549 sales on Tutor [32]. Tutor has 100k global installs [1]. Edumall `[unverified Tutor]`. | Medium |
| 4 | **LearnPress** (+ Eduma) | 70k global [1]. Eduma 486 on rtl-theme and 1,894 on zhaket [30][35]. Gateland and IDPay have LearnPress gateways [45][1]. | Medium-weak |
| 5 | **LifterLMS** (+ BuddyBoss, Woo Memberships) | **IBA (tenant #1)** [54]. Gateland has a LifterLMS gateway [45]. Global 10k [1]. | Weak in the market, **critical for us** |
| 6 | LearnDash (+ BuddyBoss) | BuddyBoss sales of 620 and 629 [30][35]. No Iranian field hit. | Weak |
| — | MasterStudy, Masteriyo, Sensei, Academy | MasterStudy theme 843 [30]. Nothing else local. | Very weak |

### E.2 Recommendation: what to support first

1. **WooCommerce core adapter (must-have; every stack above sells through it).** Covers customers, orders, line items, coupons and gateway payments, including both legacy `shop_order` and HPOS, and IRT/IRR/IRHT/IRHR via `toRial`. Payment `refId`/`authority` come from Zarinpal, Zibal and Gateland (§D.4). Phones come from Digits, WP SMS, `billing_phone` and similar (§D.5). Courses are created **from products**, with a pluggable **theme-curriculum adapter**: v1 ships Nias-style Carbon `course_sections` [41] plus a **manual mapping UI**. A Studiare adapter follows once a sample database is obtained `[unverified format]`.
2. **LifterLMS adapter.** Justified by tenant #1. It has the richest REST API (`llms/v1`, consumer keys) [4]. IBA's content endpoints are already reachable [54].
3. **Tutor LMS adapter.** Second-largest by global installs and used by the #2 Iranian theme (Emperor). Its data model is clean: posts plus `tutor_*` tables [3].
4. Next, **LearnPress**: clean schema, and its free migrator documents LearnDash and Tutor [2][9]. **Skip LearnDash** in v1, because of serialized PHP, two quiz-table generations and no Iranian field evidence.

**Ingestion modes, in order of preference:**

- **(a) Database dump upload** (`mysqldump` or a phpMyAdmin export). This is the only mode that gets custom tables, usermeta phones, Carbon/Studiare meta and order history in one step. Parse SQL server-side and never execute it.
- **(b) Authenticated REST**: the WordPress application password via `authorize-application.php` [27], plus WooCommerce `ck_/cs_` keys [20], plus a LifterLMS key [4]. No server access is needed, but there are per-plugin keys and gaps (Studiare meta and Digits usermeta are usually not exposed).
- **(c) WXR** for blog posts and media only [28].
- **Media:** download `attachment_url` files into Edvora's private uploads. "No external runtime dependencies" means **no hot-linking** back to WordPress.

**Pre-flight report (before anything is written):** run without credentials.

- Detect plugins and theme (HTML plus `/wp-json/` namespaces).
- Read WooCommerce currency from the Store API.
- Report the WordPress version, and from it the expected hash formats.
- Count courses, users and orders.
- Flag unsupported items (events, SpotPlayer content, BuddyBoss social data).
- Get human sign-off, which matches AGENTS.md: deleting or overwriting data needs Farjad.

### E.3 Mapping: WordPress concept → Edvora collection

Legend: Woo = WooCommerce, LL = LifterLMS, TU = Tutor, LP = LearnPress, TH = Iranian theme (product-based).

| Edvora field | Woo / TH | LifterLMS | Tutor | LearnPress | Notes and gotchas |
| --- | --- | --- | --- | --- | --- |
| **users.phone** (unique, login key) | `digits_phone` › `digits_phone_no`+`digt_countrycode` › `mobile` › `phone_number` › `billing_phone` › order billing phone | same (usermeta) | same | same | `normalizeIranMobile`. Duplicates go to a review queue. Users without a phone stay in a "no-login" holding state (they can't log in by OTP) [48][50][52] |
| users.firstName / lastName | usermeta `first_name`/`last_name`, falling back to `billing_first_name`/`billing_last_name` | + `_llms_billing_first_name` on orders [4] | same | same | Normalize Persian ی/ک and ZWNJ |
| users.nationalCode | no core field. Theme or checkout plugins may add one `[unverified key]` | — | — | — | Detect `*national*code*`/`*melli*` meta. Validate the checksum |
| users.roles | `{prefix}capabilities` (`administrator`, `shop_manager`, `customer`) | + instructors (`_llms_instructors`) | `_tutor_instructor_status` usermeta [3] | — | Default deny. Only `student` is imported automatically. Staff roles need confirmation |
| (password) | `user_pass` `$P$` / `$wp$2y$` / `$2y$` / md5 | — | — | — | **Not imported** for students (OTP). Optional staff fallback [26] |
| **courses.title / slug** | product `post_title` / `post_name` (URL-decode Persian slugs) | `course` post | `courses` post | `lp_course` post | Keep `legacySlug` for 301s |
| courses.summary | `post_excerpt` | `post_excerpt` | `post_excerpt` | `post_excerpt` | |
| **courses.price (rial)** | product `_regular_price`/`_sale_price` × currency factor | **Woo product if linked**, else access plan `_llms_price` × `lifterlms_currency` factor | `tutor_course_price`, or the product price when `monetize_by=wc` | `_lp_regular_price`/`_lp_sale_price` | `toRial()`. Reject fractions. At IBA the LifterLMS plan price is a placeholder `1` [54] |
| courses.maxInstalments | none in core. Iranian instalment plugins `[unverified]` | `_llms_frequency`/`_llms_length` (recurring plans) [4] | subscription plans (Pro) | — | Default 1. Flag recurring plans for manual review |
| courses.heroImage | `_thumbnail_id` → attachment | same | same | same | Download into media |
| **lessons.module** (text) | TH: section title (e.g. Nias `section_title` [41]) | `section` post title, ordered by `_llms_order` | `topics` post title (`menu_order`) | `learnpress_sections.section_name` | |
| lessons.order | TH array index | `_llms_order` | `menu_order` | `section_items.item_order` | Renumber densely per course |
| lessons.durationMinutes | TH `lesson_duration` (free text: parse "۱۲:۳۰") | — (`_llms_length` is course-level) | `_video.runtime` `[unverified]` | `_lp_duration` ("10 minute") | Parse Persian digits |
| lessons.isFreePreview | TH `lesson_private` inverted [41] | `_llms_free_lesson` | lesson preview `[unverified key]` | `_lp_preview` | |
| **lessons.videoUrl** | TH `video_url`/`video_embed` | `_llms_video_embed` | `_video.source_*` by `source` | parse `post_content` | SpotPlayer, Skyroom and Presto blocks become **DRM/external stubs**, not a URL |
| lessons.notes | lesson content | `post_content` | `post_content` | `post_content` | Sanitize HTML. Shortcodes are stripped or flagged |
| lessons.resources | TH `lesson_download`; Woo downloadable files | — | `_tutor_attachments` | `learnpress_files` | Download files |
| **quizzes / questions** | — | `llms_quiz`, `llms_question` (`_llms_question_type`) | `tutor_quiz_questions` + answers | `lp_question` + `learnpress_question_answers` | Type map: single (LP `single_choice`, TU `single_choice`), multi (LP `multi_choice`, TU `multiple_choice`), true-false (LP `true_or_false`, TU `true_false`), short (TU `short_answer`/`open_ended`). Anything else (matching, ordering, fill-in, image, h5p) is **skipped and reported** |
| **enrollments** (user, course, status, enrolledAt) | Derived: completed/processing order containing a course product, or Woo Memberships `wc_user_membership` → plan → content | `lifterlms_user_postmeta` `_status`/`_start_date` [4] | `tutor_enrolled` post (`post_date_gmt`) [3] | `user_items` with `item_type='lp_course'` | Status map: active / expired / cancelled. Use `_gmt` columns |
| enrollments.completedLessons | — | `_is_complete` rows per lesson [4] | `_tutor_completed_lesson_id_{id}` usermeta [3] | `user_items` lesson rows with status `completed` | |
| **orders** subtotal/discount/total (rial) | `wc_orders.total_amount` / `_order_total`, `discount_total_amount` / `_cart_discount` × factor | `llms_order` `_llms_total`, `_llms_original_total`, `_llms_coupon_amount` | `tutor_orders.subtotal_price/discount_amount/total_price` | `_order_subtotal`/`_order_total` | Read the currency **per order** [16][42] |
| orders.couponCode | `woocommerce_order_items` with type `coupon` `[unverified]` / `wc_order_coupon_lookup` | `_llms_coupon_code` | `tutor_orders.coupon_code` | — | |
| orders.status | `wc-completed`→paid, `wc-processing`→paid, `wc-refunded`, `wc-cancelled`, `wc-failed`, `wc-pending`/`on-hold` → pending `[unverified: prefix detail]` | `llms-completed`/`llms-active` → paid … [4] | `order_status` | `lp-completed` … [2] | |
| orders.instalments | — | recurring plan | subscriptions | — | Default 1 |
| **orders.payments** (provider, authority, refId, cardPan) | provider ← `payment_method` (`WC_ZPal`, `WC_Gateway_Zibal`, Gateland); refId ← `transaction_id`; authority ← `_zarinpal_authority` / `_zibal_track_id` / `authority`; cardPan ← Gateland `card_number` | `llms_transaction` `_llms_gateway_transaction_id` | `tutor_orders.transaction_id`, `payment_payloads` | `_transaction_id` | [43][44][45] |
| **coupons** (code, kind, value, maxDiscount, validUntil, usageLimit) | `shop_coupon`: `post_title`=code, `discount_type` (percent / fixed_cart / fixed_product), `coupon_amount` (×factor when fixed), `date_expires` (Unix), `usage_limit` | `llms_coupon` `_llms_*` [4] | `tutor_coupons` (`discount_type` percentage/flat, `expire_date_gmt`, `total_usage_limit`) [3] | — | maxDiscount has no Woo equivalent (null) |
| **certificates** (code unique, holderName, issuedAt) | — | `llms_my_certificate` (`_llms_sequential_id`, `_llms_awarded`) [4] | Pro add-on `[unverified]` | add-on `[unverified]` | Generate a new Edvora code and keep the old ID as `legacyRef`. **Do not invent certificate claims** |
| **posts** (title, slug, excerpt, body, publishedAt) | `post` posts (also via WXR [28]) | same | same | same | `post_date_gmt` → `publishedAt` (UTC). Jalali display is handled by Edvora |
| **media** | `attachment` posts / `wp:attachment_url` | same | same | same | Self-host and rewrite URLs in bodies |
| (legacyDrm) | `_spotplayer_data` order meta (`_id`, `key`) [41] `[unverified original]` | — | — | — | Needs a new field or collection, so write an ADR |
| (out of scope v1) | MEC events, Tickera tickets, BuddyBoss groups, SupportCandy tickets, wallets (TeraWallet balances!) | | | | Report counts. **Wallet balances are money**, so ask the client |

### E.4 Open questions and TODOs

- Get a **sample DB dump of a Studiare site** to reverse-engineer `studiare-core` course meta. This is the #1 Iranian stack, and its format is unverified.
- Confirm the original SpotPlayer plugin's order-meta key and shape (expected `_spotplayer_data`). This needs Farjad's approval to download the vendor zip.
- Confirm how IBA links WooCommerce products to LifterLMS (Memberships plans → `llms_membership`? auto-enroll hooks?). This needs an IBA admin export or an API key (client approval).
- Find out why IBA's `llms/v1/lessons` reports 1,091 lessons but returns an empty body unauthenticated.
- Confirm LearnDash `ld_course_steps` and the quiz `answer_data` format, but only if LearnDash support is ever prioritized.
- Find the national-code meta keys used by Iranian checkout plugins.
- Decide on an ADR for wallet balances (TeraWallet `woo-wallet` seen on 2 of 8 sites [53]), since these are customer money.
- Security note for the client: IBA runs **WP Shamsi**, closed on wp.org for a security issue [1], plus outdated WordPress 5.7, WooCommerce 5.4 and PHP 7.4. This is relevant to the migration timeline, but it is a public claim about the client and **must go through Farjad before anything is sent to the client**.

---

## Sources

All accessed 2026-11-06.

1. WordPress.org Plugins API, `plugin_information` and `query_plugins`: https://api.wordpress.org/plugins/info/1.2/ (queried for each slug: learnpress, tutor, lifterlms, learning-management-system, sensei-lms, masterstudy-lms-learning-management-system, academy, woocommerce, memberpress, paid-memberships-pro, persian-woocommerce, wp-parsidate, wp-jalali, wp-shamsi, zarinpal-woocommerce-payment-gateway, zibal-payment-gateway-for-woocommerce, woo-idpay-gateway, presto-player, learnpress-import-export, tutor-lms-elementor-addons, gateland, nias-course, wp-sms, login-with-phone-number, persian-woocommerce-sms, mellat-woocommerce, arvancloud-vod, wp-aparat, skyroom-wp, idpay-payment-learnpress, idpay-paid-memberships-pro). Plugin pages are at https://wordpress.org/plugins/<slug>/
2. LearnPress source, commit `ae50d1b`: https://github.com/LearnPress/learnpress (`config/table/tables-v4.php`, `inc/lp-constants.php`, `inc/Models/*`)
3. Tutor LMS source, commit `2df35d2`: https://github.com/themeum/tutor (`classes/Tutor.php`, `classes/Utils.php`, `classes/RestAPI.php`, `restapi/RestAuth.php`, `models/EnrollmentModel.php`, `ecommerce/Ecommerce.php`, `views/options/template/import_export.php`)
4. LifterLMS source, commit `8d933dc`: https://github.com/gocodebox/lifterlms (`includes/class.llms.install.php`, `includes/class.llms.post-types.php`, `includes/models/*`, `includes/abstracts/abstract.llms.post.model.php`, `libraries/lifterlms-rest/*`, `CHANGELOG.md`)
5. Sensei LMS source, commit `c8e4d0a`: https://github.com/Automattic/sensei (`includes/internal/installer/class-schema.php`, `includes/class-sensei-utils.php`, `includes/data-port/*`)
6. Masteriyo 3.5.1 release zip: https://downloads.wordpress.org/plugin/learning-management-system.latest-stable.zip (`database/migrations/*`, `includes/PostType/*`, `includes/Enums/*`, `includes/Exporter/*`, `includes/Importer/*`)
7. MasterStudy LMS 3.7.58 release zip: https://downloads.wordpress.org/plugin/masterstudy-lms-learning-management-system.latest-stable.zip (`_core/libraries/db/*`)
8. Academy LMS SVN trunk 4.0.8: https://plugins.svn.wordpress.org/academy/trunk/ (`includes/database/*`, `includes/database.php`, `addons/migration-tool/classes/{learndash,learnpress,lifterlms,masterstudy,tutor}.php`)
9. LearnPress – Backup & Migration Tool 4.1.7 zip: https://downloads.wordpress.org/plugin/learnpress-import-export.latest-stable.zip (`readme.txt`, `inc/LearnDashMigration/*`)
10. LearnDash developer reference, `learndash_get_user_courses_from_meta`: https://developers.learndash.com/function/learndash_get_user_courses_from_meta/
11. LearnDash REST API v2 reference: https://developers.learndash.com/rest-api/v2/
12. LearnDash `LDLMS_Course_Steps` class: https://developers.learndash.com/class/ldlms_course_steps/
13. *(secondary)* CraftedSignal brief on LearnDash API exposure: https://feed.craftedsignal.io/briefs/2026-09-learndash-api-exposure/
14. *(secondary)* Nexcess, LearnDash import/export: https://docs.nexcess.com/?p=61826
15. *(secondary)* CartMango, LearnDash pricing 2026: https://cartmango.com/learndash-pricing/
16. WooCommerce `OrdersTableDataStore.php` (trunk): https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/src/Internal/DataStores/Orders/OrdersTableDataStore.php
17. WooCommerce `class-wc-install.php` (trunk): https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/includes/class-wc-install.php
18. WooCommerce `wc-core-functions.php` (trunk), currency symbols: https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/includes/wc-core-functions.php
19. WooCommerce HPOS docs: https://developer.woocommerce.com/docs/features/high-performance-order-storage/
20. WooCommerce REST API docs, authentication: https://woocommerce.github.io/woocommerce-rest-api-docs/#authentication
21. WooCommerce Subscriptions data structures: https://woocommerce.com/document/subscriptions/develop/data-structure/
22. WooCommerce Memberships data structure: https://woocommerce.com/document/woocommerce-memberships-data-structure/
23. MemberPress, "Where is data stored": https://memberpress.com/docs/where-is-data-stored/
24. Paid Memberships Pro database structure: https://paidmembershipspro.com/documentation/advanced/pmpro-database-structure
25. Make WordPress Core, "WordPress 6.8 will use bcrypt for password hashing" (2025-02-17): https://make.wordpress.org/core/2025/02/17/wordpress-6-8-will-use-bcrypt-for-password-hashing/
26. WordPress core `pluggable.php` (trunk): https://github.com/WordPress/wordpress-develop/blob/trunk/src/wp-includes/pluggable.php
27. Make WordPress Core, Application Passwords integration guide (2020-11-05): https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/
28. WordPress core `export.php` (trunk): https://github.com/WordPress/wordpress-develop/blob/trunk/src/wp-admin/includes/export.php
29. npm registry metadata: https://registry.npmjs.org/phpass, https://registry.npmjs.org/node-phpass, https://registry.npmjs.org/wordpress-hash-node, https://registry.npmjs.org/wp-passhash, https://registry.npmjs.org/bcryptjs, https://registry.npmjs.org/bcrypt
30. rtl-theme.com, education themes sorted by sales: https://www.rtl-theme.com/category/wp-themes/elearning/?order=DESC&orderBy=saleCount&style=grid
31. rtl-theme.com, Studiare: https://www.rtl-theme.com/studiare-online-learning-wordpress-theme/
32. rtl-theme.com, Emperor: https://www.rtl-theme.com/emperor-education-wordpress-theme/
33. rtl-theme.com, Parsa: https://www.rtl-theme.com/parsa-wordpress-theme/
34. rtl-theme.com, Ostadsho: https://www.rtl-theme.com/ostadsho-wordpress-theme/
35. zhaket.com, education category sorted by top sales: https://www.zhaket.com/web/category/education?sort_by=%22top_sales%22
36. zhaket.com, Studiare Plus: https://www.zhaket.com/web/studiare-education-wordpress-theme
37. *(secondary, search snippets)* zhaket.com product pages: https://www.zhaket.com/web/atour-theme, https://www.zhaket.com/web/shokrino-wordpress-theme, https://www.zhaket.com/web/tadris-theme, https://www.zhaket.com/web/digiacademy-theme
38. *(secondary)* Themesinfo, Studiare usage: https://themesinfo.com/studiare-wordpress-template-for-business-bsyvx/carkhan.ir-2pk5r
39. SpotPlayer licence API: https://spotplayer.ir/help/api
40. SpotPlayer WordPress plugin guide: https://spotplayer.ir/help/wordpress
41. Nias Course 1.3.3 zip: https://downloads.wordpress.org/plugin/nias-course.latest-stable.zip (`inc/functions.php`, `inc/nias-meta.php`, `woocommerce-course/spotplayer-license.php`, `woocommerce-course/curriculum-editor.php`)
42. Persian WooCommerce 10.0.7 zip: https://downloads.wordpress.org/plugin/persian-woocommerce.latest-stable.zip (`include/class-currencies.php`, `include/class-gateways.php`)
43. Zarinpal for WooCommerce 5.1.1 zip: https://downloads.wordpress.org/plugin/zarinpal-woocommerce-payment-gateway.latest-stable.zip (`class-wc-gateway-zarinpal.php`)
44. Zibal for WooCommerce 2.1 zip: https://downloads.wordpress.org/plugin/zibal-payment-gateway-for-woocommerce.latest-stable.zip (`class-wc-gateway-zibal.php`)
45. Gateland 2.5.1 zip: https://downloads.wordpress.org/plugin/gateland.latest-stable.zip (`src/Plugins/*`, `src/Gateways/*`, `src/Models/Transaction.php`)
46. Parsi Date 6.5.2 zip: https://downloads.wordpress.org/plugin/wp-parsidate.latest-stable.zip (`inc/App/Core/FixDates.php`, `inc/App/Integration/WooCommerce.php`)
47. CodeCanyon, Digits: https://codecanyon.net/item/digits-wordpress-mobile-number-signup-and-login/19801105
48. CodeCanyon comment by UnitedOver (Digits meta keys): https://codecanyon.net/comments/22650595
49. UnitedOver Digits KB, mobile number present but cannot log in: https://help.unitedover.com/digits/kb/not-able-to-login-even-when-user-mobile-number-is-present-in-profile/
50. WSMS (WP SMS) 7.2.12 zip: https://downloads.wordpress.org/plugin/wp-sms.latest-stable.zip (`includes/class-wpsms-notifications.php`)
51. Persian WooCommerce SMS 7.3.3 zip: https://downloads.wordpress.org/plugin/persian-woocommerce-sms.latest-stable.zip
52. OTP Login With Phone Number 1.8.79 zip: https://downloads.wordpress.org/plugin/login-with-phone-number.latest-stable.zip
53. Live fingerprints (homepage HTML, `/wp-json/` index, `/wp-json/wc/store/v1/products`, theme `style.css`): https://carkhan.ir/, https://www.nikkhooy.ir/, https://nikamooz.com/, https://daneshjooyar.com/, https://maktabsharif.ir/, https://modireweb.com/, https://hamyarwp.com/, https://learnfiles.com/, https://mihanwp.com/, https://7learn.com/, https://toplearn.com/, https://roocket.ir/, https://faradars.org/, https://sabzlearn.ir/, https://maktabkhooneh.org/, https://mongard.ir/, https://honari.com/, https://www.zhaket.com/, https://www.digikala.com/, https://carkhan.ir/wp-content/themes/studiare/style.css, https://daneshjooyar.com/wp-content/themes/daneshlight/style.css
54. Iran Brand Academy public fingerprint: https://iranbrandacademy.com/ (HTML, headers), https://iranbrandacademy.com/wp-json/, https://iranbrandacademy.com/wp-json/wp/v2/types, https://iranbrandacademy.com/wp-json/llms/v1/{courses,sections,lessons,memberships,access-plans,students}, https://iranbrandacademy.com/wp-json/wc/store/products, and `https://iranbrandacademy.com/wp-content/plugins/{lifterlmsfa,bridge-for-woocommerce,presto-player,wp-shamsi,woocommerce,modern-events-calendar,tickera-event-ticketing-system,supportcandy,random-quiz-addon-for-lifterlms}/readme.txt`, `…/woocommerce-memberships/changelog.txt`
55. WordPress.org closure notices, returned by [1] as `"error":"closed"` with `closed_date` and `reason`: academy (2026-10-11, temporary), paid-memberships-pro (2024-10-17, author request), wp-shamsi (2023-07-18, security issue), woo-idpay-gateway (2026-04-07, security issue)
