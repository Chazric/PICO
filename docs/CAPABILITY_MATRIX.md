# Capability matrix — what PICO can and cannot verify

Per spec §6/§15/§19.B: every claim is classified. Nothing below is asserted
without the listed evidence source.

| Claim | Source of truth | Sprint 1 state |
|---|---|---|
| Plan catalog, prices, coverage, allowances | Supplier-reported | Mock supplier (labeled) |
| Payment succeeded | Stripe-verified webhook (device never trusted) | Implemented — mock signature in test mode |
| eSIM issued | Supplier provisioning result | Mocked (`is_mock=1`) |
| eSIM installed on device | Device-verified | Not available — needs platform eSIM APIs (Sprint 2) |
| eSIM activated / registered on network | Supplier or device | Not reliably available — guided checks + customer confirmation instead |
| Carrier-lock status | Device-verified | Not exposed by Flutter — "Not sure" path + illustrated check (customer-confirmed) |
| eSIM hardware support | Device-verified | Customer-confirmed via illustrated check |
| Selected data SIM / roaming setting | Device-verified | Not exposed cross-platform — guided steps (customer-confirmed) |
| Internet reachability | Device-verified (small check) | Implemented — explicitly disclaimed: proves SOME connection, not that PICO carries it |
| Remaining allowance / usage | Supplier-reported | Deferred to Sprint 3 — UI says "not available yet", never fabricated |
| Local phone number, calls, SMS | Supplier-reported | Not in catalog — UI states data-only, never implies a number; emergency calling explicitly disclosed as unavailable |
| Caller ID / number issuance | Provider-authorized only | Not offered; arbitrary caller-ID input banned by design (docs/NUMBERING_COMPLIANCE.md) |
| Market eligibility per country | Compliance engine | Implemented — explicit status per destination; unknown markets route to review, never auto-sold |
| Direct eSIM install | Capability-gated | Off — QR/manual path is the Sprint 2 default |
| Multi-network roaming, zero-data access, background usage, native calls/SMS, Live Activities | Capability-gated | All off (spec §15) |

## Compliance statuses (master spec §1)

`APPROVED` · `APPROVED_WITH_CONDITIONS` · `REQUIRES_ADDITIONAL_VERIFICATION` ·
`NOT_AVAILABLE` · `LEGAL_REVIEW_REQUIRED` — evaluated per country × service in
`server/src/compliance/statuses.ts`; see docs/COMPLIANCE.md for the full map.

## Platform gates

- **iOS**: eSIM install UX needs `CTCellularPlanProvisioning` — entitlement-gated, Sprint 2.
- **Android**: `EuiccManager` APIs available on most devices; still Sprint 2.
- On this build machine neither platform SDK exists — native validation is listed under remaining requirements.
