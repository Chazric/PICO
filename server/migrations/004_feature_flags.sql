-- Regulatory kill switches / feature flags (V2 spec §§18, 59).
-- Server-side flags: disabling a regulated service never requires an app update.
-- Unknown keys evaluate to DISABLED — a regulated feature is on only when
-- explicitly enabled, matching "never guess about regulated features" (§1).
CREATE TABLE IF NOT EXISTS feature_flags (
  key         TEXT PRIMARY KEY,          -- e.g. ESIM_FR_ENABLED, SUPPLIER_MOCK_ENABLED
  enabled     INTEGER NOT NULL DEFAULT 0,
  reason      TEXT,
  updated_by  TEXT NOT NULL DEFAULT 'system',
  updated_at  TEXT NOT NULL
);
