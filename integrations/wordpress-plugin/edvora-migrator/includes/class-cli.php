<?php
/**
 * WP-CLI commands (loaded only when WP_CLI is defined).
 *
 * @package EdvoraMigrator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Export WordPress data for Edvora.
 */
class Edvora_Migrator_CLI {

	/**
	 * Write a signed bundle file (FORMAT §1).
	 *
	 * ## OPTIONS
	 *
	 * --secret=<secret>
	 * : HMAC secret (as shown in Edvora).
	 *
	 * --connection=<id>
	 * : Connection id.
	 *
	 * --tenant=<slug>
	 * : Edvora tenant slug.
	 *
	 * --out=<path>
	 * : Output file (.edvora-bundle).
	 *
	 * [--created-at=<iso>]
	 * : Override manifest createdAtGmt (for reproducible fixtures), e.g. 2026-11-06T10:00:00Z.
	 *
	 * ## EXAMPLES
	 *
	 *     wp edvora-migrator export --secret=… --connection=cnx_1 --tenant=iba --out=/tmp/site.edvora-bundle
	 *
	 * @param array $args       Positional.
	 * @param array $assoc_args Named.
	 */
	public function export( $args, $assoc_args ) {
		foreach ( array( 'secret', 'connection', 'tenant', 'out' ) as $required ) {
			if ( empty( $assoc_args[ $required ] ) ) {
				WP_CLI::error( "--{$required} is required." );
			}
		}
		$exporter = new Edvora_Migrator_Exporter();
		$state    = Edvora_Migrator_Bundle::start( $exporter );
		if ( is_wp_error( $state ) ) {
			WP_CLI::error( $state->get_error_message() );
		}
		while ( empty( $state['done'] ) ) {
			$state = Edvora_Migrator_Bundle::step( $exporter, $state, 30.0 );
			if ( is_wp_error( $state ) ) {
				WP_CLI::error( $state->get_error_message() );
			}
		}
		$manifest = $exporter->manifest( $assoc_args['connection'], $assoc_args['tenant'], $state['counts'] );
		if ( ! empty( $assoc_args['created-at'] ) ) {
			$manifest['createdAtGmt'] = (string) $assoc_args['created-at'];
		}
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$out = fopen( $assoc_args['out'], 'wb' );
		if ( false === $out ) {
			wp_delete_file( $state['file'] );
			WP_CLI::error( 'Cannot write ' . $assoc_args['out'] );
		}
		$result = Edvora_Migrator_Bundle::write_gzip( $out, $state['file'], $manifest, $assoc_args['secret'] );
		fclose( $out ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		wp_delete_file( $state['file'] );
		if ( is_wp_error( $result ) ) {
			WP_CLI::error( $result->get_error_message() );
		}
		foreach ( $state['counts'] as $kind => $count ) {
			WP_CLI::log( sprintf( '%-24s %d', $kind, $count ) );
		}
		WP_CLI::success( 'Wrote ' . $assoc_args['out'] );
	}

	/**
	 * Print detected stacks and record counts.
	 *
	 * @param array $args       Positional.
	 * @param array $assoc_args Named.
	 */
	public function preflight( $args, $assoc_args ) {
		$exporter = new Edvora_Migrator_Exporter();
		$manifest = $exporter->manifest( '', '', $exporter->counts() );
		WP_CLI::log( (string) wp_json_encode( $manifest, JSON_PRETTY_PRINT | Edvora_Migrator_Util::json_flags() ) );
	}

	/**
	 * Check the HMAC implementation against the FORMAT §5 test vector.
	 *
	 * @param array $args       Positional.
	 * @param array $assoc_args Named.
	 */
	public function selftest( $args, $assoc_args ) {
		$r = Edvora_Migrator_Signer::self_test();
		WP_CLI::log( 'expected ' . $r['expected'] );
		WP_CLI::log( 'actual   ' . $r['actual'] );
		if ( ! $r['ok'] ) {
			WP_CLI::error( 'Signature self-test FAILED.' );
		}
		WP_CLI::success( 'Signature self-test passed.' );
	}
}
