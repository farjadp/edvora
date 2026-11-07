<?php
/**
 * Small helpers shared by the exporter, bundle writer and pusher.
 *
 * @package EdvoraMigrator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Static helpers. No state.
 */
class Edvora_Migrator_Util {

	/**
	 * JSON flags used for every line we emit.
	 *
	 * @return int
	 */
	public static function json_flags() {
		$flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
		if ( defined( 'JSON_INVALID_UTF8_SUBSTITUTE' ) ) {
			$flags |= JSON_INVALID_UTF8_SUBSTITUTE;
		}
		return $flags;
	}

	/**
	 * Encode one NDJSON line (with trailing "\n").
	 *
	 * @param array $value Value to encode.
	 * @return string
	 */
	public static function json_line( $value ) {
		$json = wp_json_encode( $value, self::json_flags() );
		if ( false === $json ) {
			$json = wp_json_encode(
				array(
					'type'  => 'error',
					'error' => 'json_encode_failed',
				)
			);
		}
		return $json . "\n";
	}

	/**
	 * Make a string valid UTF-8 (invalid sequences stripped/replaced) — FORMAT §4.
	 *
	 * @param mixed $value Any scalar or null.
	 * @return mixed
	 */
	public static function clean( $value ) {
		if ( is_string( $value ) ) {
			return wp_check_invalid_utf8( $value, true );
		}
		return $value;
	}

	/**
	 * Clean every value of a DB row (column names untouched, values stay strings/null).
	 *
	 * @param array $row Row from $wpdb (ARRAY_A).
	 * @return array
	 */
	public static function clean_row( $row ) {
		$out = array();
		foreach ( (array) $row as $key => $value ) {
			$out[ $key ] = self::clean( $value );
		}
		return $out;
	}

	/**
	 * Safe unserialize: never instantiates classes. Returns array( ok, value ).
	 *
	 * @param string $value Possibly serialized string.
	 * @return array
	 */
	public static function safe_unserialize( $value ) {
		if ( ! is_string( $value ) || ! is_serialized( $value ) ) {
			return array( false, $value );
		}
		if ( 'b:0;' === trim( $value ) ) {
			return array( true, false );
		}
		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.serialize_unserialize, WordPress.PHP.NoSilencedErrors.Discouraged
		$result = @unserialize( trim( $value ), array( 'allowed_classes' => false ) );
		if ( false === $result ) {
			return array( false, $value );
		}
		return array( true, self::strip_objects( $result ) );
	}

	/**
	 * Replace __PHP_Incomplete_Class (and any object) by a plain array, recursively.
	 *
	 * @param mixed $value Unserialized value.
	 * @param int   $depth Recursion guard.
	 * @return mixed
	 */
	private static function strip_objects( $value, $depth = 0 ) {
		if ( $depth > 32 ) {
			return null;
		}
		if ( is_object( $value ) ) {
			$value = (array) $value;
		}
		if ( is_array( $value ) ) {
			$out = array();
			foreach ( $value as $k => $v ) {
				// Private/protected property names carry NUL bytes after an (array) cast.
				$key         = is_string( $k ) ? str_replace( "\0", '', $k ) : $k;
				$out[ $key ] = self::strip_objects( $v, $depth + 1 );
			}
			return $out;
		}
		return self::clean( $value );
	}

	/**
	 * Encode a meta value for the envelope: plain string, or "json:<json>" when it was serialized PHP.
	 *
	 * @param string|null $raw Raw meta_value.
	 * @return string
	 */
	public static function encode_meta_value( $raw ) {
		if ( null === $raw ) {
			return '';
		}
		$raw = (string) $raw;
		list( $ok, $value ) = self::safe_unserialize( $raw );
		if ( $ok ) {
			$json = wp_json_encode( $value, self::json_flags() );
			if ( false !== $json ) {
				return 'json:' . $json;
			}
		}
		return (string) self::clean( $raw );
	}

	/**
	 * Group meta rows (object_id, meta_key, meta_value) into id => meta map; repeated keys become string[].
	 *
	 * @param array    $rows   Rows with keys id, meta_key, meta_value.
	 * @param callable $filter Optional fn( $key ) : bool — true to keep.
	 * @return array
	 */
	public static function group_meta( $rows, $filter = null ) {
		$out = array();
		foreach ( $rows as $row ) {
			$id  = (string) $row['oid'];
			$key = (string) $row['meta_key'];
			if ( null !== $filter && ! call_user_func( $filter, $key ) ) {
				continue;
			}
			$val = self::encode_meta_value( $row['meta_value'] );
			$key = (string) self::clean( $key );
			if ( ! isset( $out[ $id ] ) ) {
				$out[ $id ] = array();
			}
			if ( ! array_key_exists( $key, $out[ $id ] ) ) {
				$out[ $id ][ $key ] = $val;
			} elseif ( is_array( $out[ $id ][ $key ] ) ) {
				$out[ $id ][ $key ][] = $val;
			} else {
				$out[ $id ][ $key ] = array( $out[ $id ][ $key ], $val );
			}
		}
		return $out;
	}

	/**
	 * Placeholder list for IN (...) with $wpdb->prepare.
	 *
	 * @param array  $values Values.
	 * @param string $type   %d or %s.
	 * @return string
	 */
	public static function placeholders( $values, $type = '%d' ) {
		return implode( ',', array_fill( 0, max( 1, count( $values ) ), $type ) );
	}

	/**
	 * Whether a table exists (cached per request).
	 *
	 * @param string $table Full table name with prefix.
	 * @return bool
	 */
	public static function table_exists( $table ) {
		static $cache = array();
		if ( isset( $cache[ $table ] ) ) {
			return $cache[ $table ];
		}
		global $wpdb;
		$found           = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $table ) ) );
		$cache[ $table ] = ( $found === $table );
		return $cache[ $table ];
	}

	/**
	 * Whether a host may be reached over plain http (dev only) — FORMAT §5.
	 *
	 * @param string $host Host name.
	 * @return bool
	 */
	public static function is_local_host( $host ) {
		$host = strtolower( (string) $host );
		if ( 'localhost' === $host || '127.0.0.1' === $host || '[::1]' === $host || '::1' === $host ) {
			return true;
		}
		$suffix = '.localhost';
		return strlen( $host ) > strlen( $suffix ) && substr( $host, -strlen( $suffix ) ) === $suffix;
	}

	/**
	 * Unix timestamp (string/int) to "Y-m-d H:i:s" in UTC, or null.
	 *
	 * @param mixed $ts Timestamp.
	 * @return string|null
	 */
	public static function ts_to_gmt( $ts ) {
		if ( null === $ts || '' === $ts || ! is_numeric( $ts ) ) {
			return null;
		}
		return gmdate( 'Y-m-d H:i:s', (int) $ts );
	}
}
