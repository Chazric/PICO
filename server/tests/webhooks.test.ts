import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeFixture, createOrder, deliverEvent, payOrder, getOrder, WEBHOOK_SECRET } from './helpers.js';
import { MockBilling } from '../src/billing.js';

describe('webhook verification', () => {
  it('rejects an unsigned or wrongly-signed event with 400', async () => {
    const fx = makeFixture();
    const bad = await request(fx.app)
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', 't=1,v1=bogus')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ id: 'evt_x', type: 'payment_intent.succeeded', data: { object: {} } }));
    expect(bad.status).toBe(400);

    const unsigned = await request(fx.app)
      .post('/api/v1/webhooks/stripe')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ id: 'evt_x', type: 'payment_intent.succeeded', data: { object: {} } }));
    expect(unsigned.status).toBe(400);
  });
});

describe('fulfillment from verified events (spec §13)', () => {
  it('provisions exactly one eSIM per paid order — duplicate deliveries do not duplicate', async () => {
    const fx = makeFixture();
    const { order } = await createOrder(fx);

    const sim = await request(fx.app).post('/api/v1/dev/simulate-payment').send({ orderId: order.id, outcome: 'succeeded' });
    const event = sim.body.signedEvent;

    // Same event delivered three times (Stripe at-least-once + retries).
    for (let i = 0; i < 3; i++) await deliverEvent(fx, event);

    const after = await getOrder(fx, order.id);
    expect(after.status).toBe('provisioned');
    expect(after.esim).not.toBeNull();
    expect(after.esim.is_mock).toBe(1);
    const profiles = fx.db.prepare(`SELECT COUNT(*) c FROM esim_profiles WHERE order_id=?`).get(order.id) as any;
    expect(profiles.c).toBe(1);
    const events = fx.db.prepare(`SELECT COUNT(*) c FROM webhook_events WHERE event_id=?`).get(event.id) as any;
    expect(events.c).toBe(1); // deduped durable receipt
  });

  it('marks a failed payment and never provisions', async () => {
    const fx = makeFixture();
    const { order } = await createOrder(fx);
    await payOrder(fx, order.id, 'failed');
    const after = await getOrder(fx, order.id);
    expect(after.status).toBe('payment_failed');
    expect(after.esim).toBeNull();
    const jobs = fx.db.prepare(`SELECT COUNT(*) c FROM provisioning_jobs`).get() as any;
    expect(jobs.c).toBe(0);
  });

  it('ignores an event for an unknown payment but stores it durably', async () => {
    const fx = makeFixture();
    const res = await deliverEvent(fx, {
      id: 'evt_unknown_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_other', metadata: {} } },
    });
    expect(res.status).toBe(200);
    const row = fx.db.prepare(`SELECT * FROM webhook_events WHERE event_id='evt_unknown_1'`).get() as any;
    expect(row).toBeTruthy();
  });

  it('handles out-of-order delivery: refund then a late success does not resurrect', async () => {
    const fx = makeFixture();
    const { order } = await createOrder(fx);
    await payOrder(fx, order.id, 'succeeded');
    expect((await getOrder(fx, order.id)).status).toBe('provisioned');

    await deliverEvent(fx, {
      id: 'evt_refund_1', type: 'charge.refunded',
      data: { object: { id: order.payment_intent_id, metadata: { pico_order_id: order.id } } },
    });
    expect((await getOrder(fx, order.id)).status).toBe('refunded');

    // Late duplicate success must not move a refunded order back.
    await payOrder(fx, order.id, 'succeeded');
    expect((await getOrder(fx, order.id)).status).toBe('refunded');
  });

  it('reconciles a supplier timeout instead of double-provisioning', async () => {
    const fx = makeFixture();
    const { order } = await createOrder(fx);

    // Force first provision attempt to time out AFTER the supplier actually stored a result.
    const idemKey = `prov-${order.id}`;
    const result = await fx.supplier.provision({ orderId: order.id, planId: order.plan_id, idempotencyKey: idemKey });
    fx.supplier.forceTimeoutOnce(idemKey);

    await payOrder(fx, order.id, 'succeeded');
    const after = await getOrder(fx, order.id);
    // Reconciliation found the supplier-side result and issued the same eSIM.
    expect(after.status).toBe('provisioned');
    expect(after.esim.iccid).toBe(result.iccid);
    const profiles = fx.db.prepare(`SELECT COUNT(*) c FROM esim_profiles WHERE order_id=?`).get(order.id) as any;
    expect(profiles.c).toBe(1);
  });
});
