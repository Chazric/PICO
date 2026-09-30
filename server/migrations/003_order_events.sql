-- Lifecycle transition log (V2 spec §7): every order state change is recorded
-- as an immutable event. This is the audit trail for compliance, disputes, and
-- legal requests — order status must never change without a row here.
CREATE TABLE IF NOT EXISTS order_events (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id),
  from_status TEXT,                       -- NULL for the initial 'created'
  to_status   TEXT NOT NULL,
  actor       TEXT NOT NULL DEFAULT 'system',
  detail      TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id);
