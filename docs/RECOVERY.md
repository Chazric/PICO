# Recovery instructions

## Payment succeeded but no eSIM arrived

1. Check order state: `GET /api/v1/orders/:id`.
   - `provisioning` — still working, wait.
   - `needs_review` — supplier timed out or errored; reconcile first (below).
   - `provisioned` but `esim` missing — data issue, escalate.
2. Supplier-timeout reconciliation: the provisioner automatically calls
   `lookupProvision(idempotency_key)` before retrying — a timeout never proves
   failure and a retry never duplicates an eSIM (unique `order_id` on
   `esim_profiles` + supplier idempotency).
3. To re-drive a stuck job: re-call `provisioner.processOrder(orderId)` —
   safe to repeat; it is idempotent at every stage.
4. Refund path: deliver a `charge.refunded` event (or Stripe refund) — order
   moves to `refunded`; a late `succeeded` event cannot resurrect it (tested).

## Webhook issues

- Signature failures return 400 and store nothing — check `STRIPE_WEBHOOK_SECRET`
  and that the raw body is unmodified (proxy/middleware must not re-encode JSON).
- Duplicates are deduplicated on `event_id` — safe for Stripe to retry; respond
  200 after durable receipt so Stripe stops retrying.
- Fulfillment errors after durable receipt return 500 → Stripe will retry.
  The event row remains (`outcome='error'`) for replay after the fix.

## Duplicate charge / duplicate order concern

- `POST /orders` honors `idempotency-key` — retries return the same order.
- `orders.payment_intent_id` and `provisioning_jobs.order_id` are UNIQUE —
  structural protection against double fulfillment.
- `esim_profiles.order_id` is UNIQUE — one eSIM per paid order, enforced by the DB.

## Mobile app stuck on "Preparing your plan"

Polls every 2s until `provisioned`/`needs_review`. If the backend restarts,
order state is durable in SQLite (`server/data/pico.sqlite`) — restart the
server and the poll resumes with no data loss.

## Credentials needed for real (non-mock) mode

See `docs/FEATURE_STATUS.md` §Required. Missing Stripe keys automatically fall
back to the labeled mock billing adapter — never silently charge.
