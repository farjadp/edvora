#!/usr/bin/env bash
# Export signed fixture bundles from the seeded sites into packages/integrations/src/wordpress/fixtures/.
# Usage: ./export-fixture.sh [wp57|latest|all]   (run ./seed.sh first)
set -euo pipefail
cd "$(dirname "$0")"

SECRET="edvora-fixture-secret"   # fixture-only secret, also used by the TS importer tests
CONNECTION="cnx_fixture"
TENANT="demo"
OUT_DIR="../../packages/integrations/src/wordpress/fixtures"
STACK="${1:-all}"

export_one() { # cli service, fixture name
  local cli=$1 name=$2
  echo "==> exporting $name"
  docker compose exec -T "$cli" wp edvora-migrator export \
    --secret="$SECRET" --connection="$CONNECTION" --tenant="$TENANT" \
    --out="/fixtures/$name.edvora-bundle"
  gunzip -c "$OUT_DIR/$name.edvora-bundle" > "$OUT_DIR/$name.ndjson"
  verify "$OUT_DIR/$name.ndjson"
}

verify() { # basic checks on the decompressed NDJSON
  local f=$1
  python3 - "$f" "$SECRET" <<'PY'
import hashlib, hmac, json, sys, collections
path, secret = sys.argv[1], sys.argv[2].encode()
raw = open(path, 'rb').read()
lines = raw.split(b'\n')
assert lines[-1] == b'', 'file must end with \\n'
lines = lines[:-1]
first, last = json.loads(lines[0]), json.loads(lines[-1])
assert first['type'] == 'manifest' and first['formatVersion'] == 1, 'line 1 must be the manifest'
assert last['type'] == 'signature' and last['alg'] == 'HMAC-SHA256', 'last line must be the signature'
body = b''.join(l + b'\n' for l in lines[:-1])
expected = hmac.new(secret, body, hashlib.sha256).hexdigest()
assert hmac.compare_digest(expected, last['value']), 'signature mismatch'
kinds = collections.Counter(json.loads(l)['kind'] for l in lines[1:-1])
assert dict(kinds) == {k: v for k, v in first['counts'].items() if v}, ('counts mismatch', dict(kinds), first['counts'])
for banned in (b'user_pass', b'user_activation_key', b'session_tokens', b'_application_passwords', b'NOT-IN-ALLOWLIST'):
    assert banned not in raw, 'forbidden data in bundle: %s' % banned.decode()
print('OK', path, sum(kinds.values()), 'records')
for k, v in kinds.items():
    print('  %-24s %d' % (k, v))
PY
}

if [ "$STACK" = "wp57" ] || [ "$STACK" = "all" ]; then export_one cli57 sample-wp57; fi
if [ "$STACK" = "latest" ] || [ "$STACK" = "all" ]; then export_one clilatest sample-latest; fi
