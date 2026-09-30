# PICO — Legal, Compliance & Risk-Control map

Master spec compliance addendum — where each section lives in the system.
Status labels match `docs/FEATURE_STATUS.md`.

## §1 Non-negotiable legal principle
**Implemented (engine) + Deferred (real approvals).**
`server/src/compliance/statuses.ts` defines the five statuses
(`APPROVED`, `APPROVED_WITH_CONDITIONS`, `REQUIRES_ADDITIONAL_VERIFICATION`,
`NOT_AVAILABLE`, `LEGAL_REVIEW_REQUIRED`). Catalog destinations and plans carry a
`compliance` decision; `POST /orders` refuses NOT_AVAILABLE markets and routes
uncertain ones to `compliance_review` (admin_events) with **no charge created**.
PICO never claims to be a carrier/MVNO — docs and UI describe provider-delivered
service.

## §2 Telecom provider requirement
`ProviderComplianceRecord` in `compliance/statuses.ts` captures every required
field (legal entity, contract status, authorized countries/services, numbering
authority, KYC, emergency limits, caller-ID rules, retention, lawful-request and
suspension procedures). `MOCK_PROVIDER` is the labeled test-mode stand-in —
`contractStatus: 'none'`. Real supplier onboarding fills this per contract.

## §3 Telephone number assignment — **hard rule enforced by design**
No numbering UI exists. `NUMBERING_COMPLIANCE.md` bans arbitrary caller-ID input
at the platform layer; caller ID may only come from provider-authorized numbers.
Sprint 4.

## §4 Country-specific numbering rules
`CountryRulePack` schema implemented (KYC, local presence, business registration,
SMS/voice availability, caller-ID restrictions, emergency, portability).
`evaluateService()` returns `REQUIRES_ADDITIONAL_VERIFICATION` /
`LEGAL_REVIEW_REQUIRED` when rules are missing or require verification —
**never auto-provisions**.

## §5 Business phone numbers
Deferred (Sprint 4). `NUMBERING_COMPLIANCE.md` records the use-type distinction
(personal/business/support/marketing/transactional/2FA/automated/high-volume)
and the rule that a foreign number never establishes legal presence.

## §6 Acceptable Use Policy
`docs/legal/AUP.md` — draft covering the full prohibited list; requires legal
review before production. Checkout displays the AUP affirmation.

## §7 Fraud and abuse detection
`RiskLevel` (LOW/MEDIUM/HIGH/BLOCKED) defined in `compliance/statuses.ts`.
Signal collection (velocity, chargebacks, provider alerts) is Sprint-level ops
work — see FEATURE_STATUS §19.D row. Classifications drive controls only, never
legal determinations.

## §8 Suspension system
**Designed**: `admin_events` audit table exists; suspension actions map to
order/account flags + provider notification. Emergency suspension is a server
flag — no app update needed. Full ops surface deferred.

## §9 Law-enforcement and legal requests
Formal workflow documented below — requests route to compliance review, never
auto-disclosed. `admin_events` is the audit trail.

## §10 Customer terms
`docs/legal/TERMS.md` — skeleton covering all required clauses; **LEGAL REVIEW
REQUIRED** before any real sale. Marketing copy audited: no "works everywhere"
claims — catalog surfaces provider-specific coverage only.

## §11 No guarantee of connectivity
**Implemented** — no 100%/guaranteed claims anywhere; plan disclosures are
per-plan provider data; UI states "data-only", coverage is per-destination.

## §12 Emergency services
**Implemented (disclosure)** — data-only plans cannot place calls including
emergency calls; stated pre-purchase on plan detail and checkout. Country rule
packs carry `emergencyCalling` per market.

## §13 Privacy
**Implemented (Sprint 1 baseline)** — no accounts, no location collection,
no analytics; orders store only plan/destination/optional name. KYC design:
data minimization, direct-to-provider transmission, retention schedules —
applies when KYC exists (Sprint 4).

## §14 Payment security
**Implemented** — Stripe-hosted card data only; server holds secrets
(`server/.env`, never committed); app receives only publishable key +
client secret. Live keys refused outside production (`config.ts` guard).

## §15 Webhook security
**Implemented + Tested** — signature verification on raw body, durable receipt,
dedupe on event_id, idempotent fulfillment, replay-safe, malformed rejected.
Client success screens never trigger provisioning or credit.

## §16 Provisioning safety
**Implemented + Tested** — exact sequence: order → payment auth → verified
webhook → **compliance check** → provisioning → provider confirmation →
activation record. Unique immutable order IDs; unique constraints prevent
duplicate eSIMs/credits.

## §17 Third-party provider liability
**Implemented** — source chips label supplier-reported data; docs and UI name
the supplier boundary (catalog/provisioning are provider data, clearly marked).

## §18 Marketing compliance
**Implemented (copy audit)** — forbidden claims list enforced in all UI copy;
coverage claims are per-plan provider data only.

---

## Legal-request workflow (§9) — procedure
1. All inbound requests (subpoena, court order, emergency, preservation,
   provider, regulatory) go to the compliance contact, logged in
   `admin_events` (actor `legal-intake`).
2. Identity and authority of the requester are verified through counsel
   before any data is touched — a claim of authority alone never suffices.
3. Preservation: order/webhook/provisioning records are immutable by design
   (append-only ledger + durable event store).
4. Disclosure happens only through the documented legal/compliance process.

## Suspension workflow (§8) — procedure
- `POST` admin suspension → order/account flagged `suspended`, provisioning
  queue refuses suspended orders, provider notified per contract procedure.
- Escalation path: suspend → human review → release or terminate.
