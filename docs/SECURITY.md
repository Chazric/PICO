# Security posture

## Implemented

- **Webhook pipeline**: signature verification on raw body → durable receipt →
  dedupe on event_id → idempotent fulfillment. Malformed → 400, fulfillment
  errors → 500 (safe for sender retry). Client success screens never fulfill.
- **Idempotency**: `Idempotency-Key` header on order creation, UNIQUE keys on
  provisioning jobs, ledger entries, eSIM profiles.
- **Admin auth**: `/api/v1/admin/*` requires `x-admin-token`; token required in
  production (server refuses to boot without it).
- **Secret hygiene**: keys only in `server/.env` (gitignored); app code has no
  secrets; CI runs gitleaks; activation codes excluded from API reads/logs.
- **Live-key guard**: `sk_live_` outside production = boot refusal.
- **Audit**: `order_events`, `admin_events`, `webhook_events` — append-only.
- **Least privilege (flags)**: regulated capabilities are OFF unless a flag
  explicitly enables them; `PICO_FLAG_*` env provides an emergency kill that
  outranks the DB.

## Honest gaps (Sprint 1, documented not hidden)

- No customer auth/accounts — orders are anonymous records; purchase recovery
  and session management are designed but not built (needs accounts).
- CORS is permissive (`*`) for local dev — must be locked to known origins.
- SQLite is single-writer embedded — fine for dev/test; production needs a
  managed DB with encryption, backups, PITR.
- No rate limiting yet — add before any public exposure (express-rate-limit or
  edge WAF).
- Admin token is a shared secret — production needs SSO/individual actors.
