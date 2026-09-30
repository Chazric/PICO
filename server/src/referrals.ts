import type { DB } from './db.js';
import { now, uid } from './db.js';
import { config } from './config.js';

/**
 * "Give $5 — Get $5" referrals.
 *
 * A paid order owns one shareable code (deterministic from the order id, so
 * issuing is idempotent). A friend's order may redeem one code for a server-
 * side discount. The owner's credit posts only when the friend's payment is
 * verified by webhook — never from the client — and is revoked on refund.
 *
 * Honest limitation (documented in FEATURE_STATUS): orders have no customer
 * identity yet, so self-referral cannot be fully prevented server-side in
 * Sprint 1. One redemption per order is enforced.
 */

const PAID_STATUSES = ['provisioning', 'provisioned', 'needs_review'];

export function referralCodeFor(orderId: string): string {
  return `PICO-${orderId.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
}

function isPaid(status: string): boolean {
  return PAID_STATUSES.includes(status);
}

/** Get or lazily create the code owned by a paid order. */
export function ensureCode(db: DB, ownerOrderId: string) {
  const order = db.prepare(`SELECT id, status FROM orders WHERE id=?`).get(ownerOrderId) as
    { id: string; status: string } | undefined;
  if (!order || !isPaid(order.status)) return null;
  const code = referralCodeFor(ownerOrderId);
  db.prepare(
    `INSERT INTO referral_codes (code, owner_order_id, created_at) VALUES (?, ?, ?)
     ON CONFLICT(owner_order_id) DO NOTHING`,
  ).run(code, ownerOrderId, now());
  return db.prepare(`SELECT * FROM referral_codes WHERE owner_order_id=?`).get(ownerOrderId) as
    { code: string; owner_order_id: string; created_at: string };
}

export function lookupCode(db: DB, code: string) {
  return db.prepare(`SELECT * FROM referral_codes WHERE code=?`).get(code.trim().toUpperCase()) as
    { code: string; owner_order_id: string } | undefined;
}

/**
 * Redeem at order creation: inserts a pending redemption and returns the
 * discount to apply. Throws Error with a user-safe message when invalid.
 */
export function redeem(db: DB, redeemerOrderId: string, code: string, planPriceCents: number): number {
  const row = lookupCode(db, code);
  if (!row) throw new Error('referral code not found');
  const discount = config.referral.discountCents;
  if (planPriceCents <= discount) throw new Error('plan is not eligible for referral credit');
  db.prepare(
    `INSERT INTO referral_redemptions (redeemer_order_id, code, discount_cents, status, created_at)
     VALUES (?, ?, ?, 'pending', ?)`,
  ).run(redeemerOrderId, row.code, discount, now());
  return discount;
}

/** Post the owner's credit — called only from verified payment success. */
export function creditReferrer(db: DB, redeemerOrderId: string) {
  const r = db.prepare(
    `SELECT rr.code, rr.discount_cents, rc.owner_order_id
     FROM referral_redemptions rr JOIN referral_codes rc ON rc.code = rr.code
     WHERE rr.redeemer_order_id=? AND rr.status='pending'`,
  ).get(redeemerOrderId) as { code: string; discount_cents: number; owner_order_id: string } | undefined;
  if (!r) return;
  db.prepare(
    `UPDATE referral_redemptions SET status='credited', credited_at=? WHERE redeemer_order_id=?`,
  ).run(now(), redeemerOrderId);
  // Abuse cap (V2 §46): lifetime referral credit per customer is capped —
  // the friend's discount is unaffected; the referrer simply can't earn more.
  if (creditBalance(db, r.owner_order_id) >= config.referral.maxCreditCents) return;
  // Idempotent ledger post: UNIQUE(owner, reason, ref) makes replays no-ops.
  db.prepare(
    `INSERT INTO credit_ledger (id, owner_order_id, cents, reason, ref_order_id, created_at)
     VALUES (?, ?, ?, 'referral', ?, ?)
     ON CONFLICT(owner_order_id, reason, ref_order_id) DO NOTHING`,
  ).run(uid(), r.owner_order_id, r.discount_cents, redeemerOrderId, now());
}

/** Void a pending/credited redemption and reverse any posted credit. */
export function voidRedemption(db: DB, redeemerOrderId: string) {
  const r = db.prepare(
    `SELECT rr.status, rr.discount_cents, rc.owner_order_id
     FROM referral_redemptions rr JOIN referral_codes rc ON rc.code = rr.code
     WHERE rr.redeemer_order_id=? AND rr.status IN ('pending','credited')`,
  ).get(redeemerOrderId) as { status: string; discount_cents: number; owner_order_id: string } | undefined;
  if (!r) return;
  db.prepare(`UPDATE referral_redemptions SET status='void' WHERE redeemer_order_id=?`)
    .run(redeemerOrderId);
  if (r.status === 'credited') {
    db.prepare(
      `INSERT INTO credit_ledger (id, owner_order_id, cents, reason, ref_order_id, created_at)
       VALUES (?, ?, ?, 'referral_revoked', ?, ?)
       ON CONFLICT(owner_order_id, reason, ref_order_id) DO NOTHING`,
    ).run(uid(), r.owner_order_id, -r.discount_cents, redeemerOrderId, now());
  }
}

export function creditBalance(db: DB, ownerOrderId: string): number {
  const row = db.prepare(
    `SELECT COALESCE(SUM(cents), 0) AS total FROM credit_ledger WHERE owner_order_id=?`,
  ).get(ownerOrderId) as { total: number };
  return row.total;
}

export function redemptionCount(db: DB, ownerOrderId: string): number {
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM referral_redemptions rr
     JOIN referral_codes rc ON rc.code = rr.code
     WHERE rc.owner_order_id=? AND rr.status='credited'`,
  ).get(ownerOrderId) as { n: number };
  return row.n;
}
