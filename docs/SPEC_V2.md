# PICO — MASTER DEVELOPMENT PROMPT V2 (received; truncated at §13)

Global Travel Connectivity, eSIM, Telecom & Travel Utility Platform.
Lead-engineering directive: telecom-grade, security-first, compliance-first,
globally scalable travel connectivity platform. Business model: connect
travelers with authorized eSIM/data/voice/SMS providers — PICO is NOT a
carrier, MVNO, numbering provider, or payment institution unless actually
authorized. Architecture must allow later expansion toward PICO-branded
connectivity / MVNO without a rewrite.

## §1 Absolute development rule — DO NOT GUESS ABOUT REGULATED FEATURES
Telecom, numbers, voice, SMS, eSIM, KYC, payments, taxes, emergency services,
privacy, sanctions, consumer protection, country regulations, numbering rules,
carrier requirements: never invent requirements or assume global legality.
Unknown → STOP that specific regulated feature, create
COMPLIANCE_REVIEW_REQUIRED documenting: jurisdiction, feature, provider,
regulatory question, information required, technical options, known risks,
required professional/provider confirmation. Feature stays disabled until
verified.
**Implemented**: `ComplianceReviewRecord`/`buildReviewRecord` in
`server/src/compliance/statuses.ts`; emitted on every compliance gate.

## §2 Product vision — the travel connectivity operating system
Tell PICO where you're going → PICO determines connectivity, plan, providers,
data needs, compatibility, activation, voice/SMS, restrictions, KYC, limits,
pricing, expiration, troubleshooting. Dramatically simpler than telecom apps.

## §3 Core UX — CURRENT CONNECTION dashboard
Country, carrier/network, connection type, data remaining, expiration, quality;
actions DATA / PHONE / MESSAGES / TRIP / SUPPORT.
**Roadmap** — needs supplier usage APIs (Sprint 3); My Plans is the seed.

## §4 "Find My Plan" — recommendation engine
Questions: destination(s), duration, data use (light/moderate/heavy), phone
number?, hotspot?, voice/SMS? → recommendation card with restrictions.
Never claim "best" without supporting criteria/data. **Roadmap (Sprint 3)**.

## §5 Trip Mode — MY TRIP itinerary
Paris → Bordeaux → Barcelona → Rome: per-destination connectivity status,
expirations, recommended actions, activation reminders. **Roadmap (Sprint 3,
overlaps original spec §19.A).**

## §6 eSIM compatibility engine
Pre-purchase checks: device model, eSIM capability, carrier lock where
available, supported countries/networks, 4G/5G, hotspot, voice/SMS, provider
restrictions, activation method. Never promise compatibility without verified
data. **Partially implemented** — honest confirmation flow Sprint 1; device-side
detection is Sprint 2 platform work.

## §7 eSIM lifecycle — formal state machine
CREATED → PAYMENT_PENDING → PAYMENT_CONFIRMED → COMPLIANCE_CHECK →
PROVISIONING → ESIM_READY → INSTALLATION_STARTED → ACTIVE → EXPIRING → EXPIRED
+ error states (PAYMENT_FAILED, PROVISIONING_FAILED, INSTALLATION_FAILED,
COMPLIANCE_FAILED, REFUND_PENDING, REFUNDED, SUSPENDED).
Every transition logged. **Implemented** — see docs/ESIM_LIFECYCLE.md for the
state mapping; `order_events` is the immutable transition log.

## §8 eSIM activation
Native install / QR / manual code / SM-DP+ / instructions / status / data-line
+ roaming guidance / APN / diagnostics — only where platform + contract permit.
**Roadmap (Sprint 2)** — activation code already stored server-side.

## §9 Provider-agnostic architecture — ConnectivityProvider abstraction
plans/pricing/coverage/provisioning/activation/balance/top-up/voice/SMS/
numbers/refunds/status/cancellation behind a common interface; add/remove
providers without rewriting the app. **Implemented** —
`server/src/supplier/types.ts` `SupplierAdapter`; mock is one implementation.

## §10 Provider routing engine
Select provider on verified data: coverage, availability, price, reliability,
activation speed, destination, data, voice/SMS, hotspot, eligibility,
restrictions. Never claim lowest price unverified. **Roadmap (Sprint 2+,
activates with second provider).**

## §11 Provider failover
Provider A fails → check transaction lock → determine whether provisioning
actually occurred → only if safe, Provider B. Never duplicate eSIMs, numbers,
charges, or refunds. **Partially implemented** — timeout reconciliation via
idempotency-key lookup already prevents duplicates; cross-provider failover
needs ≥2 providers.

## §12 Transaction idempotency
Stripe payments, webhooks, eSIM/number provisioning, top-ups, refunds, provider
calls — all idempotent. Duplicate webhooks never duplicate assets or charges.
**Implemented + tested.**

## §13+ Telephone number system … — MESSAGE TRUNCATED HERE
(the paste ended mid-sentence at "numbers may ONLY come fro…"; numbering
guardrails are already covered by docs/NUMBERING_COMPLIANCE.md and the
compliance engine's `phone_number`/`caller_id` service types)
