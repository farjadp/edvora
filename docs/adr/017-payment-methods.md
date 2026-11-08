# ADR 017 — Payment methods: gateways, Tether, card-to-card, manual, with four-eyes approval

**Status:** accepted (2026-11-08). Decisions by Farjad, 2026-11-08: Tether is built but off by default with a manual
rate; card-to-card and manual payments need two people. Real provider contracts and keys need his approval.

## Context
Until now there was one payment path: an online gateway (Zarinpal, or the mock) chosen by `PAYMENT_PROVIDER`, with
attempts stored in `orders.payments`. PR #44 (ACC-02/03) locked order money fields and refused marking an order paid
by hand, because offline payments had no safe path. Iranian academies take money in several ways: Shaparak bank
gateways (Mellat, Saman), intermediary gateways (Zarinpal, Zibal, IDPay, Pay.ir, NextPay), card-to-card transfers,
cash/POS at the office and, for some, USDT. Each academy picks its own methods and accounts.

## Decision

### 1. One `payments` collection; orders stay locked
- Every new attempt — gateway, Tether, card-to-card, manual — is a row in a new tenant-owned `payments` collection
  (order, student, method, instalment indexes, amount in rials, status, evidence, who recorded/confirmed/rejected).
  `orders.payments` stays as read-only history (imported WordPress orders and attempts made before this change).
- Nobody writes `payments` through REST or `/admin` (`create/update/delete: nobody`). Rows change only in server code
  that has already checked tenant, user and permission: the gateway callback, the student's submit actions and the
  finance desk actions. Order money fields keep PR #44's lock; only `applyConfirmedPayment` (server) marks
  instalments paid, and the order status follows from the instalments.
- **Amounts are computed by the server**: a payment covers whole unpaid instalments (`instalmentIndexes`), and its
  amount is their sum. The student or staff never type an amount. An instalment with a payment waiting for review
  cannot be paid again until that one is rejected (no double payment).
- **Reuse is refused by the database**: `reuseKey` is unique across all academies — `gw:<provider>:<authority>`,
  `ref:<provider>:<refId>`, `tx:<network>:<hash>`, `card:<tenant>:<tracking>`.

### 2. Status machine
`started → (gateway verified | chain verified) → confirmed`
`submitted → recorded → confirmed`, and `submitted | recorded → rejected`; `started → failed`.
- `started`: gateway redirect or a Tether quote waiting for a hash.
- `submitted`: the student sent evidence (card-to-card details, a tx hash that could not be verified on-chain).
- `recorded`: a staff member (`payments.manual.record`) checked it against the bank statement / wallet, or recorded a
  cash/POS/transfer payment themselves. One person has vouched for it.
- `confirmed`: a **different** staff member (`payments.manual.approve`) confirmed it. Only now are instalments paid.
- `rejected`: with a required reason the student sees. `failed`: the gateway or the chain said no.

### 3. Four-eyes (ADR 006)
Rules live in `packages/core/src/payments.ts` (`checkPaymentAction`) and are tested:
- record needs `payments.manual.record`; confirm and reject need `payments.manual.approve` (reject is also allowed with
  `record`, because refusing money is the safe direction);
- the confirmer is never the recorder; nobody records or confirms a payment on their **own** order;
- online gateway payments and on-chain-verified Tether need no person: the provider's verification is the second
  check.
We keep the existing catalog keys `payments.manual.record` / `payments.manual.approve` (already in roles and
templates; renaming would need a data migration) and add `payments.settings` (method configuration and credentials).
Templates: academy admin has all; finance has record + approve (two finance people are needed to confirm); advisor
keeps record only. Every action writes an audit-log row (recorded, confirmed, rejected, chain-verified, gateway
verified/failed, method settings changed, with secrets redacted).

### 4. Per-academy method settings (`payment-methods`, Payload `/admin`)
One row per academy × method: on/off, order, Persian display name, sandbox/live, help text, and per kind:
gateway credentials (merchant id, terminal id, username, password, API key), card numbers (number, holder, bank),
USDT wallet per network and the **toman per USDT rate set by hand** (no rate feed), manual channels.
- Credentials are sealed with AES-256-GCM (`sealSecret`, key `PAYMENT_SECRETS_KEY`, falling back to
  `PAYLOAD_SECRET`) in a `beforeChange` hook, stored in one hidden `credentialsSealed` field with field read access
  `false`, and never returned by REST, GraphQL or the admin. The admin sees which keys are set (`credentialsSet`) and
  types a new value to replace one; an empty input keeps the stored value.
- Access: `payments.settings` (academy admin). Tenant-scoped through the multi-tenant plugin.
- With no rows, an academy falls back to the instance gateway (`PAYMENT_PROVIDER`), so nothing changes for academies
  that have not configured methods.

### 5. Gateways (`packages/integrations/src/payment/`)
One `PaymentGateway` interface: `createPayment` returns a GET or POST redirect (Mellat and Saman need a form POST, so
the app renders a same-site page that posts the form — no external script), `parseCallback` reads query + form body,
`verify` returns ref id, card pan and the amount the gateway reports. Adapters: Mellat (SOAP bpPayRequest / verify /
settle), Saman SEP (token + VerifyTransaction), Zarinpal v4, Zibal, IDPay, Pay.ir, NextPay, plus the mock. Each has
fetch-mocked unit tests. The callback must match order, attempt and amount (`checkGatewayResult`): a gateway that
reports a different amount than the attempt is a failure, even if it says "paid".
`PAYMENT_PROVIDER=mock` replaces every gateway with the mock gateway, so the demo and CI need no accounts; the
method's display name is still the academy's.

### 6. Tether (USDT TRC20 / BEP20) — off by default
- Disabled unless an academy turns it on and ticks the legal acknowledgement. The admin screen and the docs say
  plainly: Iran's Central Bank does not allow crypto as a payment method inside Iran; the academy decides after its
  own legal check.
- Quote: `usdtQuote(rials, rialPerUsdt)` rounds **up** to the cent, so the academy never receives less; stored on the
  payment as an integer in the token's smallest unit (string of a bigint: TRC20 has 6 decimals, BEP20 18, which
  overflows a JS number). The checkout shows wallet, exact amount and a QR code (server-rendered SVG).
- The student submits the tx hash. `ChainVerifier` (TronGrid; BscScan/Etherscan-v2-compatible API; key from env)
  returns the token transfers of that tx; `checkUsdtTransfer` requires: tx succeeded, right network and token
  contract, recipient = academy wallet, amount ≥ quote, confirmations ≥ minimum (TRC20 19, BEP20 15), tx not older
  than the quote, hash unused anywhere. Pass → confirmed with no human. A definite mismatch → failed with a reason
  the student sees. Not yet confirmed → waiting (the student can check again). **Verifier unavailable** (no key,
  API down) → `submitted`, and it goes to the four-eyes queue like a card-to-card payment.
- `CHAIN_VERIFIER=mock` (default when `PAYMENT_PROVIDER=mock`) is deterministic by the hash's first hex digit for
  tests and the demo.

### 7. Student side
After checkout (and from the dashboard) the student lands on `/pay/<order>`: the next unpaid instalment and only the
enabled methods, in the academy's order. Card-to-card shows the card numbers and asks for the last 4 digits, tracking
number, time and an optional receipt image (private upload, ADR 009). Each submission ends on `/payments/<id>`, a
calm Persian status page: waiting, confirmed, rejected with the reason, or failed. All forms follow ADR 005
(`{ redirectTo }`, no `redirect()` from actions).

### 8. Staff side (finance desk, `/staff/finance`)
A queue of payments waiting for a person (submitted, recorded) with record / confirm / reject; a form to record a
manual payment against an order (next instalment, or all remaining); per-order payment history at
`/staff/payments/orders/<id>`. Buttons a person may not use are not offered, and the server checks again.

## Consequences
- New tables: `payment_methods` (+ cards, wallets arrays), `payments` (+ instalment indexes), migration
  `e045_payment_methods`. Permission catalog grows by `payments.settings`.
- Real gateways and the chain APIs are coded against their published APIs and tested with mocked HTTP only. Before
  going live each needs a merchant contract, sandbox run and Farjad's approval; the adapters' request/response shapes
  must be checked against the provider's current docs at that time.
- Card-to-card and cash need two staff members per academy. An academy with one finance person must give a second
  person (e.g. the academy admin) `payments.manual.approve`.
- Refunds are out of scope (`refunds.*` keys exist; flow not built).
