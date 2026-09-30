import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeFixture, createOrder } from './helpers.js';

const ADMIN = 'dev-admin-token';
const admin = (fx: ReturnType<typeof makeFixture>) => request(fx.app);

describe('feature flags / kill switches (V2 §§18, 59)', () => {
  it('rejects admin endpoints without the admin token', async () => {
    const fx = makeFixture();
    expect((await admin(fx).get('/api/v1/admin/flags')).status).toBe(401);
    expect((await admin(fx).post('/api/v1/admin/flags/ESIM_FR_ENABLED').send({ enabled: false }))
      .status).toBe(401);
  });

  it('per-market kill switch stops sales without an app update', async () => {
    const fx = makeFixture();
    // Baseline: FR sells fine.
    await createOrder(fx, 'mock-fr-light');

    const off = await admin(fx).post('/api/v1/admin/flags/ESIM_FR_ENABLED')
      .set('x-admin-token', ADMIN).send({ enabled: false, reason: 'regulator request (drill)' });
    expect(off.status).toBe(200);

    // Orders in FR are now refused and the market is hidden from the catalog.
    const res = await admin(fx).post('/api/v1/orders')
      .send({ planId: 'mock-fr-light', destination: 'FR' });
    expect(res.status).toBe(409);
    const cats = await admin(fx).get('/api/v1/catalog/destinations');
    expect(cats.body.destinations.find((d: any) => d.code === 'FR')).toBeUndefined();

    // Switch it back on — sales resume.
    await admin(fx).post('/api/v1/admin/flags/ESIM_FR_ENABLED')
      .set('x-admin-token', ADMIN).send({ enabled: true });
    await createOrder(fx, 'mock-fr-light');

    // The flag change is in the audit trail.
    const ev = fx.db.prepare(
      `SELECT COUNT(*) c FROM admin_events WHERE action='flag_change'`).get() as any;
    expect(ev.c).toBe(2);
  });

  it('supplier kill switch blocks all its markets', async () => {
    const fx = makeFixture();
    await admin(fx).post('/api/v1/admin/flags/SUPPLIER_MOCK_ENABLED')
      .set('x-admin-token', ADMIN).send({ enabled: false, reason: 'provider suspended' });
    const res = await admin(fx).post('/api/v1/orders')
      .send({ planId: 'mock-jp-light', destination: 'JP' });
    expect(res.status).toBe(409);
  });

  it('compliance admin view shows markets, provider record and open reviews', async () => {
    const fx = makeFixture();
    const res = await admin(fx).get('/api/v1/admin/compliance').set('x-admin-token', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.provider.servicesAuthorized).toContain('esim_data');
    expect(res.body.countries.length).toBeGreaterThan(0);
    expect(res.body.countries.every((c: any) => c.serviceEnabled)).toBe(true);
  });
});

describe('pricing margin floor (V2 §44)', () => {
  it('rejects a referral discount that drops the total below the margin floor', async () => {
    const fx = makeFixture();
    const { order: referrer } = await createOrder(fx, 'mock-fr-light');
    // Pay so a code exists.
    const { payOrder } = await import('./helpers.js');
    await payOrder(fx, referrer.id);
    const { body: ref } = await admin(fx).get(`/api/v1/orders/${referrer.id}/referral`);

    // fr-light is $6.99; $5 off leaves $1.99 < floor — not an eligible plan.
    const res = await admin(fx).post('/api/v1/orders')
      .send({ planId: 'mock-fr-light', destination: 'FR', referralCode: ref.code });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('not eligible');
  });
});
