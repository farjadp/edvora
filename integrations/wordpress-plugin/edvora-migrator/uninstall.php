<?php
/**
 * Uninstall: remove our options and the private temp folder. Nothing else on the site is touched.
 *
 * @package EdvoraMigrator
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

require_once __DIR__ . '/includes/class-util.php';
require_once __DIR__ . '/includes/class-settings.php';
require_once __DIR__ . '/includes/class-bundle.php';

Edvora_Migrator_Bundle::delete_dir();
wp_clear_scheduled_hook( Edvora_Migrator_Bundle::CRON_HOOK );
foreach ( Edvora_Migrator_Settings::option_names() as $edvora_migrator_option ) {
	delete_option( $edvora_migrator_option );
}
