# V2 spec → implementation map

Full verbatim spec: `docs/SPEC_V2.txt` (68 sections).

## Implemented in Sprint 1 code

| § | Item | Where |
|---|---|---|
| 1 | COMPLIANCE_REVIEW_REQUIRED + 8-field record | `server/src/compliance/statuses.ts` → `buildReviewRecord`, stored in `admin_events` |
| 7 | Lifecycle state machine + logged transitions | `order_events` + `transitionOrder()`; mapping in `ESIM_LIFECYCLE.md` |
| 9 | Provider-agnostic `ConnectivityProvider` | `server/src/supplier/types.ts` `SupplierAdapter` |
| 11 | Failover safety (reconcile before retry) | `Provisioner.processOrder` — `lookupProvision` by idempotency key |
| 12 | Idempotency everywhere | `idempotency_keys` + UNIQUE constraints + dedupe |
| 14 | Country compliance engine (5 statuses) | `compliance/statuses.ts` + catalog/order gates |
| 16 | Acceptable Use Policy | `docs/legal/AUP.md` (draft) |
| 17 | Risk levels LOW/MEDIUM/HIGH/BLOCKED | `RiskLevel` in `statuses.ts` |
| 18 | Regulatory kill switch (no app update) | `server/src/flags.ts` + `POST /admin/flags/:key` + `PICO_FLAG_*` env |
| 19 | Compliance admin center (API) | `GET /admin/compliance` — markets, provider record, open reviews |
| 26/27 | Stripe flow, never trust client | implemented + tested (webhook-verified only) |
| 28 | Webhook security | signature + durable receipt + dedupe + retry-safe |
| 30 | Zero-trust secrets | server-only `.env`, CI secret scan, nothing in app/logs |
| 44 | Pricing engine margin floor | `costCents` on plans + `PICO_MIN_MARGIN_PCT` order-time check |
| 46 | Referral system + abuse caps | `referrals.ts` + `REFERRAL_MAX_CREDIT_CENTS` |
| 59 | Feature flags | `feature_flags` table, seeded per §59 + per-market `ESIM_*` |
| 63 | Required docs | see `DOCS_INDEX.md` |

## Roadmap (deferred, per V2 §62 phase plan)

| § | Item | Sprint |
|---|---|---|
| 3 | CURRENT CONNECTION dashboard | 3 (needs supplier usage data) |
| 4 | Find My Plan engine | 3 |
| 5 | Trip Mode | 3 |
| 6 | Device-side compatibility checks | 2 (platform APIs) |
| 8 | Native/QR/SM-DP+ activation UX | 2 |
| 10 | Provider routing engine | 2+ (needs ≥2 providers) |
| 13 | Telephone number system | 4 — guardrails: `NUMBERING_COMPLIANCE.md` |
| 15 | Business number protection | 4 |
| 20 | AI concierge | 3+ (rules first, never overrides compliance) |
| 21 | Data Guardian | 3 (needs usage reporting) |
| 22/23 | Network monitoring / multi-network failover | 3+ (capability-gated, honest claims) |
| 24/52 | Zero-data / offline-first | 3 |
| 25 | Lost/stolen device mode | with auth/accounts |
| 29 | Auth, RBAC, App Attest, Play Integrity | 5 |
| 31 | GitHub hardening (protected main, reviews, Dependabot) | on repo creation |
| 32/33 | Env separation, sandbox-first | enforced via `.env.*` + config guards |
| 34 | Cloud DB, encryption, PITR | production infra decision |
| 35 | KYC providers | 4/5 |
| 36 | Privacy program (retention, deletion, export) | `PRIVACY.md` scaffolded |
| 37/38 | Legal entity, trademark clearance | pre-launch business work — see `LEGAL_REVIEW_REGISTER.md` |
| 39 | Customer terms (professional docs) | `docs/legal/` drafts → counsel |
| 40 | Support center (ticketing, escalation) | 3+ |
| 41/42 | Business accounts + invoicing | 6 |
| 43 | i18n (10 languages, RTL) | 7 — strings externalize from day 1 |
| 45 | Subscriptions (FREE/PLUS/PRO) | 6+ — never required for basic plans |
| 47 | Marketing-claims discipline | enforced in all copy — ongoing |
| 48–51 | Store compliance, iOS/Android native, widgets | platform sprints |
| 53/54 | Observability, incident response | `INCIDENT_RESPONSE.md` scaffolded |
| 55 | Backups/DR | `DISASTER_RECOVERY.md` scaffolded |
| 56 | Insurance review | pre-launch business work |
| 57 | Admin dashboard (UI) | 6 — API surface started |
| 58 | Audit log | `order_events` + `admin_events` + `webhook_events` live |
| 60/61 | Test + security-testing program | vitest suite + gitleaks in CI; pen-test pre-launch |
| 64 | Cost control — staged build | honored: mock-first, abstraction layers only where migration is plausible |
| 65 | MVNO path | design allows it; explicitly a separate future project |
| 66/67 | Product principles | embodied in honest-claims + compliance-first architecture |
