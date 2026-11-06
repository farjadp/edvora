# ADR 003 — Every outside service behind an adapter with a mock

**Status:** accepted (2026-11-06)

## Decision
`packages/integrations` defines interfaces (`PaymentProvider`, `SmsProvider`; next: video, live). Each has a real
adapter (Zarinpal, Kavenegar) and a **mock**. The provider is chosen by env (`PAYMENT_PROVIDER`, `SMS_PROVIDER`);
a tenant can bring its own gateway credentials (`tenants.zarinpalMerchantId`) so money goes straight to the academy.

- Mock payment is stateless (amount encoded in the authority) and uses `/pay/mock` as a fake bank page.
- Mock SMS logs to the server and, in dev only, shows the OTP on the login screen.
- Provider responses are parsed with Zod; failures raise `IntegrationError`.

## Consequences
Developers and agents build and test the full money path with no accounts. Swapping Zarinpal for IDPay is a new
adapter + env change.
