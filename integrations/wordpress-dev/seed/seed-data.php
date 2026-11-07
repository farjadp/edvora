<?php
/**
 * Sample Persian data for the fixture sites. Run with: wp eval-file /seed/seed-data.php
 * Every person, phone, email and code here is invented. Runs once per site (option edvfx_seeded).
 *
 * Covers: Digits-style phones, Persian-digit billing phone, no phone, shared phone, national code,
 * excluded secrets (session tokens, application password, extra usermeta), Persian URL-encoded slugs,
 * Arabic ي/ك, LifterLMS courses/sections/lessons/quiz/enrollments/completions, Tutor course/topic/lessons/
 * quiz/enrollment/completion, WooCommerce products, coupons and orders (completed/processing/refunded/
 * cancelled/fractional/two line items).
 */

if ( get_option( 'edvfx_seeded' ) ) {
	WP_CLI::log( 'Already seeded; skipping.' );
	return;
}

/* ---------- helpers ---------- */

function edvfx_user( $login, $display, $first, $last, $meta = array(), $role = 'subscriber' ) {
	$id = username_exists( $login );
	if ( ! $id ) {
		$id = wp_insert_user(
			array(
				'user_login'   => $login,
				'user_email'   => $login . '@example.com',
				'user_pass'    => wp_generate_password( 20 ),
				'display_name' => $display,
				'first_name'   => $first,
				'last_name'    => $last,
				'role'         => $role,
			)
		);
		if ( is_wp_error( $id ) ) {
			WP_CLI::error( $id->get_error_message() );
		}
	}
	foreach ( $meta as $k => $v ) {
		update_user_meta( $id, $k, $v );
	}
	return (int) $id;
}

function edvfx_post( $args, $meta = array() ) {
	$args = array_merge( array( 'post_status' => 'publish', 'post_author' => 1 ), $args );
	$id   = wp_insert_post( $args, true );
	if ( is_wp_error( $id ) ) {
		WP_CLI::error( $id->get_error_message() );
	}
	foreach ( $meta as $k => $v ) {
		update_post_meta( $id, $k, $v );
	}
	return (int) $id;
}

function edvfx_insert( $table, $row ) {
	global $wpdb;
	$cols = $wpdb->get_col( "DESCRIBE {$table}", 0 );
	$row  = array_intersect_key( $row, array_flip( $cols ) );
	$wpdb->insert( $table, $row );
	return (int) $wpdb->insert_id;
}

/* ---------- users ---------- */

global $wpdb;
$cap = $wpdb->prefix . 'capabilities';

wp_update_user( array( 'ID' => 1, 'display_name' => 'مدیر سایت', 'first_name' => 'مدیر', 'last_name' => 'سایت' ) );

$u = array();
$u['sara']    = edvfx_user( 'sara.rezaei', 'سارا رضایی', 'سارا', 'رضایی', array( 'digits_phone' => '+989120000001', 'digits_phone_no' => '9120000001', 'digt_countrycode' => '+98', 'billing_phone' => '09120000001', 'melli_code' => '0000000001', 'billing_city' => 'تهران' ) );
$u['ali']     = edvfx_user( 'ali.ahmadi', 'علی احمدی', 'علی', 'احمدی', array( 'digits_phone' => '+989120000002', 'digits_phone_no' => '9120000002', 'digt_countrycode' => '+98' ) );
$u['maryam']  = edvfx_user( 'maryam.karimi', 'مریم کریمی', 'مریم', 'کریمی', array( 'digits_phone' => '+989120000003', 'digits_phone_no' => '9120000003', 'digt_countrycode' => '+98', 'national_code' => '0000000003' ) );
$u['reza']    = edvfx_user( 'reza.moradi', 'رضا مرادی', 'رضا', 'مرادی', array( 'digits_phone' => '+989120000004', 'digits_phone_no' => '9120000004', 'digt_countrycode' => '+98' ) );
$u['zahra']   = edvfx_user( 'zahra.hosseini', 'زهرا حسینی', 'زهرا', 'حسینی', array( 'billing_phone' => '۰۹۱۲۰۰۰۰۰۰۵', 'billing_first_name' => 'زهرا', 'billing_last_name' => 'حسینی' ) );
$u['hossein'] = edvfx_user( 'hossein.jafari', 'حسین جعفری', 'حسین', 'جعفری' ); // no phone at all
$u['nima']    = edvfx_user( 'nima.sadeghi', 'نیما صادقی', 'نیما', 'صادقی', array( 'digits_phone' => '+989120000007', 'digits_phone_no' => '9120000007', 'digt_countrycode' => '+98' ) );
$u['neda']    = edvfx_user( 'neda.sadeghi', 'ندا صادقی', 'ندا', 'صادقی', array( 'digits_phone' => '+989120000007', 'digits_phone_no' => '9120000007', 'digt_countrycode' => '+98' ) ); // same phone as nima
$u['fateme']  = edvfx_user( 'fateme.nouri', 'فاطمه نوری', 'فاطمه', 'نوری', array( 'mobile' => '09120000009' ) );
$u['mohammad'] = edvfx_user( 'mohammad.rahimi', 'محمد رحیمی', 'محمد', 'رحیمی', array( 'phone_number' => '+98 912 000 0010' ) );
$u['teacher'] = edvfx_user( 'teacher.amini', 'استاد امینی', 'کاوه', 'امینی', array( 'digits_phone' => '+989120000011', 'digits_phone_no' => '9120000011', 'digt_countrycode' => '+98', '_tutor_instructor_status' => 'approved', 'description' => 'مدرس نمونه برای داده‌ی آزمایشی.' ), get_role( 'instructor' ) ? 'instructor' : 'author' );
$u['arabic']  = edvfx_user( 'ali.karimi.ar', 'علي كريمي', 'علي', 'كريمي', array( 'digits_phone' => '+989120000012', 'digits_phone_no' => '9120000012', 'digt_countrycode' => '+98' ) ); // Arabic ي / ك

// Things that must NEVER be exported (the fixture verifies their absence).
update_user_meta( $u['sara'], 'session_tokens', array( 'deadbeef' => array( 'expiration' => time() + 3600, 'ip' => '127.0.0.1' ) ) );
update_user_meta( $u['sara'], 'edvfx_private_note', 'NOT-IN-ALLOWLIST' );
if ( class_exists( 'WP_Application_Passwords' ) ) {
	WP_Application_Passwords::create_new_application_password( $u['sara'], array( 'name' => 'fixture-app' ) );
}
update_user_meta( 1, 'session_tokens', array( 'cafebabe' => array( 'expiration' => time() + 3600 ) ) );

/* ---------- blog ---------- */

$cat = wp_insert_term( 'اخبار آکادمی', 'category', array( 'slug' => 'اخبار-آکادمی' ) );
$cat = is_wp_error( $cat ) ? (int) $cat->get_error_data() : (int) $cat['term_id'];
$tag = wp_insert_term( 'برندسازی', 'post_tag' );
$tag = is_wp_error( $tag ) ? (int) $tag->get_error_data() : (int) $tag['term_id'];

$p1 = edvfx_post( array( 'post_type' => 'post', 'post_title' => 'آغاز ثبت‌نام دوره‌های پاییز', 'post_content' => '<p>ثبت‌نام دوره‌های پاییز از امروز آغاز شد.</p>', 'post_category' => array( $cat ), 'post_date' => '2025-09-23 10:00:00' ) );
$p2 = edvfx_post( array( 'post_type' => 'post', 'post_title' => 'گزارش كارگاه برندسازي', 'post_content' => '<p>متن با ي و ك عربی برای آزمون یکسان‌سازی.</p>', 'post_category' => array( $cat ) ) );
$p3 = edvfx_post( array( 'post_type' => 'post', 'post_title' => 'پیش‌نویس: برنامه‌ی زمستان', 'post_status' => 'draft', 'post_content' => '<p>هنوز منتشر نشده.</p>' ) );
wp_set_post_terms( $p1, array( $tag ), 'post_tag', true );
update_post_meta( $p1, '_edit_lock', '1700000000:1' ); // excluded by FORMAT §4 row 4
update_post_meta( $p1, '_wp_old_slug', 'old-slug' ); // excluded
update_post_meta( $p1, 'edvfx_subtitle', 'زیرعنوان نمونه' ); // kept
$page = edvfx_post( array( 'post_type' => 'page', 'post_title' => 'درباره‌ی ما', 'post_content' => '<p>این یک آکادمی نمونه است.</p>' ) );

/* ---------- LifterLMS ---------- */

$llms = array();
if ( class_exists( 'LLMS_Course' ) ) {
	$c1 = new LLMS_Course( 'new', array( 'post_title' => 'دوره‌ی برندسازی شخصی', 'post_content' => '<p>دوره‌ی جامع برندسازی شخصی.</p>', 'post_author' => $u['teacher'] ) );
	$c2 = new LLMS_Course( 'new', array( 'post_title' => 'مدیریت استراتژیک برند', 'post_content' => '<p>مدیریت برند در سطح سازمان.</p>', 'post_author' => $u['teacher'] ) );
	$c1->set( 'length', '۸ هفته' );
	$llms['c1'] = $c1->get( 'id' );
	$llms['c2'] = $c2->get( 'id' );
	$course_cat = wp_insert_term( 'برند', 'course_cat' );
	if ( ! is_wp_error( $course_cat ) ) {
		wp_set_object_terms( $llms['c1'], array( (int) $course_cat['term_id'] ), 'course_cat' );
	}

	$mk_section = function ( $course_id, $title, $order ) {
		$s = new LLMS_Section( 'new', array( 'post_title' => $title ) );
		$s->set( 'parent_course', $course_id );
		$s->set( 'order', $order );
		return $s->get( 'id' );
	};
	$mk_lesson = function ( $course_id, $section_id, $title, $order, $content, $props = array() ) {
		$l = new LLMS_Lesson( 'new', array( 'post_title' => $title, 'post_content' => $content ) );
		$l->set( 'parent_course', $course_id );
		$l->set( 'parent_section', $section_id );
		$l->set( 'order', $order );
		foreach ( $props as $k => $v ) {
			$l->set( $k, $v );
		}
		return $l->get( 'id' );
	};

	$s11 = $mk_section( $llms['c1'], 'فصل اول: مبانی', 1 );
	$s12 = $mk_section( $llms['c1'], 'فصل دوم: اجرا', 2 );
	$s21 = $mk_section( $llms['c2'], 'فصل اول: تحلیل بازار', 1 );

	$llms['l1'] = $mk_lesson( $llms['c1'], $s11, 'جلسه اول', 1, '<p>ویدیوی جلسه:</p>[presto_player id="101"]<p>[spotplayer license="SP-FIXTURE-0001"]</p>', array( 'free_lesson' => 'yes' ) );
	$llms['l2'] = $mk_lesson( $llms['c1'], $s11, 'جلسه دوم', 2, '<p>معرفی ابزارها.</p>', array( 'video_embed' => 'https://www.youtube.com/watch?v=FIXTURE0001' ) );
	$llms['l3'] = $mk_lesson( $llms['c1'], $s12, 'جلسه سوم', 1, '<p>تمرین عملی.</p>' );
	$llms['l4'] = $mk_lesson( $llms['c2'], $s21, 'تحلیل رقبا', 1, '<p>تحلیل رقبا با مثال.</p>' );

	// Quiz on lesson 4 with single, multiple, true/false and an unsupported (Pro-only) question type.
	$quiz = new LLMS_Quiz( 'new', array( 'post_title' => 'آزمون فصل اول' ) );
	$quiz->set( 'lesson_id', $llms['l4'] );
	$quiz->set( 'passing_percent', 70 );
	$llms['quiz'] = $quiz->get( 'id' );
	$lesson4      = new LLMS_Lesson( $llms['l4'] );
	$lesson4->set( 'quiz', $llms['quiz'] );
	$lesson4->set( 'quiz_enabled', 'yes' );

	$questions = array(
		array( 'choice', 'برند چیست؟', 'no', array( array( 'هویت و ادراک', true ), array( 'فقط لوگو', false ), array( 'فقط رنگ', false ) ) ),
		array( 'choice', 'کدام موارد جزو هویت بصری‌اند؟', 'yes', array( array( 'لوگو', true ), array( 'رنگ سازمانی', true ), array( 'قیمت', false ) ) ),
		array( 'true_false', 'برند فقط برای شرکت‌های بزرگ است.', 'no', array( array( 'درست', false ), array( 'نادرست', true ) ) ),
		array( 'short_answer', 'شعار برند خود را بنویسید.', 'no', array() ),
	);
	$order = 1;
	foreach ( $questions as $q ) {
		$question = new LLMS_Question( 'new', array( 'post_title' => $q[1] ) );
		$question->set( 'question_type', $q[0] );
		$question->set( 'parent_id', $llms['quiz'] );
		$question->set( 'points', 1 );
		$question->set( 'multi_choices', $q[2] );
		$question->set( 'menu_order', $order++ );
		$markers = array( 'A', 'B', 'C', 'D' );
		foreach ( $q[3] as $i => $choice ) {
			if ( method_exists( $question, 'create_choice' ) ) {
				$question->create_choice( array( 'choice' => $choice[0], 'correct' => $choice[1], 'marker' => $markers[ $i ] ) );
			}
		}
	}

	// Access plans: one real price (rials, since lifterlms_currency = IRR) and IBA's placeholder price of 1.
	$plan1 = new LLMS_Access_Plan( 'new', 'پرداخت یکجا' );
	$plan1->set( 'product_id', $llms['c1'] );
	$plan1->set( 'price', 234500000 );
	$plan1->set( 'frequency', 0 );
	$plan1->set( 'is_free', 'no' );
	$plan2 = new LLMS_Access_Plan( 'new', 'دسترسی' );
	$plan2->set( 'product_id', $llms['c2'] );
	$plan2->set( 'price', 1 );
	$plan2->set( 'frequency', 0 );

	// Enrollments and completions.
	foreach ( array( 'sara', 'ali', 'maryam', 'reza', 'arabic' ) as $who ) {
		llms_enroll_student( $u[ $who ], $llms['c1'], 'admin_1' );
	}
	foreach ( array( 'ali', 'zahra' ) as $who ) {
		llms_enroll_student( $u[ $who ], $llms['c2'], 'admin_1' );
	}
	llms_mark_complete( $u['sara'], $llms['l1'], 'lesson', 'fixture' );
	llms_mark_complete( $u['sara'], $llms['l2'], 'lesson', 'fixture' );
	llms_mark_complete( $u['ali'], $llms['l1'], 'lesson', 'fixture' );
	if ( function_exists( 'llms_unenroll_student' ) ) {
		llms_unenroll_student( $u['reza'], $llms['c1'], 'cancelled', 'any' );
	}
	WP_CLI::log( 'LifterLMS: ' . wp_json_encode( $llms ) );
}

/* ---------- Tutor LMS ---------- */

$tutor = array();
if ( function_exists( 'tutor' ) || defined( 'TUTOR_VERSION' ) ) {
	$opt                  = get_option( 'tutor_option', array() );
	$opt                  = is_array( $opt ) ? $opt : array();
	$opt['monetize_by']   = 'wc';
	$opt['currency_code'] = 'IRT';
	update_option( 'tutor_option', $opt );

	$tutor['course'] = edvfx_post(
		array( 'post_type' => 'courses', 'post_title' => 'اصول طراحی لوگو', 'post_content' => '<p>از ایده تا لوگوی نهایی.</p>', 'post_author' => $u['teacher'] ),
		array( '_tutor_course_price_type' => 'paid', '_tutor_course_level' => 'beginner', '_course_duration' => array( 'hours' => '6', 'minutes' => '30', 'seconds' => '0' ) )
	);
	$tcat = wp_insert_term( 'طراحی', 'course-category' );
	if ( ! is_wp_error( $tcat ) ) {
		wp_set_object_terms( $tutor['course'], array( (int) $tcat['term_id'] ), 'course-category' );
	}
	$tutor['topic']   = edvfx_post( array( 'post_type' => 'topics', 'post_title' => 'بخش اول: ایده‌پردازی', 'post_parent' => $tutor['course'], 'menu_order' => 1 ) );
	$tutor['lesson1'] = edvfx_post(
		array( 'post_type' => 'lesson', 'post_title' => 'درس اول: اسکیس', 'post_parent' => $tutor['topic'], 'menu_order' => 1, 'post_content' => '<p>اسکیس اولیه.</p>' ),
		array( '_tutor_course_id_for_lesson' => $tutor['course'], '_video' => array( 'source' => 'youtube', 'source_youtube' => 'https://www.youtube.com/watch?v=FIXTURE0002', 'runtime' => array( 'hours' => '00', 'minutes' => '12', 'seconds' => '00' ) ), '_is_preview' => '1' )
	);
	$tutor['lesson2'] = edvfx_post(
		array( 'post_type' => 'lesson', 'post_title' => 'درس دوم: رنگ', 'post_parent' => $tutor['topic'], 'menu_order' => 2, 'post_content' => '[spotplayer license="SP-FIXTURE-0002"]' ),
		array( '_tutor_course_id_for_lesson' => $tutor['course'], '_video' => array( 'source' => 'shortcode', 'source_shortcode' => '[spotplayer license="SP-FIXTURE-0002"]' ) )
	);
	$tutor['quiz'] = edvfx_post( array( 'post_type' => 'tutor_quiz', 'post_title' => 'آزمون بخش اول', 'post_parent' => $tutor['topic'], 'menu_order' => 3 ), array( 'tutor_quiz_option' => array( 'passing_grade' => 60, 'max_questions_for_answer' => 10 ) ) );

	$qt = $wpdb->prefix . 'tutor_quiz_questions';
	$at = $wpdb->prefix . 'tutor_quiz_question_answers';
	if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $qt ) ) === $qt ) {
		$q1 = edvfx_insert( $qt, array( 'quiz_id' => $tutor['quiz'], 'question_title' => 'کدام فرمت برداری است؟', 'question_description' => '', 'question_type' => 'single_choice', 'question_mark' => '1.00', 'question_settings' => maybe_serialize( array( 'question_type' => 'single_choice', 'question_mark' => '1', 'answer_required' => '1' ) ), 'question_order' => 1 ) );
		edvfx_insert( $at, array( 'belongs_question_id' => $q1, 'belongs_question_type' => 'single_choice', 'answer_title' => 'SVG', 'is_correct' => 1, 'answer_order' => 1, 'answer_view_format' => 'text' ) );
		edvfx_insert( $at, array( 'belongs_question_id' => $q1, 'belongs_question_type' => 'single_choice', 'answer_title' => 'JPG', 'is_correct' => 0, 'answer_order' => 2, 'answer_view_format' => 'text' ) );
		$q2 = edvfx_insert( $qt, array( 'quiz_id' => $tutor['quiz'], 'question_title' => 'لوگو باید در اندازه‌ی کوچک خوانا باشد.', 'question_description' => '', 'question_type' => 'true_false', 'question_mark' => '1.00', 'question_settings' => maybe_serialize( array( 'question_type' => 'true_false' ) ), 'question_order' => 2 ) );
		edvfx_insert( $at, array( 'belongs_question_id' => $q2, 'belongs_question_type' => 'true_false', 'answer_title' => 'درست', 'is_correct' => 1, 'answer_order' => 1, 'answer_view_format' => 'text' ) );
		edvfx_insert( $at, array( 'belongs_question_id' => $q2, 'belongs_question_type' => 'true_false', 'answer_title' => 'نادرست', 'is_correct' => 0, 'answer_order' => 2, 'answer_view_format' => 'text' ) );
	}

	$tutor['enrol'] = edvfx_post( array( 'post_type' => 'tutor_enrolled', 'post_title' => 'Course Enrolled', 'post_status' => 'completed', 'post_parent' => $tutor['course'], 'post_author' => $u['maryam'] ) );
	update_user_meta( $u['maryam'], '_tutor_completed_lesson_id_' . $tutor['lesson1'], time() );
	update_user_meta( $u['maryam'], '_is_tutor_student', time() );
	WP_CLI::log( 'Tutor: ' . wp_json_encode( $tutor ) );
}

/* ---------- WooCommerce ---------- */

if ( class_exists( 'WC_Product_Simple' ) ) {
	$mk_product = function ( $title, $price, $slug_cat ) {
		$p = new WC_Product_Simple();
		$p->set_name( $title );
		$p->set_regular_price( $price );
		$p->set_virtual( true );
		$p->set_status( 'publish' );
		$p->set_category_ids( array( $slug_cat ) );
		return $p->save();
	};
	$pcat = wp_insert_term( 'دوره‌ها', 'product_cat' );
	$pcat = is_wp_error( $pcat ) ? (int) $pcat->get_error_data() : (int) $pcat['term_id'];

	$prod             = array();
	$prod['brand']    = $mk_product( 'دوره‌ی برندسازی شخصی (آنلاین)', '23450000', $pcat );
	$prod['strategy'] = $mk_product( 'مدیریت استراتژیک برند', '11700000', $pcat );
	$prod['logo']     = $mk_product( 'اصول طراحی لوگو', '7770000', $pcat );
	if ( ! empty( $tutor['course'] ) ) {
		update_post_meta( $tutor['course'], '_tutor_course_product_id', $prod['logo'] );
		update_post_meta( $prod['logo'], '_tutor_product', 'yes' );
	}
	// LifterLMS ↔ product link: no free-core linkage exists (IBA uses WooCommerce Memberships); matched by title only.

	$c = new WC_Coupon();
	$c->set_code( 'nowruz1405' );
	$c->set_discount_type( 'percent' );
	$c->set_amount( 20 );
	$c->save();
	$c = new WC_Coupon();
	$c->set_code( 'welcome500' );
	$c->set_discount_type( 'fixed_cart' );
	$c->set_amount( 500000 );
	$c->save();

	$mk_order = function ( $user_id, $products, $status, $opts = array() ) {
		$order = wc_create_order( array( 'customer_id' => $user_id ) );
		foreach ( $products as $pid ) {
			$order->add_product( wc_get_product( $pid ), 1 );
		}
		$user = get_userdata( $user_id );
		$order->set_address(
			array(
				'first_name' => get_user_meta( $user_id, 'first_name', true ),
				'last_name'  => get_user_meta( $user_id, 'last_name', true ),
				'email'      => $user->user_email,
				'phone'      => isset( $opts['phone'] ) ? $opts['phone'] : '',
				'country'    => 'IR',
			),
			'billing'
		);
		$order->set_currency( 'IRT' );
		if ( ! empty( $opts['coupon'] ) ) {
			$order->apply_coupon( $opts['coupon'] );
		}
		$order->calculate_totals( false );
		$order->set_payment_method( isset( $opts['gateway'] ) ? $opts['gateway'] : 'WC_ZPal' );
		$order->set_payment_method_title( isset( $opts['gateway_title'] ) ? $opts['gateway_title'] : 'زرین‌پال' );
		if ( ! empty( $opts['txn'] ) ) {
			$order->set_transaction_id( $opts['txn'] );
			$order->set_date_paid( time() - 3600 );
		}
		if ( ! empty( $opts['created'] ) ) {
			$order->set_date_created( $opts['created'] );
		}
		$order->set_status( $status );
		$order->save();
		return $order->get_id();
	};

	$orders              = array();
	$orders['completed'] = $mk_order( $u['sara'], array( $prod['brand'] ), 'completed', array( 'txn' => 'A00000000000000000000000000000000001', 'coupon' => 'nowruz1405', 'phone' => '09120000001', 'created' => '2025-03-25T08:30:00+00:00' ) );
	$orders['processing'] = $mk_order( $u['ali'], array( $prod['strategy'] ), 'processing', array( 'txn' => 'A00000000000000000000000000000000002', 'phone' => '۰۹۱۲۰۰۰۰۰۰۲' ) );
	$orders['refunded']  = $mk_order( $u['maryam'], array( $prod['logo'] ), 'completed', array( 'txn' => 'A00000000000000000000000000000000003', 'gateway' => 'bacs', 'gateway_title' => 'کارت به کارت' ) );
	$refund              = wc_create_refund( array( 'order_id' => $orders['refunded'], 'amount' => '7770000', 'reason' => 'انصراف دانشجو' ) );
	$o                   = wc_get_order( $orders['refunded'] );
	$o->set_status( 'refunded' );
	$o->save();
	$orders['cancelled'] = $mk_order( $u['reza'], array( $prod['brand'] ), 'cancelled', array( 'phone' => '09120000004' ) );
	$orders['two_items'] = $mk_order( $u['hossein'], array( $prod['brand'], $prod['strategy'] ), 'completed', array( 'txn' => 'A00000000000000000000000000000000005', 'coupon' => 'welcome500' ) );

	// Fractional amount: decimals temporarily 2 (a shop that changed settings over time).
	update_option( 'woocommerce_price_num_decimals', 2 );
	$prod['half']        = $mk_product( 'کارگاه نیم‌روزه', '1234567.50', $pcat );
	$orders['fractional'] = $mk_order( $u['zahra'], array( $prod['half'] ), 'completed', array( 'txn' => 'A00000000000000000000000000000000006', 'phone' => '۰۹۱۲۰۰۰۰۰۰۵' ) );
	update_option( 'woocommerce_price_num_decimals', 0 );

	WP_CLI::log( 'Woo products: ' . wp_json_encode( $prod ) . ' orders: ' . wp_json_encode( $orders ) . ' refund: ' . ( is_wp_error( $refund ) ? $refund->get_error_message() : $refund->get_id() ) );
}

update_option( 'edvfx_seeded', gmdate( 'c' ), false );
WP_CLI::success( 'Fixture data seeded.' );
