# Runbook — Demo deploy on Railway (E-025)

**Demo / test only.** Railway is a US cloud. Seed data and mock providers only: no real students, no real payment or
SMS keys, no IBA client content (ADR 002) — except the gated `web-iba` preview (ADR 002 exception, E-030). Client production moves to an Iranian host later (E-005, E-018).

| | |
| --- | --- |
| Project | `edvora-demo` (Railway workspace "Farjad Pourmohammad's Projects"), environment `production` |
| Services | `web` (this repo, `Dockerfile`; volume `web-volume` at `/data` for private uploads) · `Postgres` (Railway Postgres template, **Postgres 18**, volume `postgres-volume`) |
| URL | https://web-production-39ee1.up.railway.app (Railway-generated, no custom domain) |
| Tenant | `demo` only — via `DEFAULT_TENANT_SLUG=demo` (any unknown host falls back to it) |
| Admin | `/admin`, email `admin@edvora.demo`, password = Railway variable `SEED_ADMIN_PASSWORD` on `web` |

> ⚠️ Railway may be unreachable from inside Iran without a VPN. Don't plan an Iranian client demo on this URL without
> testing from Iran first.

## How it's built

- **Dockerfile** (repo root), not Railpack: a pnpm + Turborepo monorepo with workspace TS packages, `sharp` and a
  pinned Node version builds the same way everywhere with a Dockerfile, and the same image will run on an Iranian host
  later. Railpack's monorepo detection would be one more thing to debug.
- Next.js `output: 'standalone'` traced from the repo root (`apps/web/next.config.ts`) → small runtime image, starts
  with `node apps/web/server.js`. Next reads `PORT` (Railway sets `8080`) and `HOSTNAME=0.0.0.0`.
- No BuildKit cache mounts: Railway requires a service-ID prefix on cache ids, which would tie the Dockerfile to Railway.
- `railway.json`: Dockerfile builder, healthcheck `/` (120 s), restart on failure (5 retries).
- **Migrations run on boot**: `NODE_ENV=production` → Payload applies `apps/web/src/migrations` (`prodMigrations`).
  Never let dev `push` touch this DB.

## Variables (`web` service)

Set with `railway variables --service web --set KEY=value`. Values live only in Railway — never in git, docs or chat.
Read them in the dashboard: project `edvora-demo` → `web` → **Variables**, or `railway variables --service web`.

| Key | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (private network reference) |
| `PAYLOAD_SECRET`, `SESSION_SECRET` | `openssl rand -hex 32` each |
| `NEXT_PUBLIC_SITE_URL` | `https://web-production-39ee1.up.railway.app` |
| `DEFAULT_TENANT_SLUG` | `demo` |
| `PAYMENT_PROVIDER`, `SMS_PROVIDER` | `mock` (never change on Railway) |
| `SEED_TENANTS` | `demo` (seed skips `iba`) |
| `SEED_ADMIN_EMAIL` | `admin@edvora.demo` |
| `PRIVATE_UPLOADS_DIR` | `/data/submission-files` — student assignment files on the `web-volume` volume (ADR 009) |
| `RAILWAY_RUN_UID` | `0` — Railway volumes mount as root; the image's `nextjs` user can't write to them otherwise |
| `STAFF_2FA_REQUIRED` | not set (= off). Keep off on the demo until Farjad says otherwise (ADR 007) |
| `SEED_ADMIN_PASSWORD` | generated; read it from Railway |

## First-time setup (already done — repeat for a new project)

```bash
railway init --name edvora-demo
railway add --database postgres
railway add --service web
railway domain --service web                          # prints the generated URL
railway variables --service web --skip-deploys \
  --set "PAYLOAD_SECRET=$(openssl rand -hex 32)" --set "SESSION_SECRET=$(openssl rand -hex 32)" \
  --set "SEED_ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=')" \
  --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' --set PAYMENT_PROVIDER=mock --set SMS_PROVIDER=mock \
  --set NEXT_PUBLIC_SITE_URL=https://<domain> --set DEFAULT_TENANT_SLUG=demo --set SEED_TENANTS=demo \
  --set SEED_ADMIN_EMAIL=admin@edvora.demo
```

Private uploads volume (CLI 5.49 panics on `--service web`; pass the service and environment **IDs** from
`railway status`):

```bash
railway volume --service <web-service-id> --environment <environment-id> add --mount-path /data
railway variables --service web --set PRIVATE_UPLOADS_DIR=/data/submission-files --set RAILWAY_RUN_UID=0
```

Then **seed before the first deploy** (the healthcheck `/` needs a tenant), see below, then `railway up --service web`.

## Seed / migrate (from your machine)

Do this **before every deploy that adds a migration** (new files in `apps/web/src/migrations`), not only the first
time: the seed also re-syncs role templates per academy (e.g. E-022 added `users.2fa.reset` to academy admins; the
migration alone doesn't touch role data) and adds new demo data (E-026 quiz, assignment, dripped lessons).

Postgres has no public port by default. Open a temporary TCP proxy, back up, migrate + seed, close it:

```bash
railway tcp-proxy create --service Postgres --port 5432      # note the endpoint host:port; wait until ACTIVE
eval "$(railway variables --service Postgres --kv | grep -E '^(PGUSER|PGPASSWORD|PGDATABASE)=' | sed 's/^/export /')"
export PGHOST=<endpoint-host> PGPORT=<endpoint-port>
pg_dump --format=custom --no-owner --no-acl -f edvora-demo-$(date +%Y%m%d-%H%M).dump   # backup first (pg_dump ≥ 18)
cd apps/web
eval "$(railway variables --service Postgres --kv | grep -E '^(PGUSER|PGPASSWORD|PGDATABASE)=' | sed 's/^/export /')"
railway run --service web -- env NODE_ENV=production \
  DATABASE_URL="postgresql://$PGUSER:$PGPASSWORD@<endpoint>/$PGDATABASE" \
  node_modules/.bin/tsx src/seed/run.ts                      # applies migrations, then seeds demo only
railway tcp-proxy list --service Postgres                    # get the proxy id
railway tcp-proxy delete --service Postgres <id>
```

`NODE_ENV=production` matters: it makes Payload apply the committed migrations instead of dev schema push. The seed
is idempotent (upserts by natural key). It does **not** change an existing admin's password.

Check: `psql -Atc "select name from payload_migrations order by id"` lists every migration file.

## IBA client preview (E-030) — approved 2026-11-06 as an exception to ADR 002

Shows the `iba` tenant (IBA's public site, imported) for the client meeting. Railway allows one generated domain per
service, so it runs as a **second service, `web-iba`**: same repo and database, `DEFAULT_TENANT_SLUG=iba`, its own
`*.up.railway.app` domain and volume. `web` (the `demo` tenant) is untouched. Every host of `web-iba` is `noindex`
and behind HTTP basic auth (`src/proxy.ts`, `PRIVATE_PREVIEW_HOSTS=*`).

| `web-iba` variable | Value |
| --- | --- |
| `DATABASE_URL`, `PAYLOAD_SECRET`, `SESSION_SECRET` | references to `web` (`${{web.…}}`) — same DB and sessions |
| `DEFAULT_TENANT_SLUG` | `iba` |
| `NEXT_PUBLIC_SITE_URL` | `https://<iba-host>` |
| `PAYMENT_PROVIDER` / `SMS_PROVIDER` | `mock` |
| `MEDIA_DIR` | `/data/media` (volume `web-iba-volume` at `/data`; `RAILWAY_RUN_UID=0`) |
| `PRIVATE_PREVIEW_HOSTS` | `*` |
| `PRIVATE_PREVIEW_USER` | `iba` |
| `PRIVATE_PREVIEW_PASSWORD` | **set by Farjad** (dashboard → `web-iba` → Variables); send it to the client yourself |

Setup (done by the E-030 session except the password):
```bash
railway add --service web-iba
railway variables --service web-iba --set 'DATABASE_URL=${{web.DATABASE_URL}}' --set 'PAYLOAD_SECRET=${{web.PAYLOAD_SECRET}}' \
  --set 'SESSION_SECRET=${{web.SESSION_SECRET}}' --set DEFAULT_TENANT_SLUG=iba --set PAYMENT_PROVIDER=mock --set SMS_PROVIDER=mock \
  --set MEDIA_DIR=/data/media --set RAILWAY_RUN_UID=0 --set 'PRIVATE_PREVIEW_HOSTS=*' --set PRIVATE_PREVIEW_USER=iba
railway volume --service <web-iba-service-id> --environment <environment-id> add --mount-path /data
railway domain --service web-iba                    # → <iba-host>; then set NEXT_PUBLIC_SITE_URL
railway up --service web-iba --detach               # from the repo root on the E-030 branch (applies the E-030 migration)
```
The E-030 migration adds columns/tables to the shared DB; the older `web` build ignores them.

**Import** (Farjad, from your machine — needs the super-admin password and the preview password). Use the TCP-proxy
steps from *Seed / migrate* (backup first), then:
```bash
cd apps/web
railway run --service web -- env NODE_ENV=production \
  DATABASE_URL="postgresql://$PGUSER:$PGPASSWORD@<endpoint>/$PGDATABASE" \
  IBA_MEDIA_API_URL=https://<iba-host> IBA_MEDIA_API_BASIC='iba:<preview password>' \
  IBA_MEDIA_API_EMAIL=<super-admin email> IBA_MEDIA_API_PASSWORD='<super-admin password>' \
  node_modules/.bin/tsx src/seed/import-iba.ts
```
Rows go into the DB directly; images are uploaded through `web-iba`'s API onto its volume. Idempotent — re-run freely.
Don't run `src/seed/run.ts` with `SEED_TENANTS=iba` afterwards unless you re-run the import.

**Verify:** `curl -sI https://<iba-host>/` → `401`; with `-u iba:<password>` → `200` + `x-robots-tag: noindex`, title
«آکادمی برند ایران». `https://web-production-39ee1.up.railway.app/` still shows the demo academy with no auth.
Before the meeting, open `<iba-host>` from where the client will connect (Iranian IPs may be blocked).

**Remove after the meeting:** delete the `web-iba` service (and its volume) in the dashboard. The `iba` rows in the
shared DB are unreachable without it; delete them only with Farjad's approval.

## Deploy / redeploy

```bash
railway up --service web --detach        # from the repo root; uploads the working tree (respects .gitignore)
railway logs --service web --build       # build logs
railway logs --service web               # runtime logs
```

Deploy from a clean checkout of the branch you mean to ship. New migrations in `apps/web/src/migrations` apply on boot.

## Verify

```bash
railway run --service web -- env SMOKE_BASE_URL=https://web-production-39ee1.up.railway.app E2E_NO_SERVER=1 \
  pnpm e2e deployed-smoke
```

Checks: home + course page are the demo tenant (no IBA text), OTP login with the on-screen mock code, mock checkout
(`TEST20`, 4 instalments → ۳٬۸۴۰٬۰۰۰ تومان → `partial`), `/verify?code=ED-MGT-001`, admin API login + `/admin`.

Also check by hand: `/staff/login` loads (staff desk, E-022); the seeded demo student `09129990001` (mock OTP) sees
`/learn/demo-program` and its quiz page; `/files/submissions/1` without login → 401;
`railway ssh --service web -- touch /data/submission-files/.t` succeeds (volume writable).

## Rollback

Dashboard → `web` → **Deployments** → pick the last good deployment → **Redeploy** (or `railway redeploy` for the
latest). Migrations are not rolled back automatically: if the bad deploy added one, restore the DB from a dump
(below) or write a down-migration. For a demo DB, re-seeding a fresh Postgres is also acceptable.

## Rotate secrets

```bash
railway variables --service web --set "PAYLOAD_SECRET=$(openssl rand -hex 32)" --set "SESSION_SECRET=$(openssl rand -hex 32)"
```

Setting variables redeploys. Effect: every admin and student session is logged out; nothing else breaks.
Admin password: change it in `/admin` (account page) and update `SEED_ADMIN_PASSWORD` to match, or the variable
becomes misleading. Postgres password: regenerate in the Postgres service settings; `web` picks it up through the
`${{Postgres.DATABASE_URL}}` reference on redeploy.

## Move the DB out (to client production / a better host)

Payload + Postgres only, so this is a plain dump/restore. Railway runs **Postgres 18**: dump with `pg_dump` 18+ and
restore into Postgres 18+ (a custom-format dump from 18 won't restore into 16; use `--format=plain` and check it if you
must go down a version).

```bash
railway tcp-proxy create --service Postgres --port 5432
pg_dump --format=custom --no-owner --no-acl "postgresql://USER:PASS@<endpoint>/DB" -f edvora-demo.dump
railway tcp-proxy delete --service Postgres <id>
pg_restore --no-owner --no-acl --dbname "postgresql://…new-host…/edvora" edvora-demo.dump
```

Then point the new app at it with the same `PAYLOAD_SECRET` (or rotate and accept logouts). The
`payload_migrations` table comes along, so the new app only applies newer migrations. Uploaded media are on the
container's disk (`apps/web/media`), not in Postgres — the demo has none; production needs object storage (MinIO / S3
compatible, Iranian provider) before real uploads. Student submission files live on `web-volume` (`/data`), also not
in Postgres: copy them too (`railway ssh --service web -- tar czf - -C /data submission-files > submissions.tgz`),
or restored submissions point at missing files (ADR 009). Keep dumps and archives out of git and delete them when done.

## Cost

Railway is usage-based (CPU, RAM, volume, egress) on Farjad's plan. One small Next.js service plus Postgres is a
low-usage demo; check the project's **Usage** page monthly. Added: the project, Postgres, and one small volume for
private uploads (`web-volume`, billed by GB used; approved for the demo). No custom domain, no replicas, no add-ons. Delete the project when the demo is no longer needed.

## Known limits

- Public media uploads (`media`) are lost on redeploy (container disk). Fine for the demo; don't upload real files.
  Private submission files persist on `web-volume`.
- The container runs as root (`RAILWAY_RUN_UID=0`) so it can write to the volume. Acceptable for the demo; on the
  production host mount the uploads directory owned by uid 1001 instead.
- Mock OTP codes appear on screen and in runtime logs — by design for the demo, never for production.
- No email adapter: Payload writes emails (e.g. password reset) to the logs.
- `railway.json` (config as code) is deprecated by Railway; existing files keep working until **2026-12-01**. Before
  then run `railway config migrate` or move these settings to the dashboard.
