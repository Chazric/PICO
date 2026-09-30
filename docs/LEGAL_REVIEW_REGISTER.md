# Legal review register

Single ledger for everything requiring professional/provider confirmation
before launch or expansion (V2 §§1, 37–39, 56). New entries are also created
automatically as `compliance_review`/`compliance_hold` admin events with the
structured `ComplianceReviewRecord`.

## Gate 0 — required before anything real can charge or provision

| # | Item | Scope | Status |
|---|---|---|---|
| L-01 | Business model + entity structure | corporate | OPEN |
| L-02 | Terms of Service | customer | DRAFT → counsel |
| L-03 | Privacy Policy | customer | OPEN |
| L-04 | Acceptable Use Policy | customer | DRAFT → counsel |
| L-05 | Refund policy | customer/consumer law per market | OPEN |
| L-06 | eSIM reseller agreement(s) | provider contracts | OPEN — pick supplier |
| L-07 | Tax treatment per launch country (VAT/GST/sales tax) | finance | OPEN |
| L-08 | Consumer-protection rules per launch country | regulatory | OPEN |
| L-09 | Trademark clearance — "PICO" (software/telecom/travel classes) | brand | OPEN — before major spend |
| L-10 | IP assignment for all developed software | corporate | OPEN |
| L-11 | Insurance review (cyber, E&O, GL, BI) | corporate | OPEN |
| L-12 | Emergency-calling disclosures wording | consumer protection | DRAFT in UI → counsel |

## Deferred until that feature area opens

| # | Item | Opens with |
|---|---|---|
| L-13 | Numbering/KYC/local-presence rules per country | Sprint 4 (telephony) |
| L-14 | Data-retention/deletion schedules + lawful-request policy | accounts/PII |
| L-15 | Sanctions/export-control screening | international sales |
| L-16 | Store legal disclosures (privacy labels, account deletion) | app-store submission |

## Rule
No regulated feature ships while its row is OPEN. "REQUIRES COMPLIANCE REVIEW"
is a valid permanent answer for a market — better to not sell than to guess.
