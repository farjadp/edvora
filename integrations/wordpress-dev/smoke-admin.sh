#!/usr/bin/env bash
# Smoke-test the plugin's admin flow over HTTP against a seeded site and the mock Edvora (profile "mock"):
# login → Tools page → save settings → ping → push (batched) → build + download bundle → verify bundle.
# Usage: ./smoke-admin.sh [8057|8082]   Local fixture credentials only.
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8057}"
BASE="http://localhost:$PORT"
ADMIN_USER="admin"
ADMIN_PASS="admin-fixture-password" # same as seed.sh
SECRET="edvora-fixture-secret"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
JAR="$WORK/jar"
C() { curl -sS -b "$JAR" -c "$JAR" "$@"; }

docker compose --profile mock up -d mock57 mocklatest >/dev/null 2>&1

C -b 'wordpress_test_cookie=WP%20Cookie%20check' -o /dev/null \
  --data-urlencode "log=$ADMIN_USER" --data-urlencode "pwd=$ADMIN_PASS" -d 'testcookie=1' "$BASE/wp-login.php"

PAGE="$WORK/page.html"
# First admin visit after activation may be redirected to a plugin welcome screen (Tutor 4.x); warm up once.
C -o /dev/null "$BASE/wp-admin/tools.php?page=edvora-migrator"
C "$BASE/wp-admin/tools.php?page=edvora-migrator" -o "$PAGE"
grep -q 'انتقال به ادوورا' "$PAGE" || { echo "FAIL: page title not Persian / page not rendered"; exit 1; }
FORM_NONCE=$(grep -o 'name="_wpnonce" value="[a-f0-9]*"' "$PAGE" | head -1 | sed 's/.*value="//; s/"//')
cfg() { python3 -c 'import json,re,sys; m=re.search(r"var EdvoraMigrator = (\{.*?\});\s*$", open(sys.argv[1]).read(), re.M); print(json.loads(m.group(1))[sys.argv[2]])' "$PAGE" "$1"; }
AJAX_NONCE=$(cfg nonce)

C -o /dev/null -d action=edvora_migrator_save -d "_wpnonce=$FORM_NONCE" \
  -d edvora_url=http://localhost:8099 -d edvora_connection=cnx_fixture --data-urlencode "edvora_secret=$SECRET" -d edvora_tenant= \
  "$BASE/wp-admin/admin-post.php"
C "$BASE/wp-admin/tools.php?page=edvora-migrator" -o "$PAGE"
if grep -q "$SECRET" "$PAGE"; then echo "FAIL: secret echoed back"; exit 1; fi
grep -q 'یک کلید ذخیره شده است' "$PAGE" || echo "WARN: stored-secret hint not found"

ajax() { C -d "action=edvora_migrator_$1" -d "nonce=$AJAX_NONCE" ${2:+-d "$2"} "$BASE/wp-admin/admin-ajax.php"; }
echo "ping:   $(ajax ping)"
echo "bad nonce (expect 403): $(C -o /dev/null -w '%{http_code}' -d action=edvora_migrator_ping -d nonce=bad "$BASE/wp-admin/admin-ajax.php")"

echo "push:   $(ajax push_start resume=)"
for _ in $(seq 1 100); do
  R=$(ajax push_step)
  echo "        $R" | cut -c1-160
  echo "$R" | grep -q '"done":true' && break
  echo "$R" | grep -q '"success":false' && { echo "FAIL: push"; exit 1; }
done

echo "bundle: $(ajax bundle_start | cut -c1-120)"
for _ in $(seq 1 100); do
  R=$(ajax bundle_step)
  echo "$R" | grep -q '"done":true' && break
  echo "$R" | grep -q '"success":false' && { echo "FAIL: bundle $R"; exit 1; }
done
DL=$(cfg downloadUrl)
C -D "$WORK/headers" -o "$WORK/site.edvora-bundle" "$DL"
grep -i 'content-disposition' "$WORK/headers"
gunzip -c "$WORK/site.edvora-bundle" > "$WORK/site.ndjson"
python3 - "$WORK/site.ndjson" "$SECRET" <<'PY'
import hashlib, hmac, json, sys
raw = open(sys.argv[1], 'rb').read()
lines = raw.split(b'\n')[:-1]
sig = json.loads(lines[-1])
body = b''.join(l + b'\n' for l in lines[:-1])
assert json.loads(lines[0])['type'] == 'manifest'
assert hmac.compare_digest(hmac.new(sys.argv[2].encode(), body, hashlib.sha256).hexdigest(), sig['value']), 'bad signature'
assert b'user_pass' not in raw and b'session_tokens' not in raw
print('download OK:', len(lines) - 2, 'records, tenant', json.loads(lines[0])['tenantSlug'])
PY
echo "temp files left: $(docker compose exec -T "$([ "$PORT" = 8057 ] && echo cli57 || echo clilatest)" sh -c 'ls /var/www/html/wp-content/uploads/ | grep edvora-migrator- | xargs -I{} ls -A /var/www/html/wp-content/uploads/{}' | tr '\n' ' ')"
echo "SMOKE OK ($BASE)"
