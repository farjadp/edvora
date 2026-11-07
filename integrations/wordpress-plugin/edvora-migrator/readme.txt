=== Edvora Migrator ===
Contributors: edvora
Tags: migration, lms, woocommerce, lifterlms, tutor
Requires at least: 5.6
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Moves an academy from WordPress to Edvora: users, courses, lessons, enrollments, progress and orders.

== Description ==

This plugin is **not published on wordpress.org**. It is distributed only from inside the Edvora admin panel
(Import from WordPress), together with the connection id and secret for one import job.

What it does:

* Reads (never writes) WordPress core data, WooCommerce (HPOS or legacy orders), WooCommerce Memberships,
  LifterLMS and Tutor LMS, and turns it into the Edvora export format v1.
* "Send to Edvora" pushes the data in small signed batches (HMAC-SHA256) to the Edvora URL you configure.
  That URL is the only outbound connection the plugin ever makes. HTTPS is required.
* "Download bundle" produces a signed `.edvora-bundle` file you can upload in Edvora instead.

What it never exports: password hashes, activation keys, login sessions, application passwords, other plugins'
settings, or user meta outside a short allow-list (names, phone numbers, billing contact, national code).

Temporary files live in a private folder under `wp-content/uploads/` (random 32-character name, blocked with
`.htaccess` for Apache/LiteSpeed and `web.config` for IIS, plus an empty `index.php`), and are deleted after download,
after 24 hours, and when the plugin is deactivated. **nginx ignores `.htaccess`:** on nginx hosts add
`location ~ /wp-content/uploads/edvora-migrator- { deny all; }` to the site config, or prefer "Send to Edvora"
(push), which keeps no temp file on disk. Protected posts' passwords (`post_password`) are never exported.

== Installation ==

1. In Edvora admin → Import from WordPress, create a connection and download this plugin.
2. In WordPress → Plugins → Add New → Upload, upload the zip and activate it.
3. Go to Tools → «انتقال به ادوورا», paste the Edvora URL, connection id and secret, then "Test connection".
4. Review the preflight summary and click "Send to Edvora" (or "Download bundle").
5. Deactivate and delete the plugin when the import is finished.

WP-CLI: `wp edvora-migrator preflight`, `wp edvora-migrator selftest`,
`wp edvora-migrator export --secret=… --connection=… --tenant=… --out=…`.

== Changelog ==

= 1.0.0 =
* First version: export format v1 (FORMAT.md), push and bundle modes.
