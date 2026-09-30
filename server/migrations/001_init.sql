-- PICO Sprint 1 schema. All ids are app-generated UUIDs/text; money is integer minor units.

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id      TEXT PRIMARY KEY,          -- Stripe event id (evt_...) or mock id
  type          TEXT NOT NULL,
  payload       TEXT NOT NULL,             -- raw JSON, kept for audit/replay
  received_at   TEXT NOT NULL,
  processed_at  TEXT,
  outcome       TEXT                       -- processed | ignored | error | pending
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key           TEXT PRIMARY KEY,
  endpoint      TEXT NOT NULL,
  resource_id   TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id                  TEXT PRIMARY KEY,
  plan_id             TEXT NOT NULL,
  destination         TEXT NOT NULL,
  amount_cents        INTEGER NOT NULL,     -- server-priced, from catalog
  currency            TEXT NOT NULL,
  tax_cents           INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL,        -- created | payment_failed | paid | provisioning | provisioned | needs_review | refunded | canceled
  payment_intent_id   TEXT UNIQUE,          -- set once PI is created
  customer_ref        TEXT,
  plan_name           TEXT,                 -- customer-facing, e.g. "France Trip"
  failure_reason      TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

-- eSIM profile is modeled separately from payment: provisioning/install/activation
-- are distinct states and must never be conflated.
CREATE TABLE IF NOT EXISTS esim_profiles (
  id                  TEXT PRIMARY KEY,
  order_id            TEXT NOT NULL UNIQUE REFERENCES orders(id),
  iccid               TEXT,
  activation_code     TEXT,                 -- SM-DP+ activation code; treat as sensitive
  smdp_address        TEXT,
  status              TEXT NOT NULL,        -- provisioning | issued | installed | active | expired
  is_mock             INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provisioning_jobs (
  id                  TEXT PRIMARY KEY,
  order_id            TEXT NOT NULL UNIQUE REFERENCES orders(id),
  status              TEXT NOT NULL,        -- queued | running | succeeded | failed | needs_reconciliation
  attempts            INTEGER NOT NULL DEFAULT 0,
  idempotency_key     TEXT NOT NULL UNIQUE, -- passed to supplier so retries don't duplicate
  last_error          TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_events (
  id                  TEXT PRIMARY KEY,
  actor               TEXT NOT NULL,
  action              TEXT NOT NULL,
  order_id            TEXT,
  detail              TEXT,
  created_at          TEXT NOT NULL
);
