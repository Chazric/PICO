import type { Deps } from './app.js';
import { now, uid, transitionOrder } from './db.js';
import { SupplierCancelRefused } from './supplier/types.js';
import * as referrals from './referrals.js';

export class RefundError extends Error {
  constructor(public status: number, msg: string) { super(msg); this.name = 'RefundError'; }
}

/**
 * Cancel an order's eSIM at the supplier (refunding our wholesale cost), then
 * refund the customer's payment and mark the order refunded. Safe to retry: a
 * canceled profile is not canceled twice and the Stripe refund is idempotent.
 */
export async function cancelAndRefund(
  deps: Deps, orderId: string, opts: { actor: string; reason?: string | null },
): Promise<{ alreadyDone: boolean; refundId: string | null }> {
  const { db, billing, supplier } = deps;
  const order = db.prepare(`SELECT * FROM orders WHERE id=?`).get(orderId) as any;
  if (!order) throw new RefundError(404, 'order not found');
  if (order.status === 'refunded' || order.status === 'canceled') {
    return { alreadyDone: true, refundId: order.refund_id ?? null };
  }
  if (!['provisioned', 'needs_review'].includes(order.status) || !order.payment_intent_id) {
    throw new RefundError(409, `order is ${order.status}; only paid orders can be refunded`);
  }
  const job = db.prepare(`SELECT status FROM provisioning_jobs WHERE order_id=?`).get(orderId) as
    | { status: string } | undefined;
  if (job && ['queued', 'running', 'needs_reconciliation'].includes(job.status)) {
    throw new RefundError(409, 'the eSIM outcome is not confirmed yet; reconcile with the supplier before refunding');
  }

  const profile = db.prepare(`SELECT id, iccid, status FROM esim_profiles WHERE order_id=?`).get(orderId) as
    | { id: string; iccid: string | null; status: string } | undefined;
  if (profile?.iccid && profile.status !== 'canceled') {
    if (!supplier.cancel) throw new RefundError(501, `supplier ${supplier.name} cannot cancel eSIMs`);
    try {
      await supplier.cancel(profile.iccid);
    } catch (err) {
      if (err instanceof SupplierCancelRefused) {
        throw new RefundError(409, `the supplier would not cancel this eSIM (usually because it was already installed or used): ${err.message}`);
      }
      throw new RefundError(502, `supplier cancel failed: ${String(err)}`);
    }
    db.prepare(`UPDATE esim_profiles SET status='canceled', updated_at=? WHERE id=?`).run(now(), profile.id);
  }

  let refundId: string;
  try {
    ({ refundId } = await billing.refund({ paymentIntentId: order.payment_intent_id, orderId }));
  } catch (err) {
    throw new RefundError(502, `the eSIM is canceled but the payment refund failed; retry this request: ${String(err)}`);
  }

  db.transaction(() => {
    db.prepare(`UPDATE orders SET refund_id=? WHERE id=?`).run(refundId, orderId);
    transitionOrder(db, orderId, 'refunded', {
      actor: opts.actor, detail: `canceled and refunded${opts.reason ? `: ${opts.reason}` : ''}`,
    });
    referrals.voidRedemption(db, orderId);
    db.prepare(`INSERT INTO admin_events (id, actor, action, order_id, detail, created_at)
      VALUES (?, ?, 'order_refund', ?, ?, ?)`).run(uid(), opts.actor, orderId,
      JSON.stringify({ refundId, iccid: profile?.iccid ?? null, reason: opts.reason ?? null }), now());
  })();
  return { alreadyDone: false, refundId };
}
