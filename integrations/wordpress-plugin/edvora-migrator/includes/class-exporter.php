<?php
/**
 * Read-only exporter: turns WordPress rows into FORMAT.md §4 records.
 *
 * Every query is a SELECT built with $wpdb->prepare(); table names come from $wpdb only.
 * Paging is keyset (primary key > cursor ORDER BY primary key), so a batch can resume anywhere.
 *
 * @package EdvoraMigrator
 */

defined( 'ABSPATH' ) || exit;

/**
 * Shared helpers for kind groups.
 */
abstract class Edvora_Migrator_Kind_Group {

	/**
	 * Taxonomies exported as wp.term and referenced by rel.terms.
	 * FORMAT §4 row 2 lists category, post_tag, product_cat, course_cat, course_tag; we add Tutor's real taxonomy
	 * names (course-category, course-tag) and LifterLMS' course_difficulty/course_track/membership_* (additive).
	 *
	 * @var string[]
	 */
	public static $taxonomies = array( 'category', 'post_tag', 'product_cat', 'course_cat', 'course_tag', 'course_difficulty', 'course_track', 'membership_cat', 'membership_tag', 'course-category', 'course-tag' );

	/**
	 * Kinds handled, in export order => definition.
	 *
	 * @return array
	 */
	abstract public function definitions();

	/**
	 * Count records of a kind.
	 *
	 * @param string $kind Kind.
	 * @return int
	 */
	public function count( $kind ) {
		$def = $this->definitions()[ $kind ];
		if ( isset( $def['count'] ) ) {
			return (int) call_user_func( $def['count'] );
		}
		return $this->count_posts( $def );
	}

	/**
	 * Fetch a page of records.
	 *
	 * @param string $kind   Kind.
	 * @param string $cursor Last primary key seen ('' or '0' to start).
	 * @param int    $limit  Page size.
	 * @return array{records:array,next:string|null}
	 */
	public function fetch( $kind, $cursor, $limit ) {
		$def = $this->definitions()[ $kind ];
		if ( isset( $def['fetch'] ) ) {
			return call_user_func( $def['fetch'], $kind, (int) $cursor, (int) $limit );
		}
		return $this->fetch_posts( $kind, $def, (int) $cursor, (int) $limit );
	}

	/**
	 * WHERE clause and args for a posts-based definition.
	 *
	 * @param array $def Definition: post_types, statuses?, where?.
	 * @return array{0:string,1:array}
	 */
	protected function posts_where( $def ) {
		$types = (array) $def['post_types'];
		$sql   = 'p.post_type IN (' . Edvora_Migrator_Util::placeholders( $types, '%s' ) . ')';
		$args  = $types;
		if ( ! empty( $def['statuses'] ) ) {
			$sql .= ' AND p.post_status IN (' . Edvora_Migrator_Util::placeholders( $def['statuses'], '%s' ) . ')';
			$args = array_merge( $args, $def['statuses'] );
		} else {
			$sql .= " AND p.post_status <> 'auto-draft'";
		}
		if ( ! empty( $def['where'] ) ) {
			$sql .= ' AND ' . $def['where'];
		}
		return array( $sql, $args );
	}

	/**
	 * Count posts for a definition.
	 *
	 * @param array $def Definition.
	 * @return int
	 */
	protected function count_posts( $def ) {
		global $wpdb;
		list( $where, $args ) = $this->posts_where( $def );
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->posts} p WHERE {$where}", $args ) );
	}

	/**
	 * Fetch posts-based records.
	 *
	 * @param string $kind   Kind.
	 * @param array  $def    Definition: post_types, statuses?, where?, meta (all|exclude|only), meta_keys?, terms?.
	 * @param int    $cursor Last ID.
	 * @param int    $limit  Page size.
	 * @return array
	 */
	protected function fetch_posts( $kind, $def, $cursor, $limit ) {
		global $wpdb;
		list( $where, $args ) = $this->posts_where( $def );
		$args[]               = $cursor;
		$args[]               = $limit;
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT p.* FROM {$wpdb->posts} p WHERE {$where} AND p.ID > %d ORDER BY p.ID ASC LIMIT %d", $args ), ARRAY_A );
		// Never export the shared password of protected posts (QA-E032-09).
		foreach ( $rows as &$r ) {
			unset( $r['post_password'] );
		}
		unset( $r );
		$ids  = wp_list_pluck( $rows, 'ID' );
		$meta = $this->post_meta( $ids, $def );
		$rel  = empty( $def['terms'] ) ? array() : $this->post_terms( $ids );

		$records = array();
		foreach ( $rows as $row ) {
			$id     = (string) $row['ID'];
			$record = array(
				'type' => 'record',
				'v'    => 1,
				'kind' => $kind,
				'wpId' => $id,
				'data' => Edvora_Migrator_Util::clean_row( $row ),
				'meta' => isset( $meta[ $id ] ) ? $meta[ $id ] : new stdClass(),
			);
			if ( ! empty( $def['terms'] ) ) {
				$record['rel'] = array( 'terms' => isset( $rel[ $id ] ) ? $rel[ $id ] : array() );
			}
			$records[] = $record;
		}
		return $this->page( $records, $rows, 'ID', $limit );
	}

	/**
	 * Build the page result.
	 *
	 * @param array  $records Records.
	 * @param array  $rows    Raw rows (for the cursor).
	 * @param string $pk      Primary key column in $rows.
	 * @param int    $limit   Page size.
	 * @return array
	 */
	protected function page( $records, $rows, $pk, $limit ) {
		$next = null;
		if ( count( $rows ) >= $limit && $limit > 0 ) {
			$last = end( $rows );
			$next = (string) $last[ $pk ];
		}
		return array(
			'records' => $records,
			'next'    => $next,
		);
	}

	/**
	 * Postmeta for IDs, filtered per definition.
	 *
	 * @param array $ids IDs.
	 * @param array $def Definition.
	 * @return array id => meta
	 */
	protected function post_meta( $ids, $def ) {
		global $wpdb;
		if ( empty( $ids ) ) {
			return array();
		}
		$mode = isset( $def['meta'] ) ? $def['meta'] : 'all';
		$sql  = "SELECT post_id AS oid, meta_key, meta_value FROM {$wpdb->postmeta} WHERE post_id IN (" . Edvora_Migrator_Util::placeholders( $ids ) . ')';
		$args = $ids;
		if ( 'only' === $mode ) {
			$sql .= ' AND meta_key IN (' . Edvora_Migrator_Util::placeholders( $def['meta_keys'], '%s' ) . ')';
			$args = array_merge( $args, $def['meta_keys'] );
		}
		$sql .= ' ORDER BY meta_id ASC';
		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
		$rows   = $wpdb->get_results( $wpdb->prepare( $sql, $args ), ARRAY_A );
		$filter = null;
		if ( 'exclude' === $mode ) {
			$prefixes = isset( $def['exclude_prefixes'] ) ? $def['exclude_prefixes'] : array();
			$exact    = isset( $def['exclude_keys'] ) ? $def['exclude_keys'] : array();
			$contains = isset( $def['exclude_contains'] ) ? $def['exclude_contains'] : array();
			$filter   = static function ( $key ) use ( $prefixes, $exact, $contains ) {
				return Edvora_Migrator_Kind_Group::keep_key( $key, $prefixes, $exact, $contains );
			};
		}
		return Edvora_Migrator_Util::group_meta( $rows, $filter );
	}

	/**
	 * Meta key filter.
	 *
	 * @param string   $key      Key.
	 * @param string[] $prefixes Excluded prefixes.
	 * @param string[] $exact    Excluded keys.
	 * @param string[] $contains Excluded substrings.
	 * @return bool
	 */
	public static function keep_key( $key, $prefixes, $exact, $contains ) {
		if ( in_array( $key, $exact, true ) ) {
			return false;
		}
		foreach ( $prefixes as $prefix ) {
			if ( 0 === strpos( $key, $prefix ) ) {
				return false;
			}
		}
		foreach ( $contains as $needle ) {
			if ( false !== strpos( $key, $needle ) ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * term_taxonomy_ids per object, limited to exported taxonomies.
	 *
	 * @param array $ids Object IDs.
	 * @return array id => string[]
	 */
	protected function post_terms( $ids ) {
		global $wpdb;
		if ( empty( $ids ) ) {
			return array();
		}
		$tax  = self::$taxonomies;
		$sql  = "SELECT tr.object_id, tr.term_taxonomy_id FROM {$wpdb->term_relationships} tr
			INNER JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
			WHERE tr.object_id IN (" . Edvora_Migrator_Util::placeholders( $ids ) . ')
			AND tt.taxonomy IN (' . Edvora_Migrator_Util::placeholders( $tax, '%s' ) . ')
			ORDER BY tr.object_id ASC, tr.term_order ASC, tr.term_taxonomy_id ASC';
		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
		$rows = $wpdb->get_results( $wpdb->prepare( $sql, array_merge( $ids, $tax ) ), ARRAY_A );
		$out  = array();
		foreach ( $rows as $row ) {
			$out[ (string) $row['object_id'] ][] = (string) $row['term_taxonomy_id'];
		}
		return $out;
	}

	/**
	 * Encode serialized PHP values in a custom-table row the same way as meta ("json:…"); other values untouched.
	 *
	 * @param array    $row     Row.
	 * @param string[] $columns Columns that may hold serialized PHP.
	 * @return array
	 */
	protected function decode_columns( $row, $columns ) {
		$row = Edvora_Migrator_Util::clean_row( $row );
		foreach ( $columns as $col ) {
			if ( isset( $row[ $col ] ) && is_string( $row[ $col ] ) && is_serialized( $row[ $col ] ) ) {
				$row[ $col ] = Edvora_Migrator_Util::encode_meta_value( $row[ $col ] );
			}
		}
		return $row;
	}
}

/**
 * Core WordPress: users, terms, attachments, posts and pages.
 */
class Edvora_Migrator_Kinds_Core extends Edvora_Migrator_Kind_Group {

	/**
	 * Allow-listed usermeta keys (FORMAT §4 row 1) — prefix-dependent key added at runtime.
	 *
	 * @var string[]
	 */
	private static $user_meta_keys = array( 'first_name', 'last_name', 'nickname', 'description', 'digits_phone', 'digits_phone_no', 'digt_countrycode', 'mobile', 'phone_number', 'billing_phone', 'billing_first_name', 'billing_last_name', 'billing_email', 'billing_city', '_tutor_instructor_status' );

	/**
	 * Never exported even if a future allow-list change would match them.
	 *
	 * @var string[]
	 */
	private static $user_meta_denied = array( 'session_tokens', '_application_passwords', 'user_pass', 'user_activation_key' );

	/**
	 * Definitions.
	 *
	 * @return array
	 */
	public function definitions() {
		return array(
			'wp.user'       => array(
				'count' => array( $this, 'count_users' ),
				'fetch' => array( $this, 'fetch_users' ),
			),
			'wp.term'       => array(
				'count' => array( $this, 'count_terms' ),
				'fetch' => array( $this, 'fetch_terms' ),
			),
			'wp.attachment' => array(
				'post_types' => array( 'attachment' ),
				'meta'       => 'only',
				'meta_keys'  => array( '_wp_attached_file', '_wp_attachment_image_alt' ),
			),
			'wp.post'       => array(
				'post_types'       => array( 'post', 'page' ),
				'statuses'         => array( 'publish', 'draft', 'private', 'future' ),
				'meta'             => 'exclude',
				'exclude_prefixes' => array( '_edit_', '_wp_old_', '_oembed_' ),
				'terms'            => true,
			),
		);
	}

	/**
	 * Count users.
	 *
	 * @return int
	 */
	public function count_users() {
		global $wpdb;
		return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->users}" );
	}

	/**
	 * Whether a usermeta key is allow-listed.
	 *
	 * @param string $key Key.
	 * @return bool
	 */
	public static function user_meta_allowed( $key ) {
		global $wpdb;
		if ( in_array( $key, self::$user_meta_denied, true ) ) {
			return false;
		}
		if ( in_array( $key, self::$user_meta_keys, true ) || $wpdb->prefix . 'capabilities' === $key ) {
			return true;
		}
		return 1 === preg_match( '/(national|melli|meli)_?(code|id)/i', $key );
	}

	/**
	 * Fetch users.
	 *
	 * @param string $kind   Kind.
	 * @param int    $cursor Last ID.
	 * @param int    $limit  Limit.
	 * @return array
	 */
	public function fetch_users( $kind, $cursor, $limit ) {
		global $wpdb;
		$rows    = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->users} WHERE ID > %d ORDER BY ID ASC LIMIT %d", $cursor, $limit ), ARRAY_A );
		$ids     = wp_list_pluck( $rows, 'ID' );
		$meta    = array();
		$records = array();
		if ( $ids ) {
			$keys   = self::$user_meta_keys;
			$keys[] = $wpdb->prefix . 'capabilities';
			$sql    = "SELECT user_id AS oid, meta_key, meta_value FROM {$wpdb->usermeta}
				WHERE user_id IN (" . Edvora_Migrator_Util::placeholders( $ids ) . ')
				AND ( meta_key IN (' . Edvora_Migrator_Util::placeholders( $keys, '%s' ) . ")
					OR meta_key LIKE '%%national%%' OR meta_key LIKE '%%melli%%' OR meta_key LIKE '%%meli%%' )
				ORDER BY umeta_id ASC";
			// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			$mrows = $wpdb->get_results( $wpdb->prepare( $sql, array_merge( $ids, $keys ) ), ARRAY_A );
			$meta  = Edvora_Migrator_Util::group_meta( $mrows, array( __CLASS__, 'user_meta_allowed' ) );
		}
		foreach ( $rows as $row ) {
			unset( $row['user_pass'], $row['user_activation_key'] );
			$id        = (string) $row['ID'];
			$records[] = array(
				'type' => 'record',
				'v'    => 1,
				'kind' => $kind,
				'wpId' => $id,
				'data' => Edvora_Migrator_Util::clean_row( $row ),
				'meta' => isset( $meta[ $id ] ) ? $meta[ $id ] : new stdClass(),
			);
		}
		return $this->page( $records, $rows, 'ID', $limit );
	}

	/**
	 * Count terms.
	 *
	 * @return int
	 */
	public function count_terms() {
		global $wpdb;
		$tax = self::$taxonomies;
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->term_taxonomy} WHERE taxonomy IN (" . Edvora_Migrator_Util::placeholders( $tax, '%s' ) . ')', $tax ) );
	}

	/**
	 * Fetch terms.
	 *
	 * @param string $kind   Kind.
	 * @param int    $cursor Last term_taxonomy_id.
	 * @param int    $limit  Limit.
	 * @return array
	 */
	public function fetch_terms( $kind, $cursor, $limit ) {
		global $wpdb;
		$tax  = self::$taxonomies;
		$sql  = "SELECT tt.term_taxonomy_id, t.term_id, t.name, t.slug, tt.taxonomy, tt.parent, tt.description, tt.count
			FROM {$wpdb->term_taxonomy} tt INNER JOIN {$wpdb->terms} t ON t.term_id = tt.term_id
			WHERE tt.taxonomy IN (" . Edvora_Migrator_Util::placeholders( $tax, '%s' ) . ')
			AND tt.term_taxonomy_id > %d ORDER BY tt.term_taxonomy_id ASC LIMIT %d';
		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
		$rows    = $wpdb->get_results( $wpdb->prepare( $sql, array_merge( $tax, array( $cursor, $limit ) ) ), ARRAY_A );
		$term_ids = array_values( array_unique( wp_list_pluck( $rows, 'term_id' ) ) );
		$meta     = array();
		if ( $term_ids ) {
			$msql = "SELECT term_id AS oid, meta_key, meta_value FROM {$wpdb->termmeta} WHERE term_id IN (" . Edvora_Migrator_Util::placeholders( $term_ids ) . ') ORDER BY meta_id ASC';
			// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			$meta = Edvora_Migrator_Util::group_meta( $wpdb->get_results( $wpdb->prepare( $msql, $term_ids ), ARRAY_A ) );
		}
		$records = array();
		foreach ( $rows as $row ) {
			$data = Edvora_Migrator_Util::clean_row( $row );
			unset( $data['term_taxonomy_id'] );
			$records[] = array(
				'type' => 'record',
				'v'    => 1,
				'kind' => $kind,
				'wpId' => (string) $row['term_taxonomy_id'],
				'data' => $data,
				'meta' => isset( $meta[ (string) $row['term_id'] ] ) ? $meta[ (string) $row['term_id'] ] : new stdClass(),
			);
		}
		return $this->page( $records, $rows, 'term_taxonomy_id', $limit );
	}
}

/**
 * WooCommerce: products, coupons, orders (HPOS or legacy), Memberships.
 */
class Edvora_Migrator_Kinds_Woo extends Edvora_Migrator_Kind_Group {

	/**
	 * Whether Memberships is active.
	 *
	 * @var bool
	 */
	private $memberships;

	/**
	 * Whether orders live in HPOS tables.
	 *
	 * @var bool
	 */
	private $hpos;

	/**
	 * Constructor.
	 *
	 * @param bool $memberships Memberships active.
	 * @param bool $hpos        HPOS authoritative.
	 */
	public function __construct( $memberships, $hpos ) {
		$this->memberships = $memberships;
		$this->hpos        = $hpos;
	}

	/**
	 * Definitions.
	 *
	 * @return array
	 */
	public function definitions() {
		$defs = array(
			'woo.product' => array(
				'post_types'       => array( 'product' ),
				'meta'             => 'exclude',
				'exclude_prefixes' => array( '_edit_', '_oembed_' ),
				'exclude_keys'     => array( '_product_attributes' ),
				'terms'            => true,
			),
			'woo.coupon'  => array(
				'post_types' => array( 'shop_coupon' ),
			),
			'woo.order'   => array(
				'count' => array( $this, 'count_orders' ),
				'fetch' => array( $this, 'fetch_orders' ),
			),
		);
		if ( $this->memberships ) {
			$defs['woo.membership_plan'] = array( 'post_types' => array( 'wc_membership_plan' ) );
			$defs['woo.membership']      = array( 'post_types' => array( 'wc_user_membership' ) );
		}
		return $defs;
	}

	/**
	 * Order meta filter (FORMAT §4 row 7).
	 *
	 * @param string $key Key.
	 * @return bool
	 */
	public static function keep_order_meta( $key ) {
		return self::keep_key( $key, array( '_edit_' ), array(), array( 'card_number_full' ) );
	}

	/**
	 * Count orders.
	 *
	 * @return int
	 */
	public function count_orders() {
		global $wpdb;
		if ( $this->hpos ) {
			return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}wc_orders WHERE type IN ('shop_order','shop_order_refund') AND status <> 'auto-draft'" );
		}
		return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type IN ('shop_order','shop_order_refund') AND post_status <> 'auto-draft'" );
	}

	/**
	 * Fetch orders, normalised to one shape for HPOS and legacy.
	 *
	 * @param string $kind   Kind.
	 * @param int    $cursor Last order id.
	 * @param int    $limit  Limit.
	 * @return array
	 */
	public function fetch_orders( $kind, $cursor, $limit ) {
		global $wpdb;
		if ( $this->hpos ) {
			$rows = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT o.id, o.status, o.currency, o.type, o.tax_amount, o.total_amount, o.customer_id, o.billing_email,
						o.date_created_gmt, o.parent_order_id, o.payment_method, o.payment_method_title, o.transaction_id,
						op.date_paid_gmt, op.date_completed_gmt, op.discount_total_amount,
						a.first_name AS billing_first_name, a.last_name AS billing_last_name, a.phone AS billing_phone, a.email AS address_email
					FROM {$wpdb->prefix}wc_orders o
					LEFT JOIN {$wpdb->prefix}wc_order_operational_data op ON op.order_id = o.id
					LEFT JOIN {$wpdb->prefix}wc_order_addresses a ON a.order_id = o.id AND a.address_type = 'billing'
					WHERE o.type IN ('shop_order','shop_order_refund') AND o.status <> 'auto-draft' AND o.id > %d
					ORDER BY o.id ASC LIMIT %d",
					$cursor,
					$limit
				),
				ARRAY_A
			);
			$ids   = wp_list_pluck( $rows, 'id' );
			$meta  = array();
			if ( $ids ) {
				$sql = "SELECT order_id AS oid, meta_key, meta_value FROM {$wpdb->prefix}wc_orders_meta WHERE order_id IN (" . Edvora_Migrator_Util::placeholders( $ids ) . ') ORDER BY id ASC';
				// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
				$meta = Edvora_Migrator_Util::group_meta( $wpdb->get_results( $wpdb->prepare( $sql, $ids ), ARRAY_A ), array( __CLASS__, 'keep_order_meta' ) );
			}
			$normalised = array();
			foreach ( $rows as $row ) {
				$normalised[] = array(
					'id'                   => $row['id'],
					'status'               => $row['status'],
					'currency'             => $row['currency'],
					'total'                => $row['total_amount'],
					'discount_total'       => $row['discount_total_amount'],
					'tax_total'            => $row['tax_amount'],
					'customer_id'          => $row['customer_id'],
					'billing_first_name'   => $row['billing_first_name'],
					'billing_last_name'    => $row['billing_last_name'],
					'billing_email'        => ( null !== $row['billing_email'] && '' !== $row['billing_email'] ) ? $row['billing_email'] : $row['address_email'],
					'billing_phone'        => $row['billing_phone'],
					'payment_method'       => $row['payment_method'],
					'payment_method_title' => $row['payment_method_title'],
					'transaction_id'       => $row['transaction_id'],
					'date_created_gmt'     => $row['date_created_gmt'],
					'date_paid_gmt'        => $row['date_paid_gmt'],
					'date_completed_gmt'   => $row['date_completed_gmt'],
					'parent_id'            => $row['parent_order_id'],
					'type'                 => $row['type'],
				);
			}
		} else {
			$rows  = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT ID, post_status, post_type, post_parent, post_date_gmt FROM {$wpdb->posts}
					WHERE post_type IN ('shop_order','shop_order_refund') AND post_status <> 'auto-draft' AND ID > %d
					ORDER BY ID ASC LIMIT %d",
					$cursor,
					$limit
				),
				ARRAY_A
			);
			$ids   = wp_list_pluck( $rows, 'ID' );
			$meta  = array();
			$raw   = array();
			if ( $ids ) {
				$sql = "SELECT post_id AS oid, meta_key, meta_value FROM {$wpdb->postmeta} WHERE post_id IN (" . Edvora_Migrator_Util::placeholders( $ids ) . ') ORDER BY meta_id ASC';
				// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
				$mrows = $wpdb->get_results( $wpdb->prepare( $sql, $ids ), ARRAY_A );
				foreach ( $mrows as $m ) {
					if ( ! isset( $raw[ (string) $m['oid'] ][ $m['meta_key'] ] ) ) {
						$raw[ (string) $m['oid'] ][ $m['meta_key'] ] = $m['meta_value'];
					}
				}
				$meta = Edvora_Migrator_Util::group_meta( $mrows, array( __CLASS__, 'keep_order_meta' ) );
			}
			$normalised = array();
			foreach ( $rows as $row ) {
				$m            = isset( $raw[ (string) $row['ID'] ] ) ? $raw[ (string) $row['ID'] ] : array();
				$get          = static function ( $key ) use ( $m ) {
					return isset( $m[ $key ] ) ? $m[ $key ] : null;
				};
				$normalised[] = array(
					'id'                   => $row['ID'],
					'status'               => $row['post_status'],
					'currency'             => $get( '_order_currency' ),
					'total'                => $get( '_order_total' ),
					'discount_total'       => $get( '_cart_discount' ),
					'tax_total'            => $get( '_order_tax' ),
					'customer_id'          => $get( '_customer_user' ),
					'billing_first_name'   => $get( '_billing_first_name' ),
					'billing_last_name'    => $get( '_billing_last_name' ),
					'billing_email'        => $get( '_billing_email' ),
					'billing_phone'        => $get( '_billing_phone' ),
					'payment_method'       => $get( '_payment_method' ),
					'payment_method_title' => $get( '_payment_method_title' ),
					'transaction_id'       => $get( '_transaction_id' ),
					'date_created_gmt'     => $row['post_date_gmt'],
					'date_paid_gmt'        => Edvora_Migrator_Util::ts_to_gmt( $get( '_date_paid' ) ),
					'date_completed_gmt'   => Edvora_Migrator_Util::ts_to_gmt( $get( '_date_completed' ) ),
					'parent_id'            => $row['post_parent'],
					'type'                 => $row['post_type'],
				);
			}
		}

		$items   = $this->order_items( $ids );
		$records = array();
		foreach ( $normalised as $data ) {
			$id        = (string) $data['id'];
			$records[] = array(
				'type'  => 'record',
				'v'     => 1,
				'kind'  => $kind,
				'wpId'  => $id,
				'data'  => Edvora_Migrator_Util::clean_row( $data ),
				'meta'  => isset( $meta[ $id ] ) ? $meta[ $id ] : new stdClass(),
				'items' => isset( $items[ $id ] ) ? $items[ $id ] : array(),
			);
		}
		return $this->page( $records, $rows, $this->hpos ? 'id' : 'ID', $limit );
	}

	/**
	 * Line, coupon and fee items per order.
	 *
	 * @param array $order_ids Order IDs.
	 * @return array order id => items[]
	 */
	private function order_items( $order_ids ) {
		global $wpdb;
		if ( empty( $order_ids ) ) {
			return array();
		}
		$sql   = "SELECT order_item_id, order_item_name, order_item_type, order_id FROM {$wpdb->prefix}woocommerce_order_items
			WHERE order_id IN (" . Edvora_Migrator_Util::placeholders( $order_ids ) . ") AND order_item_type IN ('line_item','coupon','fee')
			ORDER BY order_item_id ASC";
		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
		$rows  = $wpdb->get_results( $wpdb->prepare( $sql, $order_ids ), ARRAY_A );
		$ids   = wp_list_pluck( $rows, 'order_item_id' );
		$imeta = array();
		if ( $ids ) {
			$keys = array( '_product_id', '_variation_id', '_qty', '_line_subtotal', '_line_total', 'discount_amount' );
			$msql = "SELECT order_item_id, meta_key, meta_value FROM {$wpdb->prefix}woocommerce_order_itemmeta
				WHERE order_item_id IN (" . Edvora_Migrator_Util::placeholders( $ids ) . ') AND meta_key IN (' . Edvora_Migrator_Util::placeholders( $keys, '%s' ) . ')';
			// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			foreach ( $wpdb->get_results( $wpdb->prepare( $msql, array_merge( $ids, $keys ) ), ARRAY_A ) as $m ) {
				$imeta[ (string) $m['order_item_id'] ][ $m['meta_key'] ] = $m['meta_value'];
			}
		}
		$out = array();
		foreach ( $rows as $row ) {
			$iid  = (string) $row['order_item_id'];
			$m    = isset( $imeta[ $iid ] ) ? $imeta[ $iid ] : array();
			$get  = static function ( $key ) use ( $m ) {
				return isset( $m[ $key ] ) ? (string) $m[ $key ] : null;
			};
			$item = array(
				'id'   => $iid,
				'type' => $row['order_item_type'],
				'name' => Edvora_Migrator_Util::clean( $row['order_item_name'] ),
			);
			if ( 'line_item' === $row['order_item_type'] ) {
				$item['product_id']   = $get( '_product_id' );
				$item['variation_id'] = $get( '_variation_id' );
				$item['qty']          = $get( '_qty' );
				$item['subtotal']     = $get( '_line_subtotal' );
				$item['total']        = $get( '_line_total' );
			} elseif ( 'coupon' === $row['order_item_type'] ) {
				$item['code']     = Edvora_Migrator_Util::clean( $row['order_item_name'] );
				$item['discount'] = $get( 'discount_amount' );
			} else {
				$item['total'] = $get( '_line_total' );
			}
			$out[ (string) $row['order_id'] ][] = $item;
		}
		return $out;
	}
}

/**
 * LifterLMS.
 */
class Edvora_Migrator_Kinds_LifterLMS extends Edvora_Migrator_Kind_Group {

	/**
	 * Whether Tutor is active too (both register post type `lesson`).
	 *
	 * @var bool
	 */
	private $tutor_active;

	/**
	 * Constructor.
	 *
	 * @param bool $tutor_active Tutor active.
	 */
	public function __construct( $tutor_active ) {
		$this->tutor_active = $tutor_active;
	}

	/**
	 * Definitions.
	 *
	 * @return array
	 */
	public function definitions() {
		global $wpdb;
		$lesson = array( 'post_types' => array( 'lesson' ) );
		if ( $this->tutor_active ) {
			// Lessons whose parent is a Tutor topic belong to Tutor.
			$lesson['where'] = "p.post_parent NOT IN (SELECT t.ID FROM {$wpdb->posts} t WHERE t.post_type = 'topics')";
		}
		$defs = array(
			'lifterlms.course'      => array(
				'post_types' => array( 'course' ),
				'terms'      => true,
			),
			'lifterlms.section'     => array( 'post_types' => array( 'section' ) ),
			'lifterlms.lesson'      => $lesson,
			'lifterlms.quiz'        => array( 'post_types' => array( 'llms_quiz' ) ),
			'lifterlms.question'    => array( 'post_types' => array( 'llms_question' ) ),
			'lifterlms.access_plan' => array( 'post_types' => array( 'llms_access_plan' ) ),
			'lifterlms.coupon'      => array( 'post_types' => array( 'llms_coupon' ) ),
			'lifterlms.order'       => array( 'post_types' => array( 'llms_order' ) ),
			'lifterlms.transaction' => array( 'post_types' => array( 'llms_transaction' ) ),
			'lifterlms.membership'  => array( 'post_types' => array( 'llms_membership' ) ),
			'lifterlms.certificate' => array( 'post_types' => array( 'llms_my_certificate' ) ),
		);
		if ( Edvora_Migrator_Util::table_exists( $wpdb->prefix . 'lifterlms_user_postmeta' ) ) {
			$defs['lifterlms.user_meta'] = array(
				'count' => array( $this, 'count_user_meta' ),
				'fetch' => array( $this, 'fetch_user_meta' ),
			);
		}
		return $defs;
	}

	/**
	 * Count lifterlms_user_postmeta rows.
	 *
	 * @return int
	 */
	public function count_user_meta() {
		global $wpdb;
		return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}lifterlms_user_postmeta" );
	}

	/**
	 * Fetch lifterlms_user_postmeta rows.
	 *
	 * @param string $kind   Kind.
	 * @param int    $cursor Last meta_id.
	 * @param int    $limit  Limit.
	 * @return array
	 */
	public function fetch_user_meta( $kind, $cursor, $limit ) {
		global $wpdb;
		$rows    = $wpdb->get_results( $wpdb->prepare( "SELECT meta_id, user_id, post_id, meta_key, meta_value, updated_date FROM {$wpdb->prefix}lifterlms_user_postmeta WHERE meta_id > %d ORDER BY meta_id ASC LIMIT %d", $cursor, $limit ), ARRAY_A );
		$records = array();
		foreach ( $rows as $row ) {
			$data = $this->decode_columns( $row, array( 'meta_value' ) );
			unset( $data['meta_id'] );
			$records[] = array(
				'type' => 'record',
				'v'    => 1,
				'kind' => $kind,
				'wpId' => (string) $row['meta_id'],
				'data' => $data,
			);
		}
		return $this->page( $records, $rows, 'meta_id', $limit );
	}
}

/**
 * Tutor LMS.
 */
class Edvora_Migrator_Kinds_Tutor extends Edvora_Migrator_Kind_Group {

	/**
	 * Whether LifterLMS is active too (both register post type `lesson`).
	 *
	 * @var bool
	 */
	private $lifter_active;

	/**
	 * Constructor.
	 *
	 * @param bool $lifter_active LifterLMS active.
	 */
	public function __construct( $lifter_active ) {
		$this->lifter_active = $lifter_active;
	}

	/**
	 * Definitions.
	 *
	 * @return array
	 */
	public function definitions() {
		global $wpdb;
		$lesson = array( 'post_types' => array( 'lesson' ) );
		if ( $this->lifter_active ) {
			$lesson['where'] = "p.post_parent IN (SELECT t.ID FROM {$wpdb->posts} t WHERE t.post_type = 'topics')";
		}
		$defs = array(
			'tutor.course'     => array(
				'post_types' => array( 'courses' ),
				'terms'      => true,
			),
			'tutor.topic'      => array( 'post_types' => array( 'topics' ) ),
			'tutor.lesson'     => $lesson,
			'tutor.quiz'       => array( 'post_types' => array( 'tutor_quiz' ) ),
			'tutor.enrollment' => array( 'post_types' => array( 'tutor_enrolled' ) ),
		);
		if ( Edvora_Migrator_Util::table_exists( $wpdb->prefix . 'tutor_quiz_questions' ) ) {
			$defs['tutor.question'] = array(
				'count' => array( $this, 'count_questions' ),
				'fetch' => array( $this, 'fetch_questions' ),
			);
		}
		$defs['tutor.progress'] = array(
			'count' => array( $this, 'count_progress' ),
			'fetch' => array( $this, 'fetch_progress' ),
		);
		return $defs;
	}

	/**
	 * Count quiz questions.
	 *
	 * @return int
	 */
	public function count_questions() {
		global $wpdb;
		return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}tutor_quiz_questions" );
	}

	/**
	 * Fetch quiz questions with their answers as items.
	 *
	 * @param string $kind   Kind.
	 * @param int    $cursor Last question_id.
	 * @param int    $limit  Limit.
	 * @return array
	 */
	public function fetch_questions( $kind, $cursor, $limit ) {
		global $wpdb;
		$rows    = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}tutor_quiz_questions WHERE question_id > %d ORDER BY question_id ASC LIMIT %d", $cursor, $limit ), ARRAY_A );
		$ids     = wp_list_pluck( $rows, 'question_id' );
		$answers = array();
		if ( $ids && Edvora_Migrator_Util::table_exists( $wpdb->prefix . 'tutor_quiz_question_answers' ) ) {
			$sql = "SELECT * FROM {$wpdb->prefix}tutor_quiz_question_answers WHERE belongs_question_id IN (" . Edvora_Migrator_Util::placeholders( $ids ) . ') ORDER BY belongs_question_id ASC, answer_id ASC';
			// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			foreach ( $wpdb->get_results( $wpdb->prepare( $sql, $ids ), ARRAY_A ) as $a ) {
				$answers[ (string) $a['belongs_question_id'] ][] = $this->decode_columns( $a, array( 'answer_two_gap_match', 'answer_settings' ) );
			}
		}
		$records = array();
		foreach ( $rows as $row ) {
			$id        = (string) $row['question_id'];
			$records[] = array(
				'type'  => 'record',
				'v'     => 1,
				'kind'  => $kind,
				'wpId'  => $id,
				'data'  => $this->decode_columns( $row, array( 'question_settings' ) ),
				'items' => isset( $answers[ $id ] ) ? $answers[ $id ] : array(),
			);
		}
		return $this->page( $records, $rows, 'question_id', $limit );
	}

	/**
	 * Count completed-lesson usermeta rows.
	 *
	 * @return int
	 */
	public function count_progress() {
		global $wpdb;
		return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->usermeta} WHERE meta_key LIKE %s", $wpdb->esc_like( '_tutor_completed_lesson_id_' ) . '%' ) );
	}

	/**
	 * Fetch completed lessons (usermeta _tutor_completed_lesson_id_<lesson>). Cursor is umeta_id.
	 *
	 * @param string $kind   Kind.
	 * @param int    $cursor Last umeta_id.
	 * @param int    $limit  Limit.
	 * @return array
	 */
	public function fetch_progress( $kind, $cursor, $limit ) {
		global $wpdb;
		$prefix  = '_tutor_completed_lesson_id_';
		$rows    = $wpdb->get_results( $wpdb->prepare( "SELECT umeta_id, user_id, meta_key, meta_value FROM {$wpdb->usermeta} WHERE meta_key LIKE %s AND umeta_id > %d ORDER BY umeta_id ASC LIMIT %d", $wpdb->esc_like( $prefix ) . '%', $cursor, $limit ), ARRAY_A );
		$records = array();
		foreach ( $rows as $row ) {
			$lesson    = substr( $row['meta_key'], strlen( $prefix ) );
			$records[] = array(
				'type' => 'record',
				'v'    => 1,
				'kind' => $kind,
				'wpId' => $row['user_id'] . ':' . $lesson,
				'data' => array(
					'user_id'      => (string) $row['user_id'],
					'lesson_id'    => (string) $lesson,
					'completed_at' => Edvora_Migrator_Util::clean( $row['meta_value'] ),
				),
			);
		}
		return $this->page( $records, $rows, 'umeta_id', $limit );
	}
}

/**
 * Facade: active kinds in FORMAT §4 order, counts, pages and the manifest.
 */
class Edvora_Migrator_Exporter {

	/**
	 * Kind => group.
	 *
	 * @var Edvora_Migrator_Kind_Group[]
	 */
	private $map = array();

	/**
	 * Detected stacks.
	 *
	 * @var array
	 */
	private $stacks;

	/**
	 * Constructor: detects active stacks.
	 */
	public function __construct() {
		$this->stacks = Edvora_Migrator_Detector::stacks();
		$groups       = array( new Edvora_Migrator_Kinds_Core() );
		if ( $this->stacks['woo'] ) {
			$groups[] = new Edvora_Migrator_Kinds_Woo( $this->stacks['woo_memberships'], Edvora_Migrator_Detector::woo_hpos() );
		}
		if ( $this->stacks['lifterlms'] ) {
			$groups[] = new Edvora_Migrator_Kinds_LifterLMS( $this->stacks['tutor'] );
		}
		if ( $this->stacks['tutor'] ) {
			$groups[] = new Edvora_Migrator_Kinds_Tutor( $this->stacks['lifterlms'] );
		}
		foreach ( $groups as $group ) {
			foreach ( array_keys( $group->definitions() ) as $kind ) {
				$this->map[ $kind ] = $group;
			}
		}
	}

	/**
	 * Active kinds in export order.
	 *
	 * @return string[]
	 */
	public function kinds() {
		return array_keys( $this->map );
	}

	/**
	 * Page size per kind (posts with content are heavier).
	 *
	 * @param string $kind Kind.
	 * @return int
	 */
	public function batch_size( $kind ) {
		$light = array( 'wp.user', 'wp.term', 'lifterlms.user_meta', 'tutor.progress', 'wp.attachment' );
		return in_array( $kind, $light, true ) ? 500 : 100;
	}

	/**
	 * Count of every active kind.
	 *
	 * @return array kind => int
	 */
	public function counts() {
		$out = array();
		foreach ( $this->map as $kind => $group ) {
			$out[ $kind ] = $group->count( $kind );
		}
		return $out;
	}

	/**
	 * One page of records.
	 *
	 * @param string $kind   Kind.
	 * @param string $cursor Cursor.
	 * @param int    $limit  Limit (0 = default).
	 * @return array{records:array,next:string|null}
	 */
	public function fetch( $kind, $cursor, $limit = 0 ) {
		if ( ! isset( $this->map[ $kind ] ) ) {
			return array(
				'records' => array(),
				'next'    => null,
			);
		}
		$limit = $limit > 0 ? $limit : $this->batch_size( $kind );
		return $this->map[ $kind ]->fetch( $kind, (string) $cursor, $limit );
	}

	/**
	 * Stacks detected.
	 *
	 * @return array
	 */
	public function stacks() {
		return $this->stacks;
	}

	/**
	 * Manifest (FORMAT §3).
	 *
	 * @param string $connection Connection id.
	 * @param string $tenant     Tenant slug.
	 * @param array  $counts     kind => count.
	 * @return array
	 */
	public function manifest( $connection, $tenant, $counts ) {
		global $wpdb;
		$uploads = wp_upload_dir( null, false );
		$theme   = wp_get_theme();
		$tutor   = null;
		if ( $this->stacks['tutor'] ) {
			$opt   = get_option( 'tutor_option', array() );
			$opt   = is_array( $opt ) ? $opt : array();
			$tutor = array(
				'currency'   => isset( $opt['currency_code'] ) ? (string) $opt['currency_code'] : 'USD',
				'monetizeBy' => isset( $opt['monetize_by'] ) ? (string) $opt['monetize_by'] : 'tutor',
			);
		}
		return array(
			'type'          => 'manifest',
			'format'        => 'edvora-wp-export',
			'formatVersion' => EDVORA_MIGRATOR_FORMAT_VERSION,
			'pluginVersion' => EDVORA_MIGRATOR_VERSION,
			'createdAtGmt'  => gmdate( 'Y-m-d\TH:i:s\Z' ),
			'connectionId'  => (string) $connection,
			'tenantSlug'    => (string) $tenant,
			'site'          => array(
				'siteId'             => hash( 'sha256', home_url() . '|' . $wpdb->prefix ),
				'homeUrl'            => home_url(),
				'siteUrl'            => site_url(),
				'name'               => Edvora_Migrator_Util::clean( get_bloginfo( 'name' ) ),
				'wpVersion'          => get_bloginfo( 'version' ),
				'phpVersion'         => PHP_VERSION,
				'locale'             => get_locale(),
				'timezone'           => (string) get_option( 'timezone_string', '' ),
				'gmtOffset'          => (float) get_option( 'gmt_offset', 0 ),
				'permalinkStructure' => (string) get_option( 'permalink_structure', '' ),
				'uploadsBaseUrl'     => isset( $uploads['baseurl'] ) ? $uploads['baseurl'] : '',
			),
			'plugins'       => Edvora_Migrator_Detector::manifest_plugins(),
			'theme'         => array(
				'stylesheet' => $theme->get_stylesheet(),
				'template'   => $theme->get_template(),
				'version'    => (string) $theme->get( 'Version' ),
			),
			'woo'           => $this->stacks['woo'] ? array(
				'currency'      => (string) get_option( 'woocommerce_currency', '' ),
				'hpos'          => Edvora_Migrator_Detector::woo_hpos(),
				'priceDecimals' => (int) get_option( 'woocommerce_price_num_decimals', 2 ),
			) : null,
			'lifterlms'     => $this->stacks['lifterlms'] ? array( 'currency' => (string) get_option( 'lifterlms_currency', 'USD' ) ) : null,
			'tutor'         => $tutor,
			'counts'        => empty( $counts ) ? new stdClass() : $counts,
		);
	}
}
