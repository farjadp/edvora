<?php
/**
 * Plugin Name:       Edvora Migrator
 * Description:       Exports users, courses, enrollments and orders (WooCommerce, LifterLMS, Tutor LMS) to Edvora. Read-only on your WordPress data.
 * Version:           1.0.0
 * Requires at least: 5.6
 * Requires PHP:      7.4
 * Author:            Edvora
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       edvora-migrator
 * Domain Path:       /languages
 * Update URI:        false
 *
 * @package EdvoraMigrator
 */

defined( 'ABSPATH' ) || exit;

define( 'EDVORA_MIGRATOR_VERSION', '1.0.0' );
define( 'EDVORA_MIGRATOR_FILE', __FILE__ );
define( 'EDVORA_MIGRATOR_DIR', plugin_dir_path( __FILE__ ) );
define( 'EDVORA_MIGRATOR_FORMAT_VERSION', 1 );

require_once EDVORA_MIGRATOR_DIR . 'includes/class-i18n.php';
require_once EDVORA_MIGRATOR_DIR . 'includes/class-util.php';
require_once EDVORA_MIGRATOR_DIR . 'includes/class-settings.php';
require_once EDVORA_MIGRATOR_DIR . 'includes/class-signer.php';
require_once EDVORA_MIGRATOR_DIR . 'includes/class-detector.php';
require_once EDVORA_MIGRATOR_DIR . 'includes/class-exporter.php';
require_once EDVORA_MIGRATOR_DIR . 'includes/class-bundle.php';
require_once EDVORA_MIGRATOR_DIR . 'includes/class-pusher.php';
require_once EDVORA_MIGRATOR_DIR . 'includes/class-admin.php';

Edvora_Migrator_I18n::init();
Edvora_Migrator_Bundle::init();

if ( is_admin() ) {
	Edvora_Migrator_Admin::init();
}

if ( defined( 'WP_CLI' ) && WP_CLI ) {
	require_once EDVORA_MIGRATOR_DIR . 'includes/class-cli.php';
	WP_CLI::add_command( 'edvora-migrator', 'Edvora_Migrator_CLI' );
}

register_activation_hook( __FILE__, array( 'Edvora_Migrator_Bundle', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'Edvora_Migrator_Bundle', 'deactivate' ) );
