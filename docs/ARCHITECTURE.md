# PICO architecture

## Shape

```
Flutter app (iOS/Android/web)            TypeScript backend (Express)
┌───────────────────────────┐   HTTP    ┌──────────────────────────────┐
│ Travel / My Plans / Help  │ ────────► │ catalog → orders → webhooks  │
│ order_store (local JSON)  │           │ provisioning queue → eSIM    │
└───────────────────────────┘           │ compliance engine + flags    │
                                        │ referrals + credit ledger    │
                                        └──────────┬───────────────────┘
                                        better-sqlite3 (WAL, transactions)
                                        supplier adapter │ billing adapter
                                          (mock now)     │ (mock / Stripe)
```

## Trust boundaries (non-negotiable)

- The device **never** declares payment success — fulfillment comes only from a
  verified, signed webhook durably stored first.
- The server prices every order; the app never sends amounts.
- Regulated features fail CLOSED: unknown compliance status, unknown flag, or
  unknown market = not offered, routed to `compliance_review`.
- Secrets exist only server-side (`server/.env`); the app holds at most the
  publishable key + ephemeral client secret.
- SM-DP+ activation codes are credentials: stored, excluded from default API
  reads, never logged.

## Layers that must survive growth (V2 §9/§65)

- `SupplierAdapter` — catalog, provisioning, lookup; real providers plug in
  without touching the app.
- `BillingAdapter` — payment intents + webhook verify/parse; Stripe now,
  interchangeable.
- `compliance/` — country × service evaluation; the gate every regulated
  feature passes through.
- `flags` — per-service/country/provider kill switches, server-side.
- `order_events` — append-only lifecycle log; the audit backbone.

## Data model (migrations 001–004)

orders · esim_profiles · provisioning_jobs · webhook_events ·
idempotency_keys · admin_events · order_events · referral_codes ·
referral_redemptions · credit_ledger · feature_flags

Every write that must not duplicate is backed by a UNIQUE constraint —
deduplication is structural, not a code promise.
