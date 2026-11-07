<?php
/**
 * Detect installed plugins by canonical slug, even when the folder was renamed (IBA: lifterlms → lifterlmsfa).
 *
 * @package EdvoraMigrator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Plugin detector.
 */
class Edvora_Migrator_Detector {

	/**
	 * Known main-file names → canonical slug. Checked before the Text Domain header.
	 *
	 * @var array
	 */
	private static $main_files = array(
		'woocommerce.php'             => 'woocommerce',
		'lifterlms.php'               => 'lifterlms',
		'tutor.php'                   => 'tutor',
		'woocommerce-memberships.php' => 'woocommerce-memberships',
		'digits.php'                  => 'digits',
		'presto-player.php'           => 'presto-player',
	);

	/**
	 * Cached list.
	 *
	 * @var array|null
	 */
	private static $cache = null;

	/**
	 * All installed plugins: slug, folder, file, version, active.
	 *
	 * @return array[]
	 */
	public static function plugins() {
		if ( null !== self::$cache ) {
			return self::$cache;
		}
		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		$out = array();
		foreach ( get_plugins() as $file => $headers ) {
			$folder = dirname( $file );
			$main   = basename( $file );
			if ( isset( self::$main_files[ $main ] ) ) {
				$slug = self::$main_files[ $main ];
			} elseif ( ! empty( $headers['TextDomain'] ) ) {
				$slug = sanitize_key( $headers['TextDomain'] );
			} else {
				$slug = '.' === $folder ? sanitize_key( basename( $file, '.php' ) ) : sanitize_key( $folder );
			}
			$out[] = array(
				'slug'    => $slug,
				'folder'  => '.' === $folder ? '' : $folder,
				'file'    => $file,
				'name'    => isset( $headers['Name'] ) ? wp_strip_all_tags( $headers['Name'] ) : $slug,
				'version' => isset( $headers['Version'] ) ? (string) $headers['Version'] : '',
				'active'  => is_plugin_active( $file ) || ( is_multisite() && is_plugin_active_for_network( $file ) ),
			);
		}
		self::$cache = $out;
		return $out;
	}

	/**
	 * Whether a plugin with this canonical slug is active.
	 *
	 * @param string $slug Canonical slug.
	 * @return bool
	 */
	public static function is_active( $slug ) {
		foreach ( self::plugins() as $p ) {
			if ( $p['slug'] === $slug && $p['active'] ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Active stacks we can export.
	 *
	 * @return array{woo:bool,woo_memberships:bool,lifterlms:bool,tutor:bool}
	 */
	public static function stacks() {
		return array(
			'woo'             => self::is_active( 'woocommerce' ),
			'woo_memberships' => self::is_active( 'woocommerce' ) && self::is_active( 'woocommerce-memberships' ),
			'lifterlms'       => self::is_active( 'lifterlms' ),
			'tutor'           => self::is_active( 'tutor' ),
		);
	}

	/**
	 * Whether WooCommerce reads orders from the HPOS tables.
	 *
	 * @return bool
	 */
	public static function woo_hpos() {
		global $wpdb;
		return 'yes' === get_option( 'woocommerce_custom_orders_table_enabled', 'no' )
			&& Edvora_Migrator_Util::table_exists( $wpdb->prefix . 'wc_orders' );
	}

	/**
	 * Manifest `plugins` list (FORMAT §3).
	 *
	 * @return array[]
	 */
	public static function manifest_plugins() {
		$out = array();
		foreach ( self::plugins() as $p ) {
			$out[] = array(
				'slug'    => $p['slug'],
				'folder'  => $p['folder'],
				'version' => $p['version'],
				'active'  => (bool) $p['active'],
			);
		}
		return $out;
	}
}
