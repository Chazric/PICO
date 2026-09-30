# Privacy by design (V2 §36)

## Personal data inventory — what exists today

| Field | Purpose | Location | Retention | Shared with |
|---|---|---|---|---|
| order id (UUID) | transaction identity | server DB | life of order + audit window | supplier (order ref) |
| plan / destination | the purchase | server DB + device cache | same | supplier |
| plan_name | customer's own label ("France Trip") | server DB | same | nobody |
| payment_intent_id | payment reconciliation | server DB | same | Stripe |
| referral code / ledger | referral attribution | server DB | same | nobody |
| webhook payloads | fulfillment + audit | server DB | audit window | nobody |

Deliberately NOT collected in Sprint 1: accounts/emails/passwords, location,
device identifiers, analytics identifiers, identity documents.

## Rules

- **Data minimization** — nothing is collected "because it might be useful".
- **KYC (when it arrives, Sprint 4/5)**: documents travel directly to the KYC
  provider; PICO stores only status + provider ID + timestamp. Never in logs.
- **Retention/deletion**: orders + events are the audit trail — retention
  schedule to be set with counsel before production; deletion must not break
  financial records (anonymize PII, keep ledger facts).
- **Local device data** (`order_store.json`): user's own order ids + labels —
  no identifiers; encrypted at rest when a real store ships (V2 §52).
- **Exports/deletion workflows**: designed here, built with accounts.

## Required before launch

Privacy Policy, Data Retention Policy, deletion + export workflows (legal
review — `LEGAL_REVIEW_REGISTER.md`).
