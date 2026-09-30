# Telecom Compliance + Numbering — Architecture Component

Status: **Defined — Sprint 4 scope (design guardrails now, implementation with telephony).**

PICO's Sprint 1 plans are **data-only** — no phone number is sold or implied. When
PICO later offers international/business phone numbers, numbering becomes a
regulated telecom activity and is treated as a first-class compliance component,
not a UI feature.

## Number issuance gate

Before issuing ANY number, the numbering service MUST determine and record:

1. **Country of the number** — numbering plan authority and its rules.
2. **Customer location** — where the customer is physically/jurisdictionally located.
3. **Legal use** — whether the number can legally serve the requested purpose
   (SMS, voice, business use, emergency calling) in that pairing.
4. **Identity/KYC** — customer identity or business verification where the
   destination country or use case requires it.
5. **Legitimate right to use** — evidence the customer may use the number
   (allocation to their account, porting authorization, reseller rights).

## Caller ID — hard rule

**PICO never lets a customer type an arbitrary phone number and present it as
caller ID.** Caller ID may only be:

- a number allocated to the customer through the issuance gate above, or
- a number the carrier/telecom provider has explicitly authorized for that customer.

Unauthorized caller-ID manipulation is blocked at the platform layer, not by
policy text. This single rule is what separates a compliant numbering product
from a fraud vector.

## Audit and enforcement

- **Audit trail**: every number assignment, authorization, and usage decision is
  logged (who, what, when, legal basis).
- **Automatic suspension**: numbers linked to fraud, impersonation, spam, or
  prohibited activity are suspended automatically, with a review path.
- **Country rule packs**: per-country rules for numbering allocation, KYC,
  business use, SMS restrictions, emergency-service obligations, and local
  presence requirements — data-driven, not hard-coded per request.

## Honest claims

- Never promise a foreign number works for every business purpose. Some
  countries/services restrict numbering, registration, SMS, caller ID,
  emergency services, or local presence — the app must surface the specific
  restriction for the customer's country + use case before purchase.
- No number is shown as "yours" until the issuance gate has actually passed
  (same provenance discipline as eSIM status: supplier-reported vs verified).

## Implementation notes

- Numbering is a separate bounded context (`numbering/` adapter + rules engine),
  same adapter pattern as `supplier/` — real carrier partner (e.g. a CPaaS with
  regulatory coverage: Twilio/Vonage/MessageBird-class) behind the interface,
  mock adapter for test mode.
- Fraud controls (spec §19.D) hook the audit trail: velocity on issuance,
  mismatched location/billing alone is NOT grounds for denial, but combined
  with other signals triggers review — and review blocks issuance until resolved.
