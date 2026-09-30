import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeFixture, createOrder, payOrder, deliverEvent } from './helpers.js';

const referral = (fx: ReturnType<typeof makeFixture>, orderId: string) =>
  request(fx.app).get(`/api/v1/orders/${orderId}/referral`);

describe('referrals — Give $5, Get $5', () => {
  it('issues a code only after the order is paid', async () => {
    const fx = makeFixture();
    const { order } = await createOrder(fx, 'mock-fr-light');

    const unpaid = await referral(fx, order.id);
    expect(unpaid.body.code).toBeNull();

    await payOrder(fx, order.id);
    const paid = await referral(fx, order.id);
    expect(paid.body.code).toMatch(/^PICO-[0-9A-F]{8}$/);
    // Lazy issuance is idempotent — same code on repeat calls.
    expect((await referral(fx, order.id)).body.code).toBe(paid.body.code);
  });

  it('validates existing codes and rejects unknown ones', async () => {
    const fx = makeFixture();
    const { order } = await createOrder(fx, 'mock-fr-light');
    await payOrder(fx, order.id);
    const { body } = await referral(fx, order.id);

    const ok = await request(fx.app).post('/api/v1/referrals/validate').send({ code: body.code });
    expect(ok.body).toEqual({ valid: true, discountCents: 500 });
    const bad = await request(fx.app).post('/api/v1/referrals/validate').send({ code: 'PICO-NOPE99' });
    expect(bad.body.valid).toBe(false);
  });

  it('applies the $5 discount server-side and credits the referrer on verified payment', async () => {
    const fx = makeFixture();
    const { order: referrer } = await createOrder(fx, 'mock-fr-light');
    await payOrder(fx, referrer.id);
    const { body: ref } = await referral(fx, referrer.id);

    // Friend orders a $14.99 plan with the code -> $9.99 total.
    const friend = await createOrder(fx, 'mock-fr-everyday', undefined, { referralCode: ref.code });
    expect(friend.order.discount_cents).toBe(500);
    expect(friend.orderSummary.totalCents).toBe(999);

    // No credit until the friend's payment verifies.
    expect((await referral(fx, referrer.id)).body.creditCents).toBe(0);

    await payOrder(fx, friend.order.id, 'succeeded');
    let mine = await referral(fx, referrer.id);
    expect(mine.body.creditCents).toBe(500);
    expect(mine.body.redemptionCount).toBe(1);

    // A duplicate payment webhook must not double-credit.
    await payOrder(fx, friend.order.id, 'succeeded');
    mine = await referral(fx, referrer.id);
    expect(mine.body.creditCents).toBe(500);
  });

  it('rejects an unknown referral code instead of silently skipping it', async () => {
    const fx = makeFixture();
    const res = await request(fx.app).post('/api/v1/orders')
      .set('idempotency-key', 'k-badref')
      .send({ planId: 'mock-fr-light', destination: 'FR', referralCode: 'PICO-FAKE00' });
    expect(res.status).toBe(400);
  });

  it('revokes the credit when the friend is refunded', async () => {
    const fx = makeFixture();
    const { order: referrer } = await createOrder(fx, 'mock-fr-light');
    await payOrder(fx, referrer.id);
    const { body: ref } = await referral(fx, referrer.id);

    const friend = await createOrder(fx, 'mock-fr-everyday', undefined, { referralCode: ref.code });
    await payOrder(fx, friend.order.id, 'succeeded');
    expect((await referral(fx, referrer.id)).body.creditCents).toBe(500);

    await deliverEvent(fx, {
      id: 'evt_referral_refund', type: 'charge.refunded',
      data: { object: { id: friend.order.payment_intent_id, metadata: { pico_order_id: friend.order.id } } },
    });
    const mine = await referral(fx, referrer.id);
    expect(mine.body.creditCents).toBe(0);
    expect(mine.body.redemptionCount).toBe(0);
  });
});
