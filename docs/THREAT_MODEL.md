# Threat model (working draft)

## Assets
payment integrity · eSIM profiles/activation codes · customer credit ledger ·
order/audit records · provider credentials · compliance standing.

## Threats → controls

| Threat | Control today | Residual gap |
|---|---|---|
| Client fakes "payment succeeded" | Verified signed webhook only; client never fulfills | none in Sprint 1 flow |
| Webhook replay / duplicate delivery | Durable receipt + event_id dedupe + idempotent fulfillment | none |
| Replay of order creation | Idempotency-Key + idempotency_keys table | none |
| Supplier timeout → duplicate eSIM | Reconcile via idempotency-key lookup; UNIQUE(order_id) on profiles | none |
| Cross-provider double-provisioning | Transaction lock semantics documented; needs 2nd provider | deferred |
| Selling into an unauthorized market | Compliance gate + flag kill switch; fail closed | real provider data needed |
| Caller-ID spoofing (future) | Banned by design — only provider-authorized numbers | numbering Sprint 4 |
| Referral credit farming | Verified-payment-only credit, refund reversal, lifetime cap, one redemption/order | self-referral needs accounts |
| Secret leakage | Server-only env, gitleaks CI, no secrets in app/logs | org secret management pending |
| Admin API abuse | Token-gated endpoints; audit-logged flag changes | shared token → SSO later |
| API flooding | none yet | rate limiting required before exposure |
| Vendor lock / single supplier | Adapter interface; failover needs ≥2 providers | deferred |

## Out of scope for code to solve
Legal authorization, sanctions screening, contract terms — handled by process
(compliance review records + legal register), never by code alone.
