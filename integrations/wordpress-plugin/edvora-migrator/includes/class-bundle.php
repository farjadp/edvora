<?php
/**
 * Bundle file (FORMAT §1): gzip of NDJSON — manifest line, record lines, signature line.
 *
 * Records are appended batch by batch to an uncompressed temp file in a private folder
 * (wp-content/uploads/edvora-migrator-<random>/, .htaccess deny + index.php). The final step writes
 * manifest + records + signature through one deflate stream (single gzip member) and deletes the temp file.
 * Leftovers are removed by a daily cron after 24 h and on deactivation.
 *
 * @package EdvoraMigrator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Bundle writer + export walker shared by download, push and WP-CLI.
 */
class Edvora_Migrator_Bundle {

	const CRON_HOOK = 'edvora_migrator_cleanup';
	const MAX_AGE   = DAY_IN_SECONDS;

	/**
	 * Hooks.
	 */
	public static function init() {
		add_action( self::CRON_HOOK, array( __CLASS__, 'cleanup' ) );
	}

	/**
	 * Activation: schedule cleanup.
	 */
	public static function activate() {
		if ( ! wp_next_scheduled( self::CRON_HOOK ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', self::CRON_HOOK );
		}
	}

	/**
	 * Deactivation: unschedule, wipe temp folder and in-progress state.
	 */
	public static function deactivate() {
		wp_clear_scheduled_hook( self::CRON_HOOK );
		self::delete_dir();
		delete_option( Edvora_Migrator_Settings::OPT_STATE );
	}

	/**
	 * Path of the private temp folder; created on demand. '' on failure.
	 *
	 * @param bool $create Create when missing.
	 * @return string
	 */
	public static function dir( $create = true ) {
		$uploads = wp_upload_dir( null, false );
		if ( empty( $uploads['basedir'] ) ) {
			return '';
		}
		$name = (string) get_option( Edvora_Migrator_Settings::OPT_TMPDIR, '' );
		if ( '' === $name || ! preg_match( '/^edvora-migrator-[a-f0-9]{24}$/', $name ) ) {
			if ( ! $create ) {
				return '';
			}
			$name = 'edvora-migrator-' . bin2hex( random_bytes( 12 ) );
			Edvora_Migrator_Settings::put( Edvora_Migrator_Settings::OPT_TMPDIR, $name );
		}
		$dir = trailingslashit( $uploads['basedir'] ) . $name;
		if ( ! is_dir( $dir ) ) {
			if ( ! $create || ! wp_mkdir_p( $dir ) ) {
				return '';
			}
		}
		// phpcs:disable WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		if ( ! file_exists( $dir . '/.htaccess' ) ) {
			file_put_contents( $dir . '/.htaccess', "Require all denied\nDeny from all\n" );
		}
		if ( ! file_exists( $dir . '/index.php' ) ) {
			file_put_contents( $dir . '/index.php', "<?php\n// Silence is golden.\n" );
		}
		// phpcs:enable
		return $dir;
	}

	/**
	 * Delete the temp folder entirely.
	 */
	public static function delete_dir() {
		$dir = self::dir( false );
		if ( '' === $dir || ! is_dir( $dir ) ) {
			return;
		}
		foreach ( (array) scandir( $dir ) as $name ) {
			$file = $dir . '/' . $name;
			if ( '.' !== $name && '..' !== $name && is_file( $file ) ) {
				// phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink
				@unlink( $file );
			}
		}
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_rmdir
		@rmdir( $dir );
	}

	/**
	 * Cron: remove bundle temp files older than 24 h (and the state that points at them).
	 */
	public static function cleanup() {
		$dir = self::dir( false );
		if ( '' === $dir || ! is_dir( $dir ) ) {
			return;
		}
		$now = time();
		foreach ( (array) glob( $dir . '/*.ndjson' ) as $file ) {
			if ( is_file( $file ) && ( $now - (int) filemtime( $file ) ) > self::MAX_AGE ) {
				wp_delete_file( $file );
			}
		}
		$state = get_option( Edvora_Migrator_Settings::OPT_STATE, array() );
		if ( is_array( $state ) && ! empty( $state['started'] ) && ( $now - (int) $state['started'] ) > self::MAX_AGE && ( empty( $state['file'] ) || ! file_exists( $state['file'] ) ) ) {
			delete_option( Edvora_Migrator_Settings::OPT_STATE );
		}
	}

	/**
	 * Fresh walker state.
	 *
	 * @param Edvora_Migrator_Exporter $exporter Exporter.
	 * @param string                   $mode     push|bundle.
	 * @return array
	 */
	public static function new_state( $exporter, $mode ) {
		return array(
			'mode'    => $mode,
			'kinds'   => $exporter->kinds(),
			'ki'      => 0,
			'cursor'  => '0',
			'seq'     => array(),
			'counts'  => array(),
			'limit'   => 0,
			'done'    => false,
			'file'    => '',
			'started' => time(),
			'total'   => 0,
			'sent'    => 0,
		);
	}

	/**
	 * Next non-empty page without changing $state. Returns null when everything was walked.
	 *
	 * @param Edvora_Migrator_Exporter $exporter Exporter.
	 * @param array                    $state    State.
	 * @param int                      $limit    Page size override (0 = default).
	 * @return array|null array( kind, records, new_state )
	 */
	public static function peek( $exporter, $state, $limit = 0 ) {
		$kinds = $state['kinds'];
		while ( $state['ki'] < count( $kinds ) ) {
			$kind = $kinds[ $state['ki'] ];
			$page = $exporter->fetch( $kind, $state['cursor'], $limit );
			if ( null === $page['next'] ) {
				$state['ki']++;
				$state['cursor'] = '0';
			} else {
				$state['cursor'] = $page['next'];
			}
			if ( ! empty( $page['records'] ) ) {
				return array( $kind, $page['records'], $state );
			}
		}
		$state['done'] = true;
		return array( null, array(), $state );
	}

	/**
	 * Encode records as NDJSON.
	 *
	 * @param array $records Records.
	 * @return string
	 */
	public static function ndjson( $records ) {
		$out = '';
		foreach ( $records as $record ) {
			$out .= Edvora_Migrator_Util::json_line( $record );
		}
		return $out;
	}

	/**
	 * Start a bundle build: create an empty temp records file and the state.
	 *
	 * @param Edvora_Migrator_Exporter $exporter Exporter.
	 * @return array|WP_Error State.
	 */
	public static function start( $exporter ) {
		$dir = self::dir();
		if ( '' === $dir ) {
			return new WP_Error( 'edvora_tmp', __( 'Could not create the temporary folder.', 'edvora-migrator' ) );
		}
		$state         = self::new_state( $exporter, 'bundle' );
		$state['file'] = $dir . '/records-' . bin2hex( random_bytes( 12 ) ) . '.ndjson';
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		if ( false === file_put_contents( $state['file'], '' ) ) {
			return new WP_Error( 'edvora_tmp', __( 'Could not write the temporary file.', 'edvora-migrator' ) );
		}
		return $state;
	}

	/**
	 * Append pages until $budget seconds are used. Returns the new state.
	 *
	 * @param Edvora_Migrator_Exporter $exporter Exporter.
	 * @param array                    $state    State.
	 * @param float                    $budget   Seconds.
	 * @return array|WP_Error
	 */
	public static function step( $exporter, $state, $budget ) {
		$start = microtime( true );
		do {
			list( $kind, $records, $next ) = self::peek( $exporter, $state );
			if ( null !== $kind ) {
				// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
				if ( false === file_put_contents( $state['file'], self::ndjson( $records ), FILE_APPEND ) ) {
					return new WP_Error( 'edvora_tmp', __( 'Could not write the temporary file.', 'edvora-migrator' ) );
				}
				$next['counts'][ $kind ] = ( isset( $next['counts'][ $kind ] ) ? $next['counts'][ $kind ] : 0 ) + count( $records );
				$next['sent']           += count( $records );
			}
			$state = $next;
		} while ( ! $state['done'] && ( microtime( true ) - $start ) < $budget );
		return $state;
	}

	/**
	 * Write the final gzip bundle (manifest, records file, signature) to a stream.
	 *
	 * @param resource $out      Writable stream (php://output or a file).
	 * @param string   $records  Path of the uncompressed records file.
	 * @param array    $manifest Manifest array (with type=manifest).
	 * @param string   $secret   HMAC secret.
	 * @return true|WP_Error
	 */
	public static function write_gzip( $out, $records, $manifest, $secret ) {
		if ( ! function_exists( 'deflate_init' ) ) {
			return new WP_Error( 'edvora_zlib', 'zlib (deflate_init) is not available on this server.' );
		}
		$z    = deflate_init( ZLIB_ENCODING_GZIP, array( 'level' => 6 ) );
		$hmac = Edvora_Migrator_Signer::bundle_context( $secret );
		$line = Edvora_Migrator_Util::json_line( $manifest );
		hash_update( $hmac, $line );
		fwrite( $out, deflate_add( $z, $line, ZLIB_NO_FLUSH ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$in = fopen( $records, 'rb' );
		if ( false === $in ) {
			return new WP_Error( 'edvora_tmp', __( 'No bundle is ready. Build it first.', 'edvora-migrator' ) );
		}
		while ( ! feof( $in ) ) {
			$chunk = fread( $in, 1048576 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
			if ( false === $chunk || '' === $chunk ) {
				break;
			}
			hash_update( $hmac, $chunk );
			fwrite( $out, deflate_add( $z, $chunk, ZLIB_NO_FLUSH ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite
		}
		fclose( $in ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose

		$signature = Edvora_Migrator_Util::json_line(
			array(
				'type'  => 'signature',
				'alg'   => 'HMAC-SHA256',
				'value' => hash_final( $hmac ),
			)
		);
		fwrite( $out, deflate_add( $z, $signature, ZLIB_FINISH ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite
		return true;
	}

	/**
	 * Download file name: <host>-<yyyymmdd-hhmm>.edvora-bundle.
	 *
	 * @return string
	 */
	public static function filename() {
		$host = wp_parse_url( home_url(), PHP_URL_HOST );
		$host = sanitize_file_name( $host ? $host : 'site' );
		return $host . '-' . gmdate( 'Ymd-Hi' ) . '.edvora-bundle';
	}
}
