# PICO API contract (v1)

Base: `/api/v1`. All JSON. Money is integer minor units + ISO currency.

## Catalog (public, no auth in Sprint 1 — browsing is sign-in free)

`GET /catalog/destinations` → `{ destinations: [{code, name, kind, coveredCountries?}], supplier }`

`GET /catalog/plans?destination=FR` → `{ plans: [PlanDisclosure], supplier }`

`GET /catalog/plans/:planId` → `{ plan, supplier }` · 404 unknown

PlanDisclosure fields (spec §5 — all mandatory):
`planId, name, tier, destination, coveredDestinations[], dataAllowance, dataBytes,
validityDays, validityStarts, activationDeadlineDays, calls{included,detail},
sms{included,detail}, phoneNumber{available,detail}, hotspot, speedPolicy, fairUse,
renewal{renewable,detail}, sharedAcrossCountries, priceCents, currency`

## Orders

`POST /orders` — headers: `idempotency-key` (optional, replays same order)
```json
{ "planId": "mock-fr-everyday", "destination": "FR", "planName": "France Trip",
  "referralCode": "PICO-ABCD1234" }
```
→ 201 `{ order, payment: {paymentIntentId, clientSecret, mock, publishableKey}, orderSummary }`
Server re-derives price/tax/currency from the catalog — the client never sets price.
`referralCode` is optional; a bad code returns 400 (never silently skipped).
`orderSummary` echoes `{subtotalCents, discountCents, totalCents, referralCode}`.
Replaying a seen `idempotency-key` returns 200 `{order, replayed: true}`.

`GET /orders/:id` → `{ order: {..., esim, provisioning} }`
`esim` never contains `activation_code` (credential — authenticated channel is Sprint 2).

`POST /orders/:id/name` `{ "planName": "France Trip" }` → renamed order (spec §19.B)

## Referrals — "Give $5, Get $5"

`POST /referrals/validate` `{ "code": "PICO-ABCD1234" }`
→ `{ valid: true, discountCents: 500 }` or `{ valid: false }`

`GET /orders/:id/referral` → `{ code, creditCents, redemptionCount }`
The code (`PICO-<8>`) is issued lazily — only once the order is PAID; `code` is
`null` before payment. `creditCents` is the ledger balance (reversals included).

Rules enforced server-side (`server/src/referrals.ts`):
- Friend gets `REFERRAL_DISCOUNT_CENTS` (default 500) off — only plans priced
  above the discount are eligible.
- One redemption per order; code must exist at order creation.
- The referrer's credit posts ONLY on verified `payment_intent.succeeded`
  (ledger row, deduped by unique key) — never from the client success screen.
- Refund/cancel voids the redemption and posts a negative ledger reversal.
- Self-referral cannot be fully prevented without customer identity — one
  redemption per order is enforced; full prevention lands with accounts (Sprint 2).

### Order states

`created → (paid) provisioning → provisioned`
`created → payment_failed` · `* → refunded | canceled` · `provisioning → needs_review`

Payment, provisioning, installation and activation are separate states —
`provisioned` means the supplier issued an eSIM, NOT that internet works.

## Webhooks

`POST /webhooks/stripe` — raw body required; `stripe-signature` verified before
any processing. Events are stored durably in `webhook_events` (dedupe on
`event_id`) and acknowledged; fulfillment runs after durable receipt.

Handled types: `payment_intent.succeeded` (→ paid + enqueue provisioning +
referral credit), `payment_intent.payment_failed`, `charge.refunded`,
`payment_intent.canceled` (→ referral reversal).
Out-of-order/duplicate events are recorded but do not re-fulfill — one paid
order can never mint two eSIMs (unique constraints + supplier idempotency key).

## Dev/test-only endpoints (absent in production)

`POST /dev/simulate-payment` `{orderId, outcome}` → the signed event that Stripe
would deliver — used by tests to exercise the real verification path.

`POST /dev/confirm-payment` `{orderId, outcome}` → builds the signed event and
runs it through the real verify → durable → fulfill pipeline. This is the
mock-mode stand-in for Stripe's webhook delivery used by the app's test checkout.

## Health

`GET /health` → `{ok, billingMode: 'stripe'|'mock', supplier: 'mock'|...}`
