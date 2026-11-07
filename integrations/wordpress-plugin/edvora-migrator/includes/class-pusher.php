<?php
/**
 * Push mode (FORMAT §2): signed requests to the configured Edvora URL — the only outbound HTTP this plugin makes.
 *
 * @package EdvoraMigrator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Pusher.
 */
class Edvora_Migrator_Pusher {

	const MAX_RECORDS = 500;
	const MAX_BYTES   = 7340032; // 7 MB, under the server's 8 MB limit.
	const TIMEOUT     = 20;

	/**
	 * Base URL (validated), connection id, secret.
	 *
	 * @var string
	 */
	private $base;

	/**
	 * Connection id.
	 *
	 * @var string
	 */
	private $connection;

	/**
	 * Secret.
	 *
	 * @var string
	 */
	private $secret;

	/**
	 * Constructor.
	 *
	 * @param string $url        Edvora URL.
	 * @param string $connection Connection id.
	 * @param string $secret     Secret.
	 */
	public function __construct( $url, $connection, $secret ) {
		$this->base       = Edvora_Migrator_Settings::sanitize_url( $url );
		$this->connection = (string) $connection;
		$this->secret     = (string) $secret;
	}

	/**
	 * Build from saved settings.
	 *
	 * @return Edvora_Migrator_Pusher|WP_Error
	 */
	public static function from_settings() {
		$s      = Edvora_Migrator_Settings::get();
		$secret = Edvora_Migrator_Settings::secret();
		if ( '' === $s['url'] || '' === $s['connection'] || '' === $secret ) {
			return new WP_Error( 'edvora_settings', __( 'Fill in the Edvora URL, connection ID and secret first.', 'edvora-migrator' ) );
		}
		$pusher = new self( $s['url'], $s['connection'], $secret );
		if ( '' === $pusher->base ) {
			return new WP_Error( 'edvora_url', __( 'Edvora URL must use https (http is allowed only for localhost).', 'edvora-migrator' ) );
		}
		return $pusher;
	}

	/**
	 * Signed request. Returns decoded JSON body or WP_Error.
	 *
	 * @param string $method       GET|POST.
	 * @param string $endpoint     e.g. ping, manifest, records?kind=…&seq=…, finish.
	 * @param string $body         Raw body.
	 * @param string $content_type Content type.
	 * @return array|WP_Error
	 */
	public function request( $method, $endpoint, $body = '', $content_type = 'application/json' ) {
		if ( '' === $this->base ) {
			return new WP_Error( 'edvora_url', __( 'Edvora URL must use https (http is allowed only for localhost).', 'edvora-migrator' ) );
		}
		$url      = $this->base . '/api/import/push/' . $endpoint;
		$path     = (string) wp_parse_url( $url, PHP_URL_PATH );
		$query    = wp_parse_url( $url, PHP_URL_QUERY );
		$path_q   = $path . ( $query ? '?' . $query : '' );
		$headers  = Edvora_Migrator_Signer::headers( $this->connection, $this->secret, $method, $path_q, $body );
		$headers['Accept'] = 'application/json';
		if ( '' !== $body ) {
			$headers['Content-Type'] = $content_type;
		}
		$response = wp_remote_request(
			$url,
			array(
				'method'      => $method,
				'headers'     => $headers,
				'body'        => '' === $body ? null : $body,
				'timeout'     => self::TIMEOUT,
				'redirection' => 0,
				'sslverify'   => true,
				'user-agent'  => 'EdvoraMigrator/' . EDVORA_MIGRATOR_VERSION . '; ' . home_url(),
			)
		);
		if ( is_wp_error( $response ) ) {
			/* translators: %s: error message */
			return new WP_Error( 'edvora_http', sprintf( __( 'Edvora did not answer: %s', 'edvora-migrator' ), $response->get_error_message() ) );
		}
		$code    = (int) wp_remote_retrieve_response_code( $response );
		$decoded = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 ) {
			$message = is_array( $decoded ) && isset( $decoded['message'] ) ? (string) $decoded['message'] : (string) wp_remote_retrieve_response_message( $response );
			/* translators: 1: HTTP status, 2: message */
			return new WP_Error( 'edvora_http_' . $code, sprintf( __( 'Edvora answered with HTTP %1$d: %2$s', 'edvora-migrator' ), $code, $message ), array( 'status' => $code, 'body' => $decoded ) );
		}
		if ( ! is_array( $decoded ) || empty( $decoded['ok'] ) ) {
			return new WP_Error( 'edvora_body', __( 'Unexpected answer from Edvora.', 'edvora-migrator' ) );
		}
		return $decoded;
	}

	/**
	 * GET ping.
	 *
	 * @return array|WP_Error
	 */
	public function ping() {
		return $this->request( 'GET', 'ping' );
	}

	/**
	 * POST manifest.
	 *
	 * @param array $manifest Manifest.
	 * @return array|WP_Error
	 */
	public function manifest( $manifest ) {
		unset( $manifest['type'] );
		return $this->request( 'POST', 'manifest', wp_json_encode( $manifest, Edvora_Migrator_Util::json_flags() ) );
	}

	/**
	 * POST one chunk of records of one kind.
	 *
	 * @param string $kind    Kind.
	 * @param int    $seq     Chunk sequence (1-based per kind).
	 * @param string $ndjson  Body.
	 * @return array|WP_Error
	 */
	public function records( $kind, $seq, $ndjson ) {
		$endpoint = 'records?kind=' . rawurlencode( $kind ) . '&seq=' . (int) $seq;
		return $this->request( 'POST', $endpoint, $ndjson, 'application/x-ndjson' );
	}

	/**
	 * POST finish.
	 *
	 * @param array $chunks kind => chunk count.
	 * @param array $counts kind => record count.
	 * @return array|WP_Error
	 */
	public function finish( $chunks, $counts ) {
		$body = array(
			'chunks' => empty( $chunks ) ? new stdClass() : $chunks,
			'counts' => empty( $counts ) ? new stdClass() : $counts,
		);
		return $this->request( 'POST', 'finish', wp_json_encode( $body, Edvora_Migrator_Util::json_flags() ) );
	}

	/**
	 * Send the next chunk and return the advanced state. On error the state is unchanged (retry resends the same seq).
	 *
	 * @param Edvora_Migrator_Exporter $exporter Exporter.
	 * @param array                    $state    State.
	 * @return array|WP_Error
	 */
	public function step( $exporter, $state ) {
		$limit = ! empty( $state['limit'] ) ? (int) $state['limit'] : 0;
		list( $kind, $records, $next ) = Edvora_Migrator_Bundle::peek( $exporter, $state, $limit );
		if ( null === $kind ) {
			$result = $this->finish( $state['seq'], $state['counts'] );
			if ( is_wp_error( $result ) ) {
				return $result;
			}
			$next['finished'] = true;
			$next['status']   = isset( $result['status'] ) ? (string) $result['status'] : '';
			return $next;
		}
		$body = Edvora_Migrator_Bundle::ndjson( $records );
		if ( strlen( $body ) > self::MAX_BYTES && count( $records ) > 1 ) {
			// Too big: retry this position with half the page size.
			$state['limit'] = max( 1, (int) floor( count( $records ) / 2 ) );
			return $state;
		}
		$seq    = ( isset( $state['seq'][ $kind ] ) ? (int) $state['seq'][ $kind ] : 0 ) + 1;
		$result = $this->records( $kind, $seq, $body );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		$next['seq'][ $kind ]    = $seq;
		$next['counts'][ $kind ] = ( isset( $state['counts'][ $kind ] ) ? (int) $state['counts'][ $kind ] : 0 ) + count( $records );
		$next['sent']            = (int) $state['sent'] + count( $records );
		$next['limit']           = 0;
		return $next;
	}
}
