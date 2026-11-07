<?php
/**
 * Plugin options. All options are stored with autoload = no; the secret is a separate option and is never echoed.
 *
 * @package EdvoraMigrator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Settings storage.
 */
class Edvora_Migrator_Settings {

	const OPT_SETTINGS = 'edvora_migrator_settings';
	const OPT_SECRET   = 'edvora_migrator_secret';
	const OPT_STATE    = 'edvora_migrator_state';
	const OPT_TMPDIR   = 'edvora_migrator_tmpdir';

	/**
	 * All option names (used by uninstall).
	 *
	 * @return string[]
	 */
	public static function option_names() {
		return array( self::OPT_SETTINGS, self::OPT_SECRET, self::OPT_STATE, self::OPT_TMPDIR );
	}

	/**
	 * Read settings.
	 *
	 * @return array{url:string,connection:string,tenant:string}
	 */
	public static function get() {
		$s = get_option( self::OPT_SETTINGS, array() );
		$s = is_array( $s ) ? $s : array();
		return array(
			'url'        => isset( $s['url'] ) ? (string) $s['url'] : '',
			'connection' => isset( $s['connection'] ) ? (string) $s['connection'] : '',
			'tenant'     => isset( $s['tenant'] ) ? (string) $s['tenant'] : '',
		);
	}

	/**
	 * Save settings.
	 *
	 * @param array $values url, connection, tenant.
	 */
	public static function save( $values ) {
		self::put( self::OPT_SETTINGS, $values );
	}

	/**
	 * The secret, or ''.
	 *
	 * @return string
	 */
	public static function secret() {
		return (string) get_option( self::OPT_SECRET, '' );
	}

	/**
	 * Store the secret.
	 *
	 * @param string $secret Secret.
	 */
	public static function save_secret( $secret ) {
		self::put( self::OPT_SECRET, (string) $secret );
	}

	/**
	 * Generic non-autoloaded option write.
	 *
	 * @param string $name  Option name.
	 * @param mixed  $value Value.
	 */
	public static function put( $name, $value ) {
		if ( false === get_option( $name, false ) ) {
			add_option( $name, $value, '', 'no' );
		} else {
			update_option( $name, $value, 'no' );
		}
	}

	/**
	 * Validate the Edvora URL: https, or http only for localhost / *.localhost. Returns '' when invalid.
	 *
	 * @param string $url URL.
	 * @return string
	 */
	public static function sanitize_url( $url ) {
		$url   = untrailingslashit( trim( (string) $url ) );
		$parts = wp_parse_url( $url );
		if ( ! is_array( $parts ) || empty( $parts['scheme'] ) || empty( $parts['host'] ) ) {
			return '';
		}
		$scheme = strtolower( $parts['scheme'] );
		if ( 'https' === $scheme ) {
			return esc_url_raw( $url, array( 'https' ) );
		}
		if ( 'http' === $scheme && Edvora_Migrator_Util::is_local_host( $parts['host'] ) ) {
			return esc_url_raw( $url, array( 'http' ) );
		}
		return '';
	}
}
