import Database from 'better-sqlite3';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));

export type DB = Database.Database;

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db: DB) {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const dir = join(here, '..', 'migrations');
  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map(r => r.name),
  );
  for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (applied.has(f)) continue;
    db.transaction(() => {
      db.exec(readFileSync(join(dir, f), 'utf8'));
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(f, now());
    })();
  }
}

export const now = () => new Date().toISOString();
export const uid = () => randomUUID();

/**
 * Move an order to a new status and log the transition (V2 spec §7: every
 * state change is an immutable event). Returns false when the order is missing
 * or `from` is set and the current status isn't in it — the caller then treats
 * the transition as a no-op (duplicate/out-of-order event).
 */
export function transitionOrder(
  db: DB,
  orderId: string,
  to: string,
  opts: { from?: string[]; failureReason?: string; actor?: string; detail?: string } = {},
): boolean {
  const row = db.prepare(`SELECT status FROM orders WHERE id=?`).get(orderId) as
    | { status: string } | undefined;
  if (!row || (opts.from && !opts.from.includes(row.status))) return false;
  const sets = [`status=?`, `updated_at=?`];
  const vals: unknown[] = [to, now()];
  if (opts.failureReason !== undefined) { sets.push(`failure_reason=?`); vals.push(opts.failureReason); }
  vals.push(orderId);
  db.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id=?`).run(...vals);
  db.prepare(`INSERT INTO order_events (id, order_id, from_status, to_status, actor, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(uid(), orderId, row.status, to, opts.actor ?? 'system', opts.detail ?? null, now());
  return true;
}
