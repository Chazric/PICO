# Required documentation index (V2 §63)

| Spec document | File | State |
|---|---|---|
| ARCHITECTURE | `docs/ARCHITECTURE.md` | ✔ |
| SECURITY | `docs/SECURITY.md` | ✔ |
| PRIVACY | `docs/PRIVACY.md` | ✔ |
| DATA-FLOW | `docs/ARCHITECTURE.md` (shape) + `docs/PRIVACY.md` (data inventory) | ✔ combined |
| API-CONTRACT | `docs/API.md` | ✔ |
| DATABASE-SCHEMA | `server/migrations/*.sql` (canonical, versioned) | ✔ |
| ESIM-PROVISIONING | `docs/ESIM_LIFECYCLE.md` + `server/src/provisioning.ts` | ✔ |
| PAYMENT-FLOW | `docs/API.md` webhook section + `README.md` | ✔ |
| KYC-FLOW | `docs/NUMBERING_COMPLIANCE.md` (design) | scaffolded — Sprint 4 |
| TELECOM-COMPLIANCE | `docs/COMPLIANCE.md` | ✔ |
| COUNTRY-RULES | `server/src/compliance/statuses.ts` `CountryRulePack` + `docs/COMPLIANCE.md` | ✔ |
| PROVIDER-INTEGRATION | `server/src/supplier/types.ts` + `docs/API.md` | ✔ |
| FRAUD-PREVENTION | `docs/COMPLIANCE.md` §7 + `docs/THREAT_MODEL.md` | scaffolded |
| DISASTER-RECOVERY | `docs/DISASTER_RECOVERY.md` + `docs/RECOVERY.md` | ✔ |
| INCIDENT-RESPONSE | `docs/INCIDENT_RESPONSE.md` | ✔ |
| APPLE-COMPLIANCE | `docs/CAPABILITY_MATRIX.md` platform gates | ✔ merged |
| ANDROID-COMPLIANCE | `docs/CAPABILITY_MATRIX.md` platform gates | ✔ merged |
| THREAT-MODEL | `docs/THREAT_MODEL.md` | ✔ |
| LEGAL-REVIEW-REGISTER | `docs/LEGAL_REVIEW_REGISTER.md` | ✔ |
| (plus) spec originals | `docs/SPEC.md`, `docs/SPEC_V2.txt`, `docs/SPEC_V2.md` map | ✔ |

Rule: these docs update whenever architecture changes — same commit as the change.
