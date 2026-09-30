# Incident response (V2 §54)

## Procedure

Detect → Contain → Investigate → Preserve evidence → Notify → Correct → Test → Document → Prevent recurrence.

## Practical handles that already exist

- **Contain**: kill switches — `POST /admin/flags/:key {enabled:false}` or
  `PICO_FLAG_<KEY>=off` env. A market, service, or the whole supplier can be
  switched off in seconds without an app update.
- **Investigate / preserve**: `webhook_events` (raw payloads), `order_events`
  (every transition), `admin_events` (ops + compliance actions) are append-only.
- **Notify**: provider notification is part of suspension procedure
  (COMPLIANCE.md §8); customer messaging via order status.
- **Emergency suspension**: suspend account/number/order via flags + status —
  never needs an app-store update.

## Severity guide

- **SEV1**: payments fulfilling incorrectly, secrets leaked, duplicate charges —
  kill `SUPPLIER_*`/all sales flags, rotate secrets, preserve DB.
- **SEV2**: supplier provisioning wrong/duplicating — kill `ESIM_*` for affected
  markets, reconcile `provisioning_jobs`.
- **SEV3**: degraded supplier — flags + queue absorbs; monitor `needs_review`
  orders.

## After-action template
What happened · detection path · blast radius · timeline (from order_events) ·
containment action · customer impact · fix · test added · doc updated.
