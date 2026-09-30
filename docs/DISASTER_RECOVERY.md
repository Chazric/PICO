# Backups & disaster recovery (V2 §55)

## Current state (honest)
SQLite file `server/data/pico.sqlite` (WAL). Dev-level durability only — no
automated backups yet. See RECOVERY.md for operator recovery steps.

## Targets for production
- Managed database with encryption at rest, automated backups, and
  point-in-time recovery.
- RPO ≤ 5 min (order/payment data), RTO ≤ 1 hour for API service.
- Quarterly restore drills: restore to a scratch env, verify
  `orders`/`webhook_events` counts and one end-to-end replay.
- Webhook replay as reconstruction: `webhook_events.payload` lets
  fulfillment be re-derived for any gap window.

## What must survive any disaster
Immutable ledgers — `order_events`, `credit_ledger`, `webhook_events`,
`admin_events`. Loss of these = loss of financial + compliance truth.

## Provider outage procedure
Supplier down ≠ failed orders: jobs sit `queued`/`needs_reconciliation`,
orders stay `provisioning`/`needs_review`, flag `SUPPLIER_<name>` off to stop
new sales, reconcile on recovery via `lookupProvision`.
