<?php
/**
 * HMAC signing exactly as FORMAT.md §1 (bundle) and §5 (push requests).
 *
 * @package EdvoraMigrator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Signer.
 */
class Edvora_Migrator_Signer {

	/**
	 * FORMAT §5 test vector — identical to packages/integrations/src/wordpress/fixtures/signature-vector.json
	 * (requests[0]); the other vectors from that file are checked in self_test().
	 */
	const VECTOR_SECRET    = 'edvora-test-secret';
	const VECTOR_METHOD    = 'POST';
	const VECTOR_PATH      = '/api/import/push/records?kind=wp.user&seq=1';
	const VECTOR_TIMESTAMP = '1762423200';
	const VECTOR_NONCE     = '00112233445566778899aabbccddeeff';
	const VECTOR_BODY      = "{\"a\":1}\n";
	const VECTOR_EXPECTED  = '8655c65e291469d1e2898516e8f721ac08c3d20e8aa8b7133f208dbfaeb8938b';

	/**
	 * Canonical string for a push request.
	 *
	 * @param string $method          HTTP method.
	 * @param string $path_with_query Path and query exactly as sent.
	 * @param string $timestamp       Unix seconds.
	 * @param string $nonce           32 hex chars.
	 * @param string $body            Raw body ('' when none).
	 * @return string
	 */
	public static function canonical( $method, $path_with_query, $timestamp, $nonce, $body ) {
		return strtoupper( $method ) . "\n" . $path_with_query . "\n" . $timestamp . "\n" . $nonce . "\n" . hash( 'sha256', (string) $body );
	}

	/**
	 * Request signature (hex).
	 *
	 * @param string $secret          Secret as raw UTF-8 bytes.
	 * @param string $method          HTTP method.
	 * @param string $path_with_query Path and query.
	 * @param string $timestamp       Unix seconds.
	 * @param string $nonce           Nonce.
	 * @param string $body            Body.
	 * @return string
	 */
	public static function sign_request( $secret, $method, $path_with_query, $timestamp, $nonce, $body ) {
		return hash_hmac( 'sha256', self::canonical( $method, $path_with_query, $timestamp, $nonce, $body ), (string) $secret );
	}

	/**
	 * Headers for a signed push request.
	 *
	 * @param string $connection      Connection id.
	 * @param string $secret          Secret.
	 * @param string $method          Method.
	 * @param string $path_with_query Path and query.
	 * @param string $body            Body.
	 * @return array
	 */
	public static function headers( $connection, $secret, $method, $path_with_query, $body ) {
		$timestamp = (string) time();
		$nonce     = bin2hex( random_bytes( 16 ) );
		return array(
			'X-Edvora-Connection' => $connection,
			'X-Edvora-Timestamp'  => $timestamp,
			'X-Edvora-Nonce'      => $nonce,
			'X-Edvora-Signature'  => self::sign_request( $secret, $method, $path_with_query, $timestamp, $nonce, $body ),
		);
	}

	/**
	 * Incremental HMAC over bundle lines 1..n-1 (FORMAT §1).
	 *
	 * @param string $secret Secret.
	 * @return resource|HashContext
	 */
	public static function bundle_context( $secret ) {
		return hash_init( 'sha256', HASH_HMAC, (string) $secret );
	}

	/**
	 * Self-test against the shared vectors (fixtures/signature-vector.json): two requests and one bundle.
	 *
	 * @return array{ok:bool,actual:string,expected:string}
	 */
	public static function self_test() {
		$actual = self::sign_request( self::VECTOR_SECRET, self::VECTOR_METHOD, self::VECTOR_PATH, self::VECTOR_TIMESTAMP, self::VECTOR_NONCE, self::VECTOR_BODY );
		$ping   = self::sign_request( self::VECTOR_SECRET, 'GET', '/api/import/push/ping', '1762423200', 'ffeeddccbbaa99887766554433221100', '' );
		$signed = "{\"type\":\"manifest\",\"format\":\"edvora-wp-export\",\"formatVersion\":1}\n"
			. "{\"type\":\"record\",\"v\":1,\"kind\":\"wp.user\",\"wpId\":\"1\",\"data\":{\"ID\":\"1\",\"display_name\":\"\u{0633}\u{0627}\u{0631}\u{0627}\"}}\n";
		$ctx    = self::bundle_context( self::VECTOR_SECRET );
		hash_update( $ctx, $signed );
		$bundle = hash_final( $ctx );
		return array(
			'ok'       => hash_equals( self::VECTOR_EXPECTED, $actual )
				&& hash_equals( 'd56b50a393f133b9ccd8fbbb7e0660ec2f2fc940000757d3b9990dd55dc569c4', $ping )
				&& hash_equals( '50e034ee526e9b5c93b6355a3335241db58ad59320b34667e65894f12535edf5', $bundle ),
			'actual'   => $actual . ' / ' . $ping . ' / ' . $bundle,
			'expected' => self::VECTOR_EXPECTED . ' / d56b50a3… / 50e034ee…',
		);
	}
}
