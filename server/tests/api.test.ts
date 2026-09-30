import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeFixture, createOrder } from './helpers.js';

describe('catalog', () => {
  it('lists destinations and plans from the supplier adapter', async () => {
    const fx = makeFixture();
    const d = await request(fx.app).get('/api/v1/catalog/destinations');
    expect(d.status).toBe(200);
    expect(d.body.destinations.map((x: any) => x.code)).toContain('FR');
    expect(d.body.supplier).toBe('mock');

    const p = await request(fx.app).get('/api/v1/catalog/plans?destination=FR');
    expect(p.status).toBe(200);
    expect(p.body.plans).toHaveLength(3);
    for (const plan of p.body.plans) {
      // Every plan must carry the full disclosure fields (spec §5).
      expect(plan.priceCents).toBeGreaterThan(0);
      expect(plan.validityDays).toBeGreaterThan(0);
      expect(plan.activationDeadlineDays).toBeGreaterThan(0);
      expect(plan.calls.included).toBe(false);
      expect(plan.phoneNumber.detail).toContain('No local phone number');
    }
  });
});

describe('orders', () => {
  it('prices orders server-side from the catalog, not the client', async () => {
    const fx = makeFixture();
    const { order, payment, orderSummary } = await createOrder(fx);
    expect(order.amount_cents).toBe(1499); // mock-fr-everyday
    expect(order.currency).toBe('USD');
    expect(order.status).toBe('created');
    expect(payment.mock).toBe(true);
    expect(orderSummary.totalCents).toBe(1499);
    expect(orderSummary.futureCharges).toContain('one-time');
  });

  it('rejects a plan for a destination it does not cover', async () => {
    const fx = makeFixture();
    const res = await request(fx.app)
      .post('/api/v1/orders')
      .send({ planId: 'mock-fr-everyday', destination: 'JP' });
    expect(res.status).toBe(400);
  });

  it('replays identical order creation under the same idempotency key', async () => {
    const fx = makeFixture();
    const a = await createOrder(fx, 'mock-fr-everyday', 'key-123');
    const b = await createOrder(fx, 'mock-fr-everyday', 'key-123');
    expect(b.replayed).toBe(true);
    expect(b.order.id).toBe(a.order.id);
    const count = fx.db.prepare(`SELECT COUNT(*) c FROM orders`).get() as any;
    expect(count.c).toBe(1);
  });

  it('lets the customer name a purchased profile', async () => {
    const fx = makeFixture();
    const { order } = await createOrder(fx);
    const res = await request(fx.app)
      .post(`/api/v1/orders/${order.id}/name`)
      .send({ planName: 'France Trip' });
    expect(res.status).toBe(200);
    expect(res.body.order.plan_name).toBe('France Trip');
  });
});
