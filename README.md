# PICO

A simple international travel eSIM and connectivity app for iOS and Android.
**Current stage: Sprint 1 — everything runs in test mode. No real charging, no real eSIMs.**

## Layout

| Path | What |
|---|---|
| `app/` | Flutter app (iOS + Android), three tabs: Travel, My Plans, Help |
| `server/` | TypeScript Node/Express backend: catalog, orders, Stripe webhook, provisioning |
| `docs/` | Specification, API contract, capability matrix, feature status, recovery |
| `assets/` | Approved PICO artwork (navy app icon, mascot) |

## Quick start (local test mode)

No credentials are required — missing Stripe keys automatically select the
clearly-labeled mock billing adapter, and the supplier adapter is always `mock`
in Sprint 1.

```bash
# Backend (Node 20+)
cd server
npm install
cp .env.example .env          # placeholders only — works as-is in mock mode
npm run dev                   # http://localhost:4242
npm test                      # webhook/fulfillment test suite
npm run typecheck

# App (Flutter stable)
cd app
flutter pub get
flutter run --dart-define=API_BASE=http://localhost:4242
flutter test
```

## What works end-to-end in test mode

Travel tab → pick a destination → browse three plans (Light/Everyday/Heavy)
with full disclosures → confirm compatibility (customer-confirmed, honestly
labeled) → order summary → *test* payment → signed webhook → durable order →
mock provisioning → eSIM appears in My Plans → rename it ("France Trip").

The full payment path is real: orders are server-priced, a PaymentIntent-shaped
object is created, and fulfillment only happens after a **verified, signed
webhook** is durably recorded and deduplicated — exactly like production Stripe,
except the signature is made by the local test secret instead of Stripe.
`POST /api/v1/dev/confirm-payment` (dev only) stands in for Stripe delivering
that webhook.

## What is mocked (never hidden)

- `supplier=mock` — catalog and provisioning are simulated (`is_mock` on every eSIM profile).
- `billingMode=mock` — no real charge is possible without `sk_test_` keys.
- Activation codes (SM-DP+) are stored but not displayed yet (credentials handling is Sprint 2).

See `docs/FEATURE_STATUS.md` for the Implemented/Tested/Mocked/Provider-dependent/Deferred labels.
