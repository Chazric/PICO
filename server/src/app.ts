import express, { type Express, type Request, type Response } from 'express';
import { z } from 'zod';
import type { DB } from './db.js';
import { now, uid } from './db.js';
import type { BillingAdapter } from './billing.js';
import type { SupplierAdapter } from './supplier/types.js';
import { Provisioner } from './provisioning.js';
import { config } from './config.js';

export interface Deps {
  db: DB;
  billing: BillingAdapter;
  supplier: SupplierAdapter;
  provisioner: Provisioner;
}

const CreateOrder = z.object({
  planId: z.string().min(1),
  destination: z.string().min(2),
  planName: z.string().max(60).optional(),
});

export function createApp(deps: Deps): Express {
  const app = express();
  const { db, billing, supplier, provisioner } = deps;

  // Dev-friendly CORS — tighten to known origins before production.
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'content-type, idempotency-key, stripe-signature');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  // Stripe webhook needs the raw body for signature verification — mount raw
  // on that route BEFORE express.json().
  /** Shared pipeline: verify signature -> durable receipt (deduped) -> fulfill. */
  async function processDelivery(rawBody: Buffer, signature: string | undefined) {
    const parsed = billing.verifyAndParseWebhook(rawBody, signature);

    // Durable receipt first: insert the event, dedupe on event_id.
    const inserted = db.prepare(
      `INSERT INTO webhook_events (event_id, type, payload, received_at, outcome)
       VALUES (?, ?, ?, ?, 'pending')
       ON CONFLICT(event_id) DO NOTHING`,
    ).run(parsed.eventId, parsed.type, JSON.stringify(parsed.data), now());
    if (inserted.changes === 0) return { duplicate: true };

    // Fulfillment happens after durable receipt — never from the client.
    try {
      await handleStripeEvent(deps, parsed);
    } catch {
      db.prepare(`UPDATE webhook_events SET processed_at=?, outcome='error' WHERE event_id=?`)
        .run(now(), parsed.eventId);
      throw new Error('fulfillment error');
    }
    db.prepare(`UPDATE webhook_events SET processed_at=?, outcome='processed' WHERE event_id=?`)
      .run(now(), parsed.eventId);
    return { duplicate: false };
  }

  app.post(
    '/api/v1/webhooks/stripe',
    express.raw({ type: 'application/json' }),
    async (req: Request, res: Response) => {
      try {
        const r = await processDelivery(
          req.body as Buffer,
          req.header('stripe-signature'),
        );
        res.status(200).json({ received: true, duplicate: r.duplicate });
      } catch (err) {
        const msg = String(err);
        if (msg.includes('fulfillment')) {
          res.status(500).json({ error: 'fulfillment error — safe for Stripe to retry' });
        } else {
          res.status(400).json({ error: `webhook verification failed: ${msg}` });
        }
      }
    },
  );

  app.use(express.json());

  app.get('/api/v1/health', (_req, res) => {
    res.json({
      ok: true,
      billingMode: billing.mode,     // 'mock' => no real charging possible
      supplier: supplier.name,       // 'mock' => simulated catalog/provisioning
    });
  });

  app.get('/api/v1/catalog/destinations', (_req, res) => {
    res.json({ destinations: supplier.listDestinations(), supplier: supplier.name });
  });

  app.get('/api/v1/catalog/plans', (req, res) => {
    const destination = typeof req.query.destination === 'string' ? req.query.destination : undefined;
    res.json({ plans: supplier.listPlans(destination), supplier: supplier.name });
  });

  app.get('/api/v1/catalog/plans/:planId', (req, res) => {
    const plan = supplier.getPlan(req.params.planId);
    if (!plan) { res.status(404).json({ error: 'plan not found' }); return; }
    res.json({ plan, supplier: supplier.name });
  });

  // Create an order + PaymentIntent. Price is always re-derived server-side.
  app.post('/api/v1/orders', async (req: Request, res: Response) => {
    const body = CreateOrder.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

    const idemKey = req.header('idempotency-key');
    if (idemKey) {
      const seen = db.prepare(
        `SELECT resource_id FROM idempotency_keys WHERE key=? AND endpoint='create_order'`,
      ).get(idemKey) as { resource_id: string } | undefined;
      if (seen) {
        res.status(200).json({ order: getOrder(db, seen.resource_id), replayed: true });
        return;
      }
    }

    const plan = supplier.getPlan(body.data.planId);
    if (!plan) { res.status(404).json({ error: 'plan not found' }); return; }
    if (plan.destination !== body.data.destination) {
      res.status(400).json({ error: 'plan does not cover that destination' });
      return;
    }

    const orderId = uid();
    const taxCents = 0; // Tax jurisdiction handling is deferred (spec §16).
    const pi = await billing.createPaymentIntent({
      amountCents: plan.priceCents + taxCents,
      currency: plan.currency,
      orderId,
    });

    db.prepare(
      `INSERT INTO orders (id, plan_id, destination, amount_cents, currency, tax_cents, status, payment_intent_id, plan_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'created', ?, ?, ?, ?)`,
    ).run(orderId, plan.planId, plan.destination, plan.priceCents, plan.currency, taxCents, pi.paymentIntentId, body.data.planName ?? null, now(), now());
    if (idemKey) {
      db.prepare(`INSERT INTO idempotency_keys (key, endpoint, resource_id, created_at) VALUES (?, 'create_order', ?, ?)`)
        .run(idemKey, orderId, now());
    }

    const order = getOrder(db, orderId);
    res.status(201).json({
      order,
      payment: {
        paymentIntentId: pi.paymentIntentId,
        clientSecret: pi.clientSecret,
        mock: pi.isMock,
        publishableKey: config.stripe.publishableKey || null,
      },
      orderSummary: {
        products: [{ name: plan.name, planId: plan.planId }],
        totalCents: plan.priceCents + taxCents,
        taxCents,
        currency: plan.currency,
        futureCharges: 'none — one-time purchase',
        renewal: plan.renewal.detail,
        activationDeadlineDays: plan.activationDeadlineDays,
        cancellation: 'Refundable until the eSIM is installed (mock policy).',
      },
    });
  });

  app.get('/api/v1/orders/:id', (req, res) => {
    const order = getOrder(db, req.params.id);
    if (!order) { res.status(404).json({ error: 'order not found' }); return; }
    res.json({ order });
  });

  // Rename a purchased profile ("France Trip", "Business" — spec §19.B).
  app.post('/api/v1/orders/:id/name', (req, res) => {
    const name = z.string().min(1).max(60).safeParse(req.body?.planName);
    if (!name.success) { res.status(400).json({ error: 'planName required' }); return; }
    const r = db.prepare(`UPDATE orders SET plan_name=?, updated_at=? WHERE id=?`)
      .run(name.data, now(), req.params.id);
    if (r.changes === 0) { res.status(404).json({ error: 'order not found' }); return; }
    res.json({ order: getOrder(db, req.params.id) });
  });

  // Dev/test only: simulate a payment outcome by emitting a properly signed
  // webhook through the real verification + fulfillment path.
  if (config.env !== 'production') {
    app.post('/api/v1/dev/simulate-payment', (req, res) => {
      const { orderId, outcome } = req.body as { orderId: string; outcome: 'succeeded' | 'failed' };
      const order = db.prepare(`SELECT * FROM orders WHERE id=?`).get(orderId) as any;
      if (!order?.payment_intent_id) { res.status(404).json({ error: 'order/PI not found' }); return; }
      res.json({ signedEvent: buildPaymentEvent(order, outcome ?? 'succeeded') });
    });

    // Dev/test only: build a signed payment event for the order and run it
    // through the real verify -> durable -> fulfill pipeline (mock-mode stand-in
    // for Stripe delivering the webhook itself). Never available in production.
    app.post('/api/v1/dev/confirm-payment', async (req, res) => {
      const { orderId, outcome } = req.body as { orderId: string; outcome?: 'succeeded' | 'failed' };
      const order = db.prepare(`SELECT * FROM orders WHERE id=?`).get(orderId) as any;
      if (!order?.payment_intent_id) { res.status(404).json({ error: 'order/PI not found' }); return; }
      const event = buildPaymentEvent(order, outcome ?? 'succeeded');
      const body = Buffer.from(JSON.stringify(event));
      const { createHmac } = await import('node:crypto');
      const secret = config.stripe.webhookSecret || 'whsec_mock_local_test';
      const t = Math.floor(Date.now() / 1000);
      const v1 = createHmac('sha256', secret).update(`${t}.${body.toString('utf8')}`).digest('hex');
      try {
        const r = await processDelivery(body, `t=${t},v1=${v1}`);
        res.json({ delivered: true, duplicate: r.duplicate });
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });
  }

  return app;
}

function buildPaymentEvent(order: any, outcome: 'succeeded' | 'failed') {
  const type = outcome === 'succeeded' ? 'payment_intent.succeeded' : 'payment_intent.payment_failed';
  return {
    id: `evt_mock_${uid().replaceAll('-', '').slice(0, 24)}`,
    type,
    data: {
      object: {
        id: order.payment_intent_id,
        object: 'payment_intent',
        amount: order.amount_cents,
        currency: order.currency.toLowerCase(),
        status: outcome === 'succeeded' ? 'succeeded' : 'requires_payment_method',
        metadata: { pico_order_id: order.id },
      },
    },
  };
}

async function handleStripeEvent(
  deps: Deps,
  ev: { eventId: string; type: string; data: unknown },
) {
  const { db, provisioner } = deps;
  const obj = ev.data as { id?: string; metadata?: { pico_order_id?: string } };
  const orderId = obj.metadata?.pico_order_id;
  if (!orderId) return; // not a PICO payment — ignore but keep the event row

  if (ev.type === 'payment_intent.succeeded') {
    const updated = db.prepare(
      `UPDATE orders SET status='provisioning', updated_at=? WHERE id=? AND status IN ('created','payment_failed')`,
    ).run(now(), orderId);
    if (updated.changes > 0) {
      provisioner.enqueue(orderId, `prov-${orderId}`);
      await provisioner.processOrder(orderId);
    }
    // If status didn't move (already provisioned / refunded / canceled), the event
    // is a duplicate or out-of-order — durable record kept, no re-fulfillment.
  } else if (ev.type === 'payment_intent.payment_failed') {
    db.prepare(
      `UPDATE orders SET status='payment_failed', failure_reason='payment declined', updated_at=? WHERE id=? AND status='created'`,
    ).run(now(), orderId);
  } else if (ev.type === 'charge.refunded' || ev.type === 'payment_intent.canceled') {
    db.prepare(`UPDATE orders SET status=?, updated_at=? WHERE id=?`)
      .run(ev.type === 'charge.refunded' ? 'refunded' : 'canceled', now(), orderId);
  }
}

function getOrder(db: DB, id: string) {
  const order = db.prepare(`SELECT * FROM orders WHERE id=?`).get(id) as any;
  if (!order) return null;
  const profile = db.prepare(
    `SELECT id, iccid, smdp_address, status, is_mock, created_at FROM esim_profiles WHERE order_id=?`,
  ).get(id) as any;
  const job = db.prepare(
    `SELECT status, attempts, last_error FROM provisioning_jobs WHERE order_id=?`,
  ).get(id) as any;
  return {
    ...order,
    // activation_code is deliberately excluded from the default read path —
    // it's a credential; expose only via an authenticated channel (Sprint 2).
    esim: profile ?? null,
    provisioning: job ?? null,
  };
}
