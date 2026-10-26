import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeFixture, createOrder, payOrder, getOrder, deliverEvent } from './helpers.js';
import type { MockBilling } from '../src/billing.js';

const ADMIN = { 'x-admin-token': 'dev-admin-token' };

async function paidOrder() {
  const fx = makeFixture();
  const { order } = await createOrder(fx);
  await payOrder(fx, order.id, 'succeeded');
  return { fx, order: await getOrder(fx, order.id), billing: fx.deps.billing as MockBilling };
}

const cancel = (fx: ReturnType<typeof makeFixture>, id: string, headers: Record<string, string> = ADMIN) =>
  request(fx.app).post(`/api/v1/admin/orders/${id}/cancel`).set(headers).send({ reason: 'customer request' });

describe('cancel & refund', () => {
  it('cancels the eSIM at the supplier, refunds the payment and marks the order refunded', async () => {
    const { fx, order, billing } = await paidOrder();
    expect(order.status).toBe('provisioned');

    const res = await cancel(fx, order.id);
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('refunded');
    expect(res.body.order.refund_id).toMatch(/^re_mock_/);
    expect(res.body.order.esim.status).toBe('canceled');
    expect(fx.supplier.canceled).toEqual([order.esim.iccid]);
    expect(billing.refunds).toEqual([order.payment_intent_id]);
    expect(res.body.order.events.at(-1)).toMatchObject({ to_status: 'refunded', detail: 'canceled and refunded: customer request' });
  });

  it('requires the admin token', async () => {
    const { fx, order } = await paidOrder();
    expect((await cancel(fx, order.id, {})).status).toBe(401);
    expect((await getOrder(fx, order.id)).status).toBe('provisioned');
  });

  it('is idempotent, and the Stripe refund webhook does not log a second transition', async () => {
    const { fx, order, billing } = await paidOrder();
    await cancel(fx, order.id);
    const again = await cancel(fx, order.id);
    expect(again.status).toBe(200);
    expect(again.body.alreadyDone).toBe(true);
    await deliverEvent(fx, { id: 'evt_rf', type: 'charge.refunded',
      data: { object: { id: order.payment_intent_id, metadata: { pico_order_id: order.id } } } });
    const o = await getOrder(fx, order.id);
    expect(o.events.filter((e: any) => e.to_status === 'refunded')).toHaveLength(1);
    expect(fx.supplier.canceled).toHaveLength(1);
    expect(billing.refunds).toHaveLength(1);
  });

  it('refuses unpaid orders', async () => {
    const fx = makeFixture();
    const { order } = await createOrder(fx);
    const res = await cancel(fx, order.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('only paid orders');
  });

  it('refuses when the supplier will not cancel (eSIM already installed) and refunds nothing', async () => {
    const { fx, order, billing } = await paidOrder();
    fx.supplier.refuseCancel(order.esim.iccid);
    const res = await cancel(fx, order.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already installed');
    expect(billing.refunds).toHaveLength(0);
    expect((await getOrder(fx, order.id)).status).toBe('provisioned');
  });

  it('retries a failed payment refund without canceling the eSIM twice', async () => {
    const { fx, order, billing } = await paidOrder();
    billing.failNextRefund = true;
    const first = await cancel(fx, order.id);
    expect(first.status).toBe(502);
    expect((await getOrder(fx, order.id)).esim.status).toBe('canceled');

    const retry = await cancel(fx, order.id);
    expect(retry.status).toBe(200);
    expect(retry.body.order.status).toBe('refunded');
    expect(fx.supplier.canceled).toHaveLength(1);
  });

  it('returns 404 for an unknown order', async () => {
    const fx = makeFixture();
    expect((await cancel(fx, 'nope')).status).toBe(404);
  });
});
