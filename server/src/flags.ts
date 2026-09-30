import type { DB } from './db.js';
import { now, uid } from './db.js';
import type { ServiceType } from './compliance/statuses.js';

/**
 * Feature flags / regulatory kill switches (V2 spec §§18, 59).
 *
 * Every regulated capability has an independent server-side flag. A flag is
 * OFF unless a row says ON — unknown keys evaluate disabled, never assumed.
 * An emergency kill that bypasses even the DB is available via env:
 * `PICO_FLAG_<KEY>=off` takes precedence over the stored row.
 */

export type FlagScope = ServiceType | 'supplier' | 'feature';

export const flagKey = (name: string, scope?: string): string =>
  scope ? `${name.toUpperCase()}_${scope.toUpperCase()}_ENABLED`
        : `${name.toUpperCase()}_ENABLED`;

/** V2 §59's named flags, seeded off — each is a Sprint 2+ capability. */
export const DEFAULT_FLAGS: Record<string, boolean> = {
  AI_CONCIERGE_ENABLED: false,
  TRIP_MODE_ENABLED: false,
  LIVE_ACTIVITY_ENABLED: false,
  VOICE_NUMBERS_ENABLED: false,
  SMS_ENABLED: false,
  AUTO_TOP_UP_ENABLED: false,
  KYC_ENABLED: false,
  BUSINESS_MODE_ENABLED: false,
  NETWORK_MONITORING_ENABLED: false,
  PROVIDER_FAILOVER_ENABLED: false,
};

/** Seed default + per-market eSIM + supplier flags (insert-if-missing only). */
export function seedFlags(db: DB, countryCodes: string[], supplierName: string): void {
  const ins = db.prepare(
    `INSERT INTO feature_flags (key, enabled, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO NOTHING`,
  );
  for (const [key, on] of Object.entries(DEFAULT_FLAGS)) ins.run(key, on ? 1 : 0, now());
  for (const code of countryCodes) ins.run(flagKey('esim', code), 1, now());
  ins.run(flagKey('supplier', supplierName), 1, now());
}

/** Unknown or absent flag = disabled (fail closed, V2 §1). Env `off` wins. */
export function isEnabled(db: DB, key: string): boolean {
  const env = process.env[`PICO_FLAG_${key}`];
  if (env === 'off' || env === '0') return false;
  const row = db.prepare(`SELECT enabled FROM feature_flags WHERE key=?`).get(key) as
    | { enabled: number } | undefined;
  return row?.enabled === 1;
}

export function setFlag(
  db: DB, key: string, enabled: boolean, reason: string | null, actor: string,
): void {
  db.prepare(
    `INSERT INTO feature_flags (key, enabled, reason, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       enabled=excluded.enabled, reason=excluded.reason,
       updated_by=excluded.updated_by, updated_at=excluded.updated_at`,
  ).run(key, enabled ? 1 : 0, reason, actor, now());
  db.prepare(
    `INSERT INTO admin_events (id, actor, action, order_id, detail, created_at)
     VALUES (?, ?, 'flag_change', NULL, ?, ?)`,
  ).run(uid(), actor, JSON.stringify({ key, enabled, reason }), now());
}

export function listFlags(db: DB) {
  return db.prepare(`SELECT key, enabled, reason, updated_by, updated_at
    FROM feature_flags ORDER BY key`).all();
}
