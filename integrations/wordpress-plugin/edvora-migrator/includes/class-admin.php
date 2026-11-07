<?php
/**
 * Admin screen under Tools → «انتقال به ادوورا», settings form and AJAX batch endpoints.
 * Every handler checks manage_options and a nonce.
 *
 * @package EdvoraMigrator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Admin UI.
 */
class Edvora_Migrator_Admin {

	const SLUG   = 'edvora-migrator';
	const NONCE  = 'edvora_migrator';
	const BUDGET = 15.0; // Seconds of work per AJAX request (stays under ~20 s).

	/**
	 * Hooks.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_post_edvora_migrator_save', array( __CLASS__, 'save' ) );
		add_action( 'admin_post_edvora_migrator_download', array( __CLASS__, 'download' ) );
		foreach ( array( 'ping', 'push_start', 'push_step', 'bundle_start', 'bundle_step' ) as $action ) {
			add_action( 'wp_ajax_edvora_migrator_' . $action, array( __CLASS__, 'ajax_' . $action ) );
		}
	}

	/**
	 * Register the Tools submenu.
	 */
	public static function menu() {
		$hook = add_management_page(
			__( 'Migrate to Edvora', 'edvora-migrator' ),
			__( 'Migrate to Edvora', 'edvora-migrator' ),
			'manage_options',
			self::SLUG,
			array( __CLASS__, 'render' )
		);
		add_action( 'admin_print_scripts-' . $hook, array( __CLASS__, 'assets' ) );
	}

	/**
	 * Local JS/CSS only (no CDN).
	 */
	public static function assets() {
		wp_enqueue_style( 'edvora-migrator', plugins_url( 'assets/admin.css', EDVORA_MIGRATOR_FILE ), array(), EDVORA_MIGRATOR_VERSION );
		wp_enqueue_script( 'edvora-migrator', plugins_url( 'assets/admin.js', EDVORA_MIGRATOR_FILE ), array(), EDVORA_MIGRATOR_VERSION, true );
		wp_localize_script(
			'edvora-migrator',
			'EdvoraMigrator',
			array(
				'ajaxUrl'     => admin_url( 'admin-ajax.php' ),
				'nonce'       => wp_create_nonce( self::NONCE ),
				'downloadUrl' => wp_nonce_url( admin_url( 'admin-post.php?action=edvora_migrator_download' ), self::NONCE ),
				'i18n'        => array(
					'preparing' => __( 'Preparing…', 'edvora-migrator' ),
					'sending'   => __( 'Sending…', 'edvora-migrator' ),
					'building'  => __( 'Building bundle…', 'edvora-migrator' ),
					'done'      => __( 'Done. Go back to Edvora to review the import.', 'edvora-migrator' ),
					'ready'     => __( 'Bundle ready. Your download will start now.', 'edvora-migrator' ),
					'failed'    => __( 'Stopped with an error. You can retry; finished parts are not sent again.', 'edvora-migrator' ),
					'connected' => __( 'Connected.', 'edvora-migrator' ),
				),
			)
		);
	}

	/**
	 * Abort unless the current user may manage options.
	 */
	private static function guard() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You are not allowed to do this.', 'edvora-migrator' ), '', array( 'response' => 403 ) );
		}
	}

	/**
	 * AJAX guard: capability + nonce.
	 */
	private static function ajax_guard() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'You are not allowed to do this.', 'edvora-migrator' ) ), 403 );
		}
		if ( false === check_ajax_referer( self::NONCE, 'nonce', false ) ) {
			wp_send_json_error( array( 'message' => __( 'The link has expired. Reload the page and try again.', 'edvora-migrator' ) ), 403 );
		}
		if ( function_exists( 'set_time_limit' ) ) {
			// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			@set_time_limit( 60 );
		}
	}

	/**
	 * Send a WP_Error as JSON.
	 *
	 * @param WP_Error $error Error.
	 */
	private static function json_error( $error ) {
		wp_send_json_error( array( 'message' => $error->get_error_message() ), 200 );
	}

	/**
	 * Save settings (admin-post).
	 */
	public static function save() {
		self::guard();
		check_admin_referer( self::NONCE );
		$current = Edvora_Migrator_Settings::get();
		// phpcs:disable WordPress.Security.NonceVerification.Missing -- verified above.
		$url        = isset( $_POST['edvora_url'] ) ? sanitize_text_field( wp_unslash( $_POST['edvora_url'] ) ) : '';
		$connection = isset( $_POST['edvora_connection'] ) ? sanitize_text_field( wp_unslash( $_POST['edvora_connection'] ) ) : '';
		$tenant     = isset( $_POST['edvora_tenant'] ) ? sanitize_key( wp_unslash( $_POST['edvora_tenant'] ) ) : $current['tenant'];
		$secret     = isset( $_POST['edvora_secret'] ) ? trim( (string) wp_unslash( $_POST['edvora_secret'] ) ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- secret is opaque; only base64url chars kept below.
		// phpcs:enable
		$clean_url = Edvora_Migrator_Settings::sanitize_url( $url );
		$notice    = 'saved';
		if ( '' !== $url && '' === $clean_url ) {
			$notice = 'badurl';
		}
		Edvora_Migrator_Settings::save(
			array(
				'url'        => $clean_url,
				'connection' => preg_replace( '/[^A-Za-z0-9_\-]/', '', $connection ),
				'tenant'     => $tenant,
			)
		);
		if ( '' !== $secret ) {
			Edvora_Migrator_Settings::save_secret( preg_replace( '/[^A-Za-z0-9_\-]/', '', $secret ) );
		}
		wp_safe_redirect( add_query_arg( array( 'page' => self::SLUG, 'edvora_notice' => $notice ), admin_url( 'tools.php' ) ) );
		exit;
	}

	/**
	 * AJAX: ping.
	 */
	public static function ajax_ping() {
		self::ajax_guard();
		$pusher = Edvora_Migrator_Pusher::from_settings();
		if ( is_wp_error( $pusher ) ) {
			self::json_error( $pusher );
		}
		$result = $pusher->ping();
		if ( is_wp_error( $result ) ) {
			self::json_error( $result );
		}
		if ( ! empty( $result['tenant'] ) ) {
			$s           = Edvora_Migrator_Settings::get();
			$s['tenant'] = sanitize_key( $result['tenant'] );
			Edvora_Migrator_Settings::save( $s );
		}
		wp_send_json_success(
			array(
				'tenant' => isset( $result['tenant'] ) ? sanitize_key( $result['tenant'] ) : '',
				'job'    => isset( $result['job'] ) ? sanitize_text_field( (string) $result['job'] ) : '',
				'status' => isset( $result['status'] ) ? sanitize_text_field( (string) $result['status'] ) : '',
			)
		);
	}

	/**
	 * Progress payload for the browser.
	 *
	 * @param array $state State.
	 * @return array
	 */
	private static function progress( $state ) {
		$kind = ( isset( $state['kinds'][ $state['ki'] ] ) ) ? $state['kinds'][ $state['ki'] ] : '';
		return array(
			'done'     => ! empty( $state['done'] ) && ( 'bundle' === $state['mode'] || ! empty( $state['finished'] ) ),
			'sent'     => (int) $state['sent'],
			'total'    => (int) $state['total'],
			'kind'     => $kind,
			'counts'   => $state['counts'],
			'status'   => isset( $state['status'] ) ? $state['status'] : '',
		);
	}

	/**
	 * AJAX: start or resume a push.
	 */
	public static function ajax_push_start() {
		self::ajax_guard();
		$pusher = Edvora_Migrator_Pusher::from_settings();
		if ( is_wp_error( $pusher ) ) {
			self::json_error( $pusher );
		}
		$resume = ! empty( $_POST['resume'] ); // phpcs:ignore WordPress.Security.NonceVerification.Missing -- ajax_guard.
		$state  = get_option( Edvora_Migrator_Settings::OPT_STATE, array() );
		if ( $resume && is_array( $state ) && isset( $state['mode'] ) && 'push' === $state['mode'] && empty( $state['finished'] ) ) {
			wp_send_json_success( self::progress( $state ) );
		}
		$exporter       = new Edvora_Migrator_Exporter();
		$counts         = $exporter->counts();
		$state          = Edvora_Migrator_Bundle::new_state( $exporter, 'push' );
		$state['total'] = array_sum( $counts );
		$settings       = Edvora_Migrator_Settings::get();
		$result         = $pusher->manifest( $exporter->manifest( $settings['connection'], $settings['tenant'], $counts ) );
		if ( is_wp_error( $result ) ) {
			self::json_error( $result );
		}
		Edvora_Migrator_Settings::put( Edvora_Migrator_Settings::OPT_STATE, $state );
		wp_send_json_success( self::progress( $state ) );
	}

	/**
	 * AJAX: send chunks for up to BUDGET seconds.
	 */
	public static function ajax_push_step() {
		self::ajax_guard();
		$pusher = Edvora_Migrator_Pusher::from_settings();
		if ( is_wp_error( $pusher ) ) {
			self::json_error( $pusher );
		}
		$state = get_option( Edvora_Migrator_Settings::OPT_STATE, array() );
		if ( ! is_array( $state ) || ! isset( $state['mode'] ) || 'push' !== $state['mode'] ) {
			self::json_error( new WP_Error( 'edvora_state', __( 'Unexpected answer from Edvora.', 'edvora-migrator' ) ) );
		}
		$exporter = new Edvora_Migrator_Exporter();
		$start    = microtime( true );
		while ( empty( $state['finished'] ) && ( microtime( true ) - $start ) < self::BUDGET ) {
			$next = $pusher->step( $exporter, $state );
			if ( is_wp_error( $next ) ) {
				Edvora_Migrator_Settings::put( Edvora_Migrator_Settings::OPT_STATE, $state );
				self::json_error( $next );
			}
			$state = $next;
			Edvora_Migrator_Settings::put( Edvora_Migrator_Settings::OPT_STATE, $state );
		}
		wp_send_json_success( self::progress( $state ) );
	}

	/**
	 * AJAX: start building a bundle (always fresh).
	 */
	public static function ajax_bundle_start() {
		self::ajax_guard();
		if ( '' === Edvora_Migrator_Settings::secret() ) {
			self::json_error( new WP_Error( 'edvora_settings', __( 'Fill in the Edvora URL, connection ID and secret first.', 'edvora-migrator' ) ) );
		}
		$old = get_option( Edvora_Migrator_Settings::OPT_STATE, array() );
		if ( is_array( $old ) && ! empty( $old['file'] ) && file_exists( $old['file'] ) ) {
			wp_delete_file( $old['file'] );
		}
		$exporter = new Edvora_Migrator_Exporter();
		$state    = Edvora_Migrator_Bundle::start( $exporter );
		if ( is_wp_error( $state ) ) {
			self::json_error( $state );
		}
		$state['total'] = array_sum( $exporter->counts() );
		Edvora_Migrator_Settings::put( Edvora_Migrator_Settings::OPT_STATE, $state );
		wp_send_json_success( self::progress( $state ) );
	}

	/**
	 * AJAX: append records to the bundle for up to BUDGET seconds.
	 */
	public static function ajax_bundle_step() {
		self::ajax_guard();
		$state = get_option( Edvora_Migrator_Settings::OPT_STATE, array() );
		if ( ! is_array( $state ) || ! isset( $state['mode'] ) || 'bundle' !== $state['mode'] || empty( $state['file'] ) ) {
			self::json_error( new WP_Error( 'edvora_state', __( 'No bundle is ready. Build it first.', 'edvora-migrator' ) ) );
		}
		$next = Edvora_Migrator_Bundle::step( new Edvora_Migrator_Exporter(), $state, self::BUDGET );
		if ( is_wp_error( $next ) ) {
			self::json_error( $next );
		}
		Edvora_Migrator_Settings::put( Edvora_Migrator_Settings::OPT_STATE, $next );
		wp_send_json_success( self::progress( $next ) );
	}

	/**
	 * Stream the finished bundle and delete the temp file (admin-post GET with nonce).
	 */
	public static function download() {
		self::guard();
		check_admin_referer( self::NONCE );
		$state = get_option( Edvora_Migrator_Settings::OPT_STATE, array() );
		if ( ! is_array( $state ) || empty( $state['done'] ) || 'bundle' !== $state['mode'] || empty( $state['file'] ) || ! file_exists( $state['file'] ) ) {
			wp_die( esc_html__( 'No bundle is ready. Build it first.', 'edvora-migrator' ) );
		}
		$settings = Edvora_Migrator_Settings::get();
		$exporter = new Edvora_Migrator_Exporter();
		$manifest = $exporter->manifest( $settings['connection'], $settings['tenant'], $state['counts'] );
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		@set_time_limit( 0 );
		while ( ob_get_level() > 0 ) {
			ob_end_clean();
		}
		nocache_headers();
		header( 'Content-Type: application/gzip' );
		header( 'Content-Disposition: attachment; filename="' . Edvora_Migrator_Bundle::filename() . '"' );
		header( 'X-Content-Type-Options: nosniff' );
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$out    = fopen( 'php://output', 'wb' );
		$result = Edvora_Migrator_Bundle::write_gzip( $out, $state['file'], $manifest, Edvora_Migrator_Settings::secret() );
		fclose( $out ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		wp_delete_file( $state['file'] );
		delete_option( Edvora_Migrator_Settings::OPT_STATE );
		if ( is_wp_error( $result ) ) {
			error_log( 'Edvora Migrator: ' . $result->get_error_message() ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
		}
		exit;
	}

	/**
	 * Render the page.
	 */
	public static function render() {
		self::guard();
		$settings   = Edvora_Migrator_Settings::get();
		$has_secret = '' !== Edvora_Migrator_Settings::secret();
		$exporter   = new Edvora_Migrator_Exporter();
		$counts     = $exporter->counts();
		$stacks     = $exporter->stacks();
		$state      = get_option( Edvora_Migrator_Settings::OPT_STATE, array() );
		$resumable  = is_array( $state ) && isset( $state['mode'] ) && 'push' === $state['mode'] && empty( $state['finished'] );
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- display only.
		$notice = isset( $_GET['edvora_notice'] ) ? sanitize_key( wp_unslash( $_GET['edvora_notice'] ) ) : '';
		?>
		<div class="wrap edvora-migrator" dir="<?php echo is_rtl() ? 'rtl' : 'ltr'; ?>">
			<h1><?php esc_html_e( 'Migrate to Edvora', 'edvora-migrator' ); ?></h1>
			<?php if ( 'saved' === $notice ) : ?>
				<div class="notice notice-success"><p><?php esc_html_e( 'Settings saved.', 'edvora-migrator' ); ?></p></div>
			<?php elseif ( 'badurl' === $notice ) : ?>
				<div class="notice notice-error"><p><?php esc_html_e( 'Edvora URL must use https (http is allowed only for localhost).', 'edvora-migrator' ); ?></p></div>
			<?php endif; ?>
			<p><?php esc_html_e( 'This plugin only reads your data. It changes nothing on this site.', 'edvora-migrator' ); ?>
				<?php esc_html_e( 'Passwords, sessions and application passwords are never exported.', 'edvora-migrator' ); ?></p>

			<h2><?php esc_html_e( 'Connection settings', 'edvora-migrator' ); ?></h2>
			<p class="description"><?php esc_html_e( 'Copy the URL, connection ID and secret from Edvora admin → Import from WordPress.', 'edvora-migrator' ); ?></p>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" autocomplete="off">
				<input type="hidden" name="action" value="edvora_migrator_save" />
				<?php wp_nonce_field( self::NONCE ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="edvora_url"><?php esc_html_e( 'Edvora URL', 'edvora-migrator' ); ?></label></th>
						<td><input type="url" class="regular-text code" dir="ltr" id="edvora_url" name="edvora_url" value="<?php echo esc_attr( $settings['url'] ); ?>" placeholder="https://academy.example.ir" /></td>
					</tr>
					<tr>
						<th scope="row"><label for="edvora_connection"><?php esc_html_e( 'Connection ID', 'edvora-migrator' ); ?></label></th>
						<td><input type="text" class="regular-text code" dir="ltr" id="edvora_connection" name="edvora_connection" value="<?php echo esc_attr( $settings['connection'] ); ?>" /></td>
					</tr>
					<tr>
						<th scope="row"><label for="edvora_secret"><?php esc_html_e( 'Secret', 'edvora-migrator' ); ?></label></th>
						<td>
							<input type="password" class="regular-text code" dir="ltr" id="edvora_secret" name="edvora_secret" value="" autocomplete="new-password" placeholder="<?php echo $has_secret ? '••••••••••••••••' : ''; ?>" />
							<?php if ( $has_secret ) : ?>
								<p class="description"><?php esc_html_e( 'A secret is stored. Leave empty to keep it.', 'edvora-migrator' ); ?></p>
							<?php endif; ?>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="edvora_tenant"><?php esc_html_e( 'Tenant', 'edvora-migrator' ); ?></label></th>
						<td><input type="text" class="regular-text code" dir="ltr" id="edvora_tenant" name="edvora_tenant" value="<?php echo esc_attr( $settings['tenant'] ); ?>" />
							<p class="description"><?php esc_html_e( 'Filled automatically after a successful connection test.', 'edvora-migrator' ); ?></p></td>
					</tr>
				</table>
				<?php submit_button( __( 'Save settings', 'edvora-migrator' ), 'secondary' ); ?>
			</form>
			<p>
				<button type="button" class="button" id="edvora-ping"><?php esc_html_e( 'Test connection', 'edvora-migrator' ); ?></button>
				<span id="edvora-ping-result" class="edvora-result" role="status"></span>
			</p>

			<h2><?php esc_html_e( 'Preflight summary', 'edvora-migrator' ); ?></h2>
			<table class="widefat striped edvora-summary">
				<tbody>
					<tr><th><?php esc_html_e( 'WordPress version', 'edvora-migrator' ); ?></th><td dir="ltr"><?php echo esc_html( get_bloginfo( 'version' ) ); ?></td></tr>
					<tr><th><?php esc_html_e( 'PHP version', 'edvora-migrator' ); ?></th><td dir="ltr"><?php echo esc_html( PHP_VERSION ); ?></td></tr>
					<tr><th><?php esc_html_e( 'Detected plugins', 'edvora-migrator' ); ?></th><td dir="ltr"><?php echo esc_html( self::stack_list() ); ?></td></tr>
					<tr><th><?php esc_html_e( 'WooCommerce currency', 'edvora-migrator' ); ?></th><td dir="ltr"><?php echo $stacks['woo'] ? esc_html( (string) get_option( 'woocommerce_currency' ) ) : esc_html__( 'Not active', 'edvora-migrator' ); ?></td></tr>
					<?php if ( $stacks['woo'] ) : ?>
					<tr><th><?php esc_html_e( 'Order storage', 'edvora-migrator' ); ?></th><td><?php echo Edvora_Migrator_Detector::woo_hpos() ? esc_html__( 'HPOS tables', 'edvora-migrator' ) : esc_html__( 'Posts (legacy)', 'edvora-migrator' ); ?></td></tr>
					<?php endif; ?>
					<tr><th><?php esc_html_e( 'LifterLMS currency', 'edvora-migrator' ); ?></th><td dir="ltr"><?php echo $stacks['lifterlms'] ? esc_html( (string) get_option( 'lifterlms_currency', 'USD' ) ) : esc_html__( 'Not active', 'edvora-migrator' ); ?></td></tr>
					<tr><th><?php esc_html_e( 'Tutor LMS currency', 'edvora-migrator' ); ?></th><td dir="ltr"><?php echo esc_html( self::tutor_currency( $stacks['tutor'] ) ); ?></td></tr>
				</tbody>
			</table>
			<h3><?php esc_html_e( 'Records to export', 'edvora-migrator' ); ?></h3>
			<table class="widefat striped edvora-counts">
				<thead><tr><th><?php esc_html_e( 'Kind', 'edvora-migrator' ); ?></th><th><?php esc_html_e( 'Count', 'edvora-migrator' ); ?></th></tr></thead>
				<tbody>
				<?php foreach ( $counts as $kind => $count ) : ?>
					<tr><td dir="ltr"><code><?php echo esc_html( $kind ); ?></code></td><td><?php echo esc_html( number_format_i18n( $count ) ); ?></td></tr>
				<?php endforeach; ?>
				</tbody>
			</table>

			<p class="edvora-actions">
				<button type="button" class="button button-primary" id="edvora-push" data-resume="1"><?php esc_html_e( 'Send to Edvora', 'edvora-migrator' ); ?></button>
				<?php if ( $resumable ) : ?>
					<button type="button" class="button" id="edvora-push-restart"><?php esc_html_e( 'Restart from the beginning', 'edvora-migrator' ); ?></button>
				<?php endif; ?>
				<button type="button" class="button" id="edvora-bundle"><?php esc_html_e( 'Download bundle', 'edvora-migrator' ); ?></button>
			</p>
			<div class="edvora-progress" hidden>
				<label for="edvora-progress-bar"><?php esc_html_e( 'Progress', 'edvora-migrator' ); ?></label>
				<progress id="edvora-progress-bar" max="100" value="0"></progress>
				<span id="edvora-progress-text" class="edvora-result" role="status" aria-live="polite"></span>
			</div>
		</div>
		<?php
	}

	/**
	 * Detected stacks, human readable.
	 *
	 * @return string
	 */
	private static function stack_list() {
		$names = array();
		foreach ( Edvora_Migrator_Detector::plugins() as $p ) {
			if ( $p['active'] && in_array( $p['slug'], array( 'woocommerce', 'woocommerce-memberships', 'lifterlms', 'tutor', 'digits', 'presto-player' ), true ) ) {
				$names[] = $p['slug'] . ' ' . $p['version'] . ( $p['folder'] && $p['folder'] !== $p['slug'] ? ' (' . $p['folder'] . ')' : '' );
			}
		}
		return $names ? implode( ', ', $names ) : '—';
	}

	/**
	 * Tutor currency for the summary.
	 *
	 * @param bool $active Tutor active.
	 * @return string
	 */
	private static function tutor_currency( $active ) {
		if ( ! $active ) {
			return __( 'Not active', 'edvora-migrator' );
		}
		$opt = get_option( 'tutor_option', array() );
		$opt = is_array( $opt ) ? $opt : array();
		return ( isset( $opt['currency_code'] ) ? $opt['currency_code'] : 'USD' ) . ' / ' . ( isset( $opt['monetize_by'] ) ? $opt['monetize_by'] : 'tutor' );
	}
}
