# Runbook — SMS reminders worker (E-016, ADR 020)

The worker is a route: `POST /api/cron/reminders` with `Authorization: Bearer $REMINDERS_CRON_SECRET`. It is safe to
call as often as you like (one send per reminder per recipient, ever). Call it every **10 minutes**.

## Env (service `web`)

| Variable | Value |
| --- | --- |
| `SMS_REMINDERS_ENABLED` | `false` until Farjad approves real sends (Kavenegar contract + keys). `true` = the worker runs. Anything else = it answers `{"ok":true,"disabled":true}` and does nothing. |
| `REMINDERS_CRON_SECRET` | `openssl rand -hex 32` (≥ 24 chars). Unset = the route answers 404. |
| `REMINDERS_E2E_HOOKS` | never set on Railway (test-only clock override). |
| `SMS_PROVIDER` | stays `mock` until the contract is signed. Sandboxes and `demo` always use the mock anyway. |

Each academy also switches reminders on itself: **تنظیمات ← یادآورهای پیامکی** (off by default; `demo` is on in the seed).

## Railway cron (do not create without Farjad's go-ahead)

`web` and `web-iba` share one database, so **one** cron calling `web` covers every academy. Same pattern as the
sandbox cleanup cron (see `deploy-railway.md`):

```bash
railway add --service reminders-cron --image curlimages/curl:8.10.1   # check flags: railway add --help
railway variables --service reminders-cron --set 'TARGET=https://<web-host>/api/cron/reminders' \
  --set 'REMINDERS_CRON_SECRET=${{web.REMINDERS_CRON_SECRET}}'
```

Dashboard: `reminders-cron` → Settings → **Cron Schedule** `*/10 * * * *`, **Start command**
`sh -c 'curl -fsS -X POST -H "Authorization: Bearer $REMINDERS_CRON_SECRET" "$TARGET"'`, restart policy **Never**.
On an Iranian host later: a crontab line with the same curl.

## Check by hand

```bash
curl -X POST -H "Authorization: Bearer $REMINDERS_CRON_SECRET" https://<web-host>/api/cron/reminders
```

`{"ok":true,"tenants":2,"sent":0,"skipped":0,"deferred":0,"failed":0,"dead":0,"retried":0,"duplicates":0,"errors":[]}`.
`500` with `errors` = one academy's run failed (logged as `[reminders] <slug> <rule>`); the others still ran and the
next call retries. `409 busy` = the previous call is still running in that process.

## Reading the send log

`/admin/collections/sms-log` (permission `notifications.view`). Status:

| status | meaning |
| --- | --- |
| `sent` | provider accepted it (`providerMessageId`) |
| `failed` | will retry at `nextAttemptAt` (5 → 15 → 45 min, max 4 tries) |
| `dead` | gave up (max tries or the reminder expired) |
| `skipped` | not sent on purpose: `opted-out`, `no-mobile`, `inactive`, `expired` |
| `unknown` | the process died mid-send; not retried (it may have gone out) |

Quiet hours (default 21:00–08:00 Tehran) write nothing; the first run after them sends.

## Turning it off fast

Set `SMS_REMINDERS_ENABLED=false` on `web` (redeploys) — or switch the academy off in its settings (immediate).
