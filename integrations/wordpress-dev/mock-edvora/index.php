<?php
/**
 * Minimal mock of Edvora's push endpoints (FORMAT §2/§5) for local plugin testing only.
 * Run: php -S 0.0.0.0:8080 index.php   (compose profile "mock", host name edvora.localhost)
 * Verifies the HMAC signature, timestamp window and nonce replay; stores chunks under /tmp/edvora-mock.
 */

$secret = getenv( 'MOCK_SECRET' ) ?: 'edvora-fixture-secret';
$conn   = getenv( 'MOCK_CONNECTION' ) ?: 'cnx_fixture';
$store  = '/tmp/edvora-mock';
@mkdir( $store, 0777, true );

function reply( $code, $body ) {
	http_response_code( $code );
	header( 'Content-Type: application/json' );
	echo json_encode( $body );
	error_log( sprintf( '%s %s -> %d %s', $_SERVER['REQUEST_METHOD'], $_SERVER['REQUEST_URI'], $code, json_encode( $body ) ) );
	exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$uri    = $_SERVER['REQUEST_URI'];
$body   = file_get_contents( 'php://input' );
$h      = function ( $name ) {
	$key = 'HTTP_' . strtoupper( str_replace( '-', '_', $name ) );
	return isset( $_SERVER[ $key ] ) ? $_SERVER[ $key ] : '';
};

if ( $h( 'X-Edvora-Connection' ) !== $conn ) {
	reply( 401, array( 'ok' => false, 'code' => 'connection', 'message' => 'unknown connection' ) );
}
$ts = (int) $h( 'X-Edvora-Timestamp' );
if ( abs( time() - $ts ) > 300 ) {
	reply( 401, array( 'ok' => false, 'code' => 'clock', 'message' => 'timestamp outside window' ) );
}
$nonce = $h( 'X-Edvora-Nonce' );
if ( ! preg_match( '/^[a-f0-9]{32}$/', $nonce ) || file_exists( "$store/nonce-$nonce" ) ) {
	reply( 401, array( 'ok' => false, 'code' => 'nonce', 'message' => 'bad or replayed nonce' ) );
}
touch( "$store/nonce-$nonce" );
$canonical = $method . "\n" . $uri . "\n" . $h( 'X-Edvora-Timestamp' ) . "\n" . $nonce . "\n" . hash( 'sha256', $body );
if ( ! hash_equals( hash_hmac( 'sha256', $canonical, $secret ), $h( 'X-Edvora-Signature' ) ) ) {
	reply( 401, array( 'ok' => false, 'code' => 'signature', 'message' => 'bad signature' ) );
}

$path = parse_url( $uri, PHP_URL_PATH );
parse_str( (string) parse_url( $uri, PHP_URL_QUERY ), $q );

switch ( $method . ' ' . $path ) {
	case 'GET /api/import/push/ping':
		reply( 200, array( 'ok' => true, 'tenant' => 'demo', 'job' => 'job_fixture', 'status' => file_exists( "$store/manifest.json" ) ? 'ingesting' : 'waiting' ) );
	case 'POST /api/import/push/manifest':
		$m = json_decode( $body, true );
		if ( ! is_array( $m ) || ( $m['format'] ?? '' ) !== 'edvora-wp-export' ) {
			reply( 422, array( 'ok' => false, 'code' => 'manifest', 'message' => 'invalid manifest' ) );
		}
		array_map( 'unlink', glob( "$store/*.ndjson" ) );
		file_put_contents( "$store/manifest.json", $body );
		reply( 200, array( 'ok' => true ) );
	case 'POST /api/import/push/records':
		$kind = preg_replace( '/[^a-z_.]/', '', (string) ( $q['kind'] ?? '' ) );
		$seq  = (int) ( $q['seq'] ?? 0 );
		if ( strlen( $body ) > 8 * 1024 * 1024 ) {
			reply( 413, array( 'ok' => false, 'code' => 'too_large', 'message' => 'chunk too large' ) );
		}
		$lines = array_filter( explode( "\n", $body ), 'strlen' );
		if ( count( $lines ) > 500 ) {
			reply( 422, array( 'ok' => false, 'code' => 'too_many', 'message' => 'more than 500 records' ) );
		}
		foreach ( $lines as $line ) {
			$r = json_decode( $line, true );
			if ( ! is_array( $r ) || ( $r['kind'] ?? '' ) !== $kind || ( $r['v'] ?? 0 ) !== 1 ) {
				reply( 422, array( 'ok' => false, 'code' => 'envelope', 'message' => 'invalid record envelope' ) );
			}
		}
		file_put_contents( "$store/$kind.$seq.ndjson", $body );
		reply( 200, array( 'ok' => true, 'stored' => count( $lines ) ) );
	case 'POST /api/import/push/finish':
		$f      = json_decode( $body, true );
		$actual = array();
		foreach ( glob( "$store/*.ndjson" ) as $file ) {
			$kind            = preg_replace( '/\.\d+\.ndjson$/', '', basename( $file ) );
			$actual[ $kind ] = ( $actual[ $kind ] ?? 0 ) + count( array_filter( explode( "\n", file_get_contents( $file ) ), 'strlen' ) );
		}
		ksort( $actual );
		$expected = (array) ( $f['counts'] ?? array() );
		ksort( $expected );
		if ( $actual !== $expected ) {
			reply( 409, array( 'ok' => false, 'code' => 'counts', 'message' => 'counts mismatch', 'actual' => $actual ) );
		}
		reply( 200, array( 'ok' => true, 'status' => 'ready', 'counts' => $actual ) );
}
reply( 404, array( 'ok' => false, 'code' => 'not_found', 'message' => 'no route' ) );
