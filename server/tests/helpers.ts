import request from 'supertest';
import type { Express } from 'express';
import { openDb, type DB } from '../src/db.js';
import { MockBilling } from '../src/billing.js';
import { MockSupplier } from '../src/supplier/mock.js';
import { Provisioner } from '../src/provisioning.js';
import { createApp, type Deps } from '../src/app.js';

export const WEBHOOK_SECRET = 'whsec_test_fixture';

export interface Fixture {
  app: Express;
  db: DB;
  supplier: MockSupplier;
  deps: Deps;
}

export function makeFixture(): Fixture {
  const db = openDb(':memory:');
  const billing = new MockBilling(WEBHOOK_SECRET);
  const supplier = new MockSupplier();
  const provisioner = new Provisioner(db, supplier);
  const deps = { db, billing, supplier, provisioner };
  return { app: createApp(deps), db, supplier, deps };
}

/** Create an order through the real API path. */
export async function createOrder(fx: Fixture, planId = 'mock-fr-everyday', idemKey?: string,
    extra?: Record<string, unknown>) {
  const r = request(fx.app).post('/api/v1/orders').send({ planId, destination: 'FR', ...extra });
  if (idemKey) r.set('idempotency-key', idemKey);
  const res = await r;
  if (res.status !== 201 && res.status !== 200) throw new Error(`order create failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

/** Deliver a signed webhook event through the real verification path. */
export async function deliverEvent(fx: Fixture, event: object) {
  const { body, header } = MockBilling.sign(event, WEBHOOK_SECRET);
  return request(fx.app)
    .post('/api/v1/webhooks/stripe')
    .set('stripe-signature', header)
    .set('content-type', 'application/json')
    .send(body.toString('utf8')); // exact bytes the signature covers
}

/** Ask the server for a correctly-shaped payment event for an order, then sign+deliver it. */
export async function payOrder(fx: Fixture, orderId: string, outcome: 'succeeded' | 'failed' = 'succeeded') {
  const sim = await request(fx.app).post('/api/v1/dev/simulate-payment').send({ orderId, outcome });
  const event = sim.body.signedEvent;
  return deliverEvent(fx, event);
}

export async function getOrder(fx: Fixture, orderId: string) {
  const res = await request(fx.app).get(`/api/v1/orders/${orderId}`);
  return res.body.order;
}
