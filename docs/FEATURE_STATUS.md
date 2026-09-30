# Feature status — end of Sprint 1

Labels: **Implemented** (working code) · **Tested** (automated coverage) ·
**Mocked** (simulated, clearly labeled) · **Provider-dependent** (needs real
keys/capabilities) · **Deferred** (later sprint per spec §17).

| Feature | Status | Notes |
|---|---|---|
| Three tabs: Travel / My Plans / Help | Implemented + Tested | Widget tests cover all three |
| Destination browse without sign-in | Implemented + Tested | |
| Plan browsing (Light/Everyday/Heavy + view-all) | Implemented + Tested | Mock catalog: FR, JP, US, EU38 region |
| Full plan disclosures (price, allowance, validity, calls/SMS, hotspot, renewal…) | Implemented + Tested | All spec §5 fields surfaced |
| Compatibility guidance | Implemented | Customer-confirmed checks; no fabricated "Unlocked"/"eSIM-capable" |
| Information provenance labels (device/supplier/customer/unknown) | Implemented | `SourceChip` UI component |
| Server-priced orders + idempotency keys | Implemented + Tested | |
| Order summary (products, total, taxes, future charges, terms) | Implemented | Tax = $0 placeholder pending jurisdiction rules (§16) |
| Stripe PaymentIntent flow | Implemented + Tested | Mock adapter when no `sk_test_` key; real `StripeBilling` wired |
| Stripe Payment Sheet (client) | Provider-dependent | `flutter_stripe` dependency present; guarded path — needs `pk_test_` key + platform config |
| Webhook signature verification (raw body) | Implemented + Tested | Real HMAC scheme; mock secret in test mode |
| Durable webhook receipt + dedup | Implemented + Tested | `webhook_events` table |
| Provisioning queue + retries + timeout reconciliation | Implemented + Tested | Supplier timeout ≠ failure: reconcile via `lookupProvision` |
| Mock provisioning (explicit, labeled) | Implemented + Tested | `is_mock` flag on every eSIM profile |
| Duplicate/out-of-order event protection | Implemented + Tested | One paid order can never mint two eSIMs |
| Refund/cancel state handling | Implemented + Tested | |
| Referral "Give $5, Get $5" (code, checkout discount, credit ledger) | Implemented + Tested | Credit posts only on verified payment; revoked on refund. Spending accrued credit waits for accounts |
| Plan naming ("France Trip") | Implemented + Tested | spec §19.B |
| My Plans contextual next action + honest unavailable data | Implemented + Tested | spec §19.C |
| "I can't connect" guided checks | Implemented | spec §10 |
| Connection check (small, customer-triggered, consent for larger tests) | Implemented | spec §19.E — explain-it's-limited copy included |
| Compliance engine (5 statuses, per-country gating, review routing) | Implemented + Tested | `server/src/compliance/` — see docs/COMPLIANCE.md |
| Acceptable Use Policy + Terms skeletons | Drafted | docs/legal/ — require legal review before production |
| Emergency-calling disclosure | Implemented | Data-only plans state they cannot place calls incl. emergency calls |
| Lifecycle transition log (immutable) | Implemented + Tested | `order_events` + `transitionOrder()` — V2 §7; see docs/ESIM_LIFECYCLE.md |
| Structured compliance-review records | Implemented | `ComplianceReviewRecord` — V2 §1's 8 documented fields on every gate |
| Feature flags / regulatory kill switches | Implemented + Tested | `feature_flags` + `/admin/flags` — no app update needed (V2 §§18,59) |
| Pricing margin floor | Implemented + Tested | `costCents` + `PICO_MIN_MARGIN_PCT` — discounts can't sell below floor (V2 §44) |
| Referral abuse cap | Implemented | `REFERRAL_MAX_CREDIT_CENTS` lifetime cap (V2 §46) |
| Admin compliance view | Implemented | `GET /admin/compliance`, token-gated (V2 §19) |
| Secret scanning in CI | Implemented | gitleaks job (V2 §§30,61) |
| Offline receipts/instruction caching | Deferred | Sprint 3 |
| CURRENT CONNECTION dashboard (V2 §3) | Deferred | Sprint 3 — needs supplier usage/carrier reporting; My Plans is the seed |
| "Find My Plan" recommendation engine (V2 §4) | Deferred | Sprint 3 — needs real catalog breadth first |
| Provider routing + failover (V2 §§10-11) | Deferred | Sprint 2+ — needs ≥2 real providers; timeout reconciliation already live |
| Real eSIM supplier integration | Deferred | Sprint 2 — adapter interface in `server/src/supplier/types.ts` |
| Arrival Assist (checklist, QR/manual install, SM-DP+ display) | Deferred | Sprint 2; activation code stored, not surfaced yet |
| Multi-country Trip Mode | Deferred | Sprint 3 (spec §19.A — after first supplier is reliable) |
| Usage reporting / top-ups | Deferred | Sprint 3 — My Plans honestly says "not available yet" |
| Telephony (calls/texts/numbers) | Deferred | Sprint 4 — never implied by UI; guardrails in docs/NUMBERING_COMPLIANCE.md |
| Fraud/abuse controls (velocity, risk review) | Deferred | spec §19.D — Stripe Radar config + limits are ops work |
| Optional PICO assistant | Deferred | spec §19.F — after guided flows are reliable |
| App Attest / Play Integrity | Deferred | spec §14 — needs provider setup |
| Auth/accounts | Deferred | Guest checkout first; purchase recovery pending |
| iOS/Android native builds & signing | Deferred | No Xcode/Google Play access on this machine |

## Test results (Sprint 1)

- Backend: **27/27 vitest** — catalog disclosure completeness, server pricing,
  destination/plan mismatch, idempotent order creation, unsigned/rejected
  webhooks, duplicate delivery (1 eSIM), failed payment (no provisioning),
  unknown-payment events stored, out-of-order refund-then-success, supplier
  timeout reconciliation without duplication, plan renaming, referral code
  issuance/validation/discount, credit-only-on-verified-payment, double-credit
  prevention, bad-code rejection, refund reversal, compliance gating
  (unauthorized service rejected, unknown market → review, catalog statuses),
  immutable lifecycle transition log, kill-switch order blocking (market +
  supplier), admin auth, margin-floor referral rejection.
- App: **4/4 widget tests** — three tabs, browse→plans→detail flow with
  disclosure + mock labeling, My Plans honesty + referral card, Help "I can't connect".

## Required before anything real can charge or provision

0. **Professional legal review of the actual business model and contracts** —
   telephone numbers, voice/SMS, eSIM, KYC, privacy, consumer protection,
   taxes, and every launch country. PICO must not launch regulated services
   (or claim compliance) on engineering work alone. See docs/COMPLIANCE.md.
1. Stripe **test** keys: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`,
   `STRIPE_WEBHOOK_SECRET` in `server/.env` (never commit real `.env`).
2. `flutter_stripe` platform setup (iOS `Stripe.podspec`, Android `PaymentConfiguration` + theme).
3. A real supplier contract + adapter implementing `server/src/supplier/types.ts`.
4. App signing/toolchain (Xcode, Play Console) — outside this environment.
5. GitHub-side hardening once the repo exists (V2 §31): protected main, PR
   reviews, Dependabot, secret scanning — CI workflow already in-repo.
