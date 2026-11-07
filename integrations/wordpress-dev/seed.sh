#!/usr/bin/env bash
# Seed the fixture WordPress sites. Usage: ./seed.sh [wp57|latest|all]   (default: all)
# Needs internet once (wordpress.org plugin + language downloads). Test credentials only.
set -euo pipefail
cd "$(dirname "$0")"

ADMIN_USER="admin"
ADMIN_PASS="admin-fixture-password" # local fixture only
STACK="${1:-all}"

# Pinned versions. wp57 mirrors Iran Brand Academy (WP 5.7.21, WC 5.4.4, LifterLMS 4.21.3 in folder lifterlmsfa).
WP57_CORE="5.7.21"
WP57_WC="5.4.4"
WP57_LLMS="4.21.3"
WP57_TUTOR="1.9.16"
LATEST_WC="11.2.2"
LATEST_LLMS="11.0.1"
LATEST_TUTOR="4.2.0"

dc() { docker compose "$@"; }

wait_ready() { # $1 = web service, $2 = cli service
  for _ in $(seq 1 60); do
    if dc exec -T "$1" test -f /var/www/html/wp-config.php 2>/dev/null; then
      if dc exec -T "$2" wp db check --skip-ssl >/dev/null 2>&1 || dc exec -T "$2" wp db check >/dev/null 2>&1; then return 0; fi
    fi
    sleep 2
  done
  echo "timeout waiting for $1" >&2
  return 1
}

seed_stack() { # name web cli port core wc llms tutor rename_llms
  local name=$1 web=$2 cli=$3 port=$4 core=$5 wc=$6 llms=$7 tutor=$8 rename=$9
  local wp="dc exec -T $cli wp"
  echo "==> [$name] waiting for WordPress"
  wait_ready "$web" "$cli"

  if ! $wp core is-installed 2>/dev/null; then
    $wp core install --url="http://localhost:$port" --title="آکادمی نمونه" \
      --admin_user="$ADMIN_USER" --admin_password="$ADMIN_PASS" --admin_email=admin@example.com --skip-email
  fi
  if [ -n "$core" ]; then
    $wp core update --version="$core" --force || echo "WARN: core update to $core failed; keeping image version"
    $wp core update-db || true
  fi
  echo "==> [$name] WordPress $($wp core version)"

  $wp language core install fa_IR --activate || echo "WARN: fa_IR language pack unavailable"
  $wp option update timezone_string "Asia/Tehran"
  $wp rewrite structure '/%postname%/' --hard >/dev/null 2>&1 || $wp rewrite structure '/%postname%/'

  echo "==> [$name] plugins: woocommerce $wc, lifterlms $llms, tutor $tutor"
  $wp plugin install woocommerce --version="$wc" --force
  $wp plugin install lifterlms --version="$llms" --force
  $wp plugin install tutor --version="$tutor" --force
  if [ "$rename" = "yes" ]; then
    # IBA runs LifterLMS from a renamed folder; the exporter must still detect it as `lifterlms`.
    dc exec -T "$cli" sh -c 'rm -rf /var/www/html/wp-content/plugins/lifterlmsfa && mv /var/www/html/wp-content/plugins/lifterlms /var/www/html/wp-content/plugins/lifterlmsfa'
    $wp plugin activate lifterlmsfa
  else
    $wp plugin activate lifterlms
  fi
  $wp plugin activate woocommerce
  $wp plugin activate tutor
  $wp plugin activate edvora-migrator

  # Shop settings: Toman, no decimals; LifterLMS priced in rials (IRT vs IRR stores, research §D.6).
  $wp option update woocommerce_currency IRT
  $wp option update woocommerce_price_num_decimals 0
  $wp option update woocommerce_default_country "IR:THR"
  $wp option update lifterlms_currency IRR
  if [ "$name" = "latest" ]; then
    $wp wc hpos enable >/dev/null 2>&1 || true
    echo "HPOS enabled: $($wp option get woocommerce_custom_orders_table_enabled 2>/dev/null || echo no)"
  fi

  echo "==> [$name] sample data"
  $wp eval-file /seed/seed-data.php
  $wp edvora-migrator selftest
  $wp edvora-migrator preflight | head -c 2000; echo
}

dc up -d
if [ "$STACK" = "wp57" ] || [ "$STACK" = "all" ]; then
  seed_stack wp57 wp57 cli57 8057 "$WP57_CORE" "$WP57_WC" "$WP57_LLMS" "$WP57_TUTOR" yes
fi
if [ "$STACK" = "latest" ] || [ "$STACK" = "all" ]; then
  seed_stack latest latest clilatest 8082 "" "$LATEST_WC" "$LATEST_LLMS" "$LATEST_TUTOR" no
fi
echo "==> done. wp57: http://localhost:8057/wp-admin  latest: http://localhost:8082/wp-admin  (user $ADMIN_USER)"
