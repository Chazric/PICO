# eSIM lifecycle — state machine (V2 spec §7)

Every transition is logged immutably in `order_events` (migration 003) via
`transitionOrder()` in `server/src/db.ts`. Order status can never change
without an audit row. `GET /orders/:id` returns `events[]` — the full trail.

## V2 states → implementation mapping

| V2 state | PICO state (orders.status) | Notes |
|---|---|---|
| CREATED | `created` | order + PaymentIntent created, unpaid |
| PAYMENT_PENDING | `created` | client_secret issued; waiting on webhook |
| PAYMENT_CONFIRMED | transition `created→provisioning` | only via verified signed webhook |
| COMPLIANCE_CHECK | inline gate inside the provisioning transition | V2's explicit step; runs after verified payment, before provider call |
| COMPLIANCE_FAILED | `needs_review` + `compliance_hold` admin_event | structured ComplianceReviewRecord attached |
| PROVISIONING | `provisioning` + provisioning_jobs row | durable queue, idempotency-keyed |
| ESIM_READY | `provisioned` + esim_profiles row (status `issued`) | |
| PROVISIONING_FAILED | `needs_review` + failed job | supplier timeout → `needs_reconciliation`, never assumed failed |
| INSTALLATION_STARTED | esim_profiles `installed` | Sprint 2 — needs platform install UX |
| ACTIVE | esim_profiles `active` | Sprint 3 — needs supplier activation reporting |
| EXPIRING / EXPIRED | esim_profiles `expired` | Sprint 3 — driven by plan validity + supplier data |
| PAYMENT_FAILED | `payment_failed` | order recoverable — customer retries payment |
| REFUND_PENDING | `refunded` (event-ordered) | refund initiated by provider-side op; webhook records it |
| REFUNDED | `refunded` | triggers referral-credit reversal |
| SUSPENDED | designed — `suspended` flag path | COMPLIANCE.md §8; server flag, no app update needed |
| INSTALLATION_FAILED | designed | Sprint 2 install flow |

## The rule that matters most

`created → provisioning` is reachable ONLY from a verified, signed webhook —
the device can never move an order into fulfillment. `provisioning →
provisioned` is reachable ONLY from a confirmed supplier result (or a
reconciled one after timeout). A paid order is not an installed eSIM; an
installed eSIM is not a working connection.
