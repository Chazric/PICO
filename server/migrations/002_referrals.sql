-- Referral system: "Give $5 — Get $5".
-- A paid order owns one shareable code. A friend's order redeems a code for a
-- discount; the owner's credit posts only after the friend's payment verifies
-- (same rule as fulfillment — never from the client success screen).

ALTER TABLE orders ADD COLUMN referral_code TEXT;
ALTER TABLE orders ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS referral_codes (
  code TEXT PRIMARY KEY,
  owner_order_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS referral_redemptions (
  redeemer_order_id TEXT PRIMARY KEY,      -- one referral per order
  code TEXT NOT NULL,
  discount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | credited | void
  created_at TEXT NOT NULL,
  credited_at TEXT
);

-- Append-only ledger; balance = SUM(cents). Reversals are negative rows.
CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  owner_order_id TEXT NOT NULL,
  cents INTEGER NOT NULL,
  reason TEXT NOT NULL,                    -- 'referral' | 'referral_revoked'
  ref_order_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(owner_order_id, reason, ref_order_id)
);
