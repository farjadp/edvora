<?php
/**
 * Persian translations without a .mo file: English source strings go through __() as usual and this filter
 * swaps in Persian when the admin locale is fa_*. A real .po/.mo in /languages wins if present.
 *
 * @package EdvoraMigrator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Translation helper.
 */
class Edvora_Migrator_I18n {

	/**
	 * Hook the filters.
	 */
	public static function init() {
		add_action( 'init', array( __CLASS__, 'load_textdomain' ) );
		add_filter( 'gettext', array( __CLASS__, 'filter' ), 10, 3 );
	}

	/**
	 * Load an optional .mo from /languages.
	 */
	public static function load_textdomain() {
		load_plugin_textdomain( 'edvora-migrator', false, dirname( plugin_basename( EDVORA_MIGRATOR_FILE ) ) . '/languages' );
	}

	/**
	 * Gettext filter.
	 *
	 * @param string $translation Current translation.
	 * @param string $text        Source text.
	 * @param string $domain      Text domain.
	 * @return string
	 */
	public static function filter( $translation, $text, $domain ) {
		if ( 'edvora-migrator' !== $domain || $translation !== $text ) {
			return $translation;
		}
		$locale = function_exists( 'determine_locale' ) ? determine_locale() : get_locale();
		if ( 0 !== strpos( (string) $locale, 'fa' ) ) {
			return $translation;
		}
		$map = self::strings();
		return isset( $map[ $text ] ) ? $map[ $text ] : $translation;
	}

	/**
	 * English → Persian.
	 *
	 * @return array
	 */
	public static function strings() {
		static $map = null;
		if ( null !== $map ) {
			return $map;
		}
		$map = array(
			'Migrate to Edvora'                                                                                  => 'انتقال به ادوورا',
			'Edvora Migrator'                                                                                    => 'انتقال به ادوورا',
			'Connection settings'                                                                                => 'تنظیمات اتصال',
			'Edvora URL'                                                                                         => 'نشانی ادوورا',
			'Connection ID'                                                                                      => 'شناسه‌ی اتصال',
			'Secret'                                                                                             => 'کلید محرمانه',
			'Tenant'                                                                                             => 'آکادمی (tenant)',
			'Filled automatically after a successful connection test.'                                          => 'پس از آزمایش موفق اتصال، خودکار پر می‌شود.',
			'A secret is stored. Leave empty to keep it.'                                                        => 'یک کلید ذخیره شده است. برای نگه‌داشتن آن، خالی بگذارید.',
			'Copy the URL, connection ID and secret from Edvora admin → Import from WordPress.'                => 'نشانی، شناسه‌ی اتصال و کلید محرمانه را از پیشخوان ادوورا ← «درون‌ریزی از وردپرس» کپی کنید.',
			'Save settings'                                                                                      => 'ذخیره‌ی تنظیمات',
			'Settings saved.'                                                                                    => 'تنظیمات ذخیره شد.',
			'Test connection'                                                                                    => 'آزمایش اتصال',
			'Connected.'                                                                                         => 'اتصال برقرار است.',
			'Preflight summary'                                                                                  => 'خلاصه‌ی پیش از انتقال',
			'Detected plugins'                                                                                   => 'افزونه‌های شناسایی‌شده',
			'Records to export'                                                                                  => 'رکوردهای قابل انتقال',
			'Kind'                                                                                               => 'نوع',
			'Count'                                                                                              => 'تعداد',
			'WordPress version'                                                                                  => 'نسخه‌ی وردپرس',
			'PHP version'                                                                                        => 'نسخه‌ی PHP',
			'WooCommerce currency'                                                                               => 'واحد پول ووکامرس',
			'LifterLMS currency'                                                                                 => 'واحد پول LifterLMS',
			'Tutor LMS currency'                                                                                 => 'واحد پول Tutor LMS',
			'Order storage'                                                                                      => 'ذخیره‌سازی سفارش‌ها',
			'HPOS tables'                                                                                        => 'جدول‌های HPOS',
			'Posts (legacy)'                                                                                     => 'پست‌ها (قدیمی)',
			'Not active'                                                                                         => 'فعال نیست',
			'Send to Edvora'                                                                                     => 'ارسال به ادوورا',
			'Download bundle'                                                                                    => 'دریافت فایل بسته',
			'Restart from the beginning'                                                                         => 'شروع دوباره از ابتدا',
			'Preparing…'                                                                                         => 'در حال آماده‌سازی…',
			'Sending…'                                                                                           => 'در حال ارسال…',
			'Building bundle…'                                                                                   => 'در حال ساخت بسته…',
			'Done. Go back to Edvora to review the import.'                                                      => 'انجام شد. برای بازبینی درون‌ریزی به ادوورا برگردید.',
			'Bundle ready. Your download will start now.'                                                        => 'بسته آماده است. دریافت فایل شروع می‌شود.',
			'Stopped with an error. You can retry; finished parts are not sent again.'                          => 'با خطا متوقف شد. می‌توانید دوباره تلاش کنید؛ بخش‌های ارسال‌شده دوباره فرستاده نمی‌شوند.',
			'This plugin only reads your data. It changes nothing on this site.'                                 => 'این افزونه فقط داده‌ها را می‌خواند و هیچ چیزی را در این سایت تغییر نمی‌دهد.',
			'Passwords, sessions and application passwords are never exported.'                                 => 'رمزهای عبور، نشست‌ها و رمزهای برنامه هرگز منتقل نمی‌شوند.',
			'You are not allowed to do this.'                                                                    => 'اجازه‌ی این کار را ندارید.',
			'The link has expired. Reload the page and try again.'                                               => 'پیوند منقضی شده است. صفحه را دوباره بارگذاری کنید.',
			'Edvora URL must use https (http is allowed only for localhost).'                                    => 'نشانی ادوورا باید با https باشد (http فقط برای localhost مجاز است).',
			'Fill in the Edvora URL, connection ID and secret first.'                                            => 'ابتدا نشانی ادوورا، شناسه‌ی اتصال و کلید محرمانه را وارد کنید.',
			'Edvora did not answer: %s'                                                                          => 'ادوورا پاسخ نداد: %s',
			'Edvora answered with HTTP %1$d: %2$s'                                                               => 'ادوورا با کد HTTP %1$d پاسخ داد: %2$s',
			'Unexpected answer from Edvora.'                                                                     => 'پاسخ غیرمنتظره از ادوورا.',
			'Could not create the temporary folder.'                                                             => 'ساخت پوشه‌ی موقت ممکن نشد.',
			'Could not write the temporary file.'                                                                => 'نوشتن فایل موقت ممکن نشد.',
			'No bundle is ready. Build it first.'                                                                => 'هنوز بسته‌ای آماده نیست. ابتدا آن را بسازید.',
			'Progress'                                                                                           => 'پیشرفت',
			'Job status: %s'                                                                                     => 'وضعیت کار: %s',
		);
		return $map;
	}
}
