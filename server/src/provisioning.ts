import type { DB } from './db.js';
import { now, uid } from './db.js';
import type { SupplierAdapter } from './supplier/types.js';
import { SupplierTimeout } from './supplier/types.js';
import type { MockSupplier } from './supplier/mock.js';

const MAX_ATTEMPTS = 3;

/**
 * Durable provisioning queue (in-process worker over a persisted table).
 * Payment, provisioning, installation and activation are separate states:
 * a paid order creates a queued job; only a succeeded job issues an eSIM profile.
 */
export class Provisioner {
  constructor(private db: DB, private supplier: SupplierAdapter) {}

  enqueue(orderId: string, idempotencyKey: string): void {
    this.db.prepare(
      `INSERT INTO provisioning_jobs (id, order_id, status, idempotency_key, created_at, updated_at)
       VALUES (?, ?, 'queued', ?, ?, ?)
       ON CONFLICT(order_id) DO NOTHING`,
    ).run(uid(), orderId, idempotencyKey, now(), now());
  }

  /** Process one queued/needs_reconciliation job for an order. Returns final job status. */
  async processOrder(orderId: string): Promise<string> {
    const job = this.db.prepare(`SELECT * FROM provisioning_jobs WHERE order_id = ?`).get(orderId) as any;
    if (!job || job.status === 'succeeded') return job?.status ?? 'none';
    const order = this.db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId) as any;
    if (!order) return 'failed';

    this.db.prepare(`UPDATE provisioning_jobs SET status='running', attempts=attempts+1, updated_at=? WHERE id=?`)
      .run(now(), job.id);
    try {
      const res = await this.supplier.provision({
        orderId, planId: order.plan_id, idempotencyKey: job.idempotency_key,
      });
      this.db.transaction(() => {
        this.db.prepare(
          `INSERT INTO esim_profiles (id, order_id, iccid, activation_code, smdp_address, status, is_mock, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'issued', ?, ?, ?)
           ON CONFLICT(order_id) DO NOTHING`,
        ).run(uid(), orderId, res.iccid, res.activationCode, res.smdpAddress, res.isMock ? 1 : 0, now(), now());
        this.db.prepare(`UPDATE provisioning_jobs SET status='succeeded', updated_at=? WHERE id=?`).run(now(), job.id);
        this.db.prepare(`UPDATE orders SET status='provisioned', updated_at=? WHERE id=?`).run(now(), orderId);
      })();
      return 'succeeded';
    } catch (err) {
      if (err instanceof SupplierTimeout) {
        // A timeout does not prove failure: reconcile before retrying.
        const existing = await this.supplier.lookupProvision(job.idempotency_key);
        if (existing) {
          this.db.transaction(() => {
            this.db.prepare(
              `INSERT INTO esim_profiles (id, order_id, iccid, activation_code, smdp_address, status, is_mock, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'issued', ?, ?, ?)
               ON CONFLICT(order_id) DO NOTHING`,
            ).run(uid(), orderId, existing.iccid, existing.activationCode, existing.smdpAddress, existing.isMock ? 1 : 0, now(), now());
            this.db.prepare(`UPDATE provisioning_jobs SET status='succeeded', updated_at=? WHERE id=?`).run(now(), job.id);
            this.db.prepare(`UPDATE orders SET status='provisioned', updated_at=? WHERE id=?`).run(now(), orderId);
          })();
          return 'succeeded';
        }
        const next = job.attempts + 1 >= MAX_ATTEMPTS ? 'needs_reconciliation' : 'queued';
        this.db.prepare(`UPDATE provisioning_jobs SET status=?, last_error=?, updated_at=? WHERE id=?`)
          .run(next, String(err), now(), job.id);
        this.db.prepare(`UPDATE orders SET status='needs_review', updated_at=? WHERE id=?`).run(now(), orderId);
        return next;
      }
      this.db.prepare(`UPDATE provisioning_jobs SET status='failed', last_error=?, updated_at=? WHERE id=?`)
        .run(String(err), now(), job.id);
      this.db.prepare(`UPDATE orders SET status='needs_review', failure_reason=?, updated_at=? WHERE id=?`)
        .run(`provisioning failed: ${String(err)}`, now(), orderId);
      return 'failed';
    }
  }
}

/** Narrow the supplier type only where test hooks are needed. */
export function asMock(s: SupplierAdapter): MockSupplier | null {
  return s.name === 'mock' ? (s as unknown as MockSupplier) : null;
}
