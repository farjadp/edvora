#!/usr/bin/env bash
# Pushes a fixture bundle to a local Edvora through the real push API (see push-to-local.ts). Local only.
set -euo pipefail
cd "$(dirname "$0")/../../apps/web"
exec pnpm exec tsx ../../integrations/wordpress-dev/push-to-local.ts "$@"
