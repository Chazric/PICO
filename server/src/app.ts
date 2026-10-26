import express, { type Express, type Request, type Response } from 'express';
import { z } from 'zod';
import type { DB } from './db.js';
import { now, uid, transitionOrder } from './db.js';
import type { BillingAdapter } from './billing.js';
import type { SupplierAdapter } from './supplier/types.js';
import { Provisioner } from './provisioning.js';
import { config } from './config.js';
import * as referrals from './referrals.js';
import * as flags from './flags.js';
import { cancelAndRefund, RefundError } from './refunds.js';
import { evaluateService, buildReviewRecord, providerFor, MOCK_COUNTRY_RULES } from './compliance/statuses.js';

export interface Deps {
  db: DB;
  billing: BillingAdapter;
  supplier: SupplierAdapter;
  provisioner: Provisioner;
}

const CreateOrder = z.object({
  planId: z.string().min(1),
  destination: z.string().min(2),
  planName: z.string().max(60).nullish(),
  referralCode: z.string().max(20).nullish(),
});

export function createApp(deps: Deps): Express {
  const app = express();
  const { db, billing, supplier, provisioner } = deps;
  const provider = providerFor(supplier.name);

  // Regulatory kill switches (V2 §§18, 59) — seeded once, live in the DB.
  flags.seedFlags(db, supplier.listDestinations().map(d => d.code), supplier.name);

  // Ops endpoints are token-gated even in test mode (V2 §29 least privilege).
  const adminAuth = (req: Request, res: Response, next: () => void) => {
    if (req.header('x-admin-token') !== config.admin.token) {
      res.status(401).json({ error: 'admin token required' }); return;
    }
    next();
  };

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

  // Compliance gate (master spec §1): every destination carries an explicit
  // status evaluated against the provider's authorization — never assumed.
  const complianceFor = (country: string) =>
    evaluateService(provider, 'esim_data', country, MOCK_COUNTRY_RULES[country]);

  app.get('/api/v1/catalog/destinations', (_req, res) => {
    const destinations = supplier.listDestinations()
      .map((d) => ({ ...d, compliance: complianceFor(d.code) }))
      .filter((d) => d.compliance.status !== 'NOT_AVAILABLE'
        && flags.isEnabled(db, flags.flagKey('esim', d.code)));
    res.json({ destinations, supplier: supplier.name });
  });

  app.get('/api/v1/catalog/plans', (req, res) => {
    const destination = typeof req.query.destination === 'string' ? req.query.destination : undefined;
    const compliance = destination ? complianceFor(destination) : null;
    if (compliance && (compliance.status === 'NOT_AVAILABLE' || compliance.requiresReview)) {
      res.status(compliance.status === 'NOT_AVAILABLE' ? 404 : 409).json({
        error: 'service not offerable in this market',
        compliance,
      });
      return;
    }
    res.json({ plans: supplier.listPlans(destination), supplier: supplier.name, compliance });
  });

  app.get('/api/v1/catalog/plans/:planId', (req, res) => {
    const plan = supplier.getPlan(req.params.planId);
    if (!plan) { res.status(404).json({ error: 'plan not found' }); return; }
    res.json({ plan, supplier: supplier.name, compliance: complianceFor(plan.destination) });
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

    // Compliance gate at purchase time (master spec §1/§4): never sell into a
    // market the provider hasn't authorized, never auto-provision when unsure.
    const decision = complianceFor(plan.destination);
    // Regulatory kill switch (V2 §18): a disabled service/market/provider is
    // not sellable, whatever the compliance evaluation says.
    if (!flags.isEnabled(db, flags.flagKey('esim', plan.destination))
        || !flags.isEnabled(db, flags.flagKey('supplier', supplier.name))) {
      res.status(409).json({ error: 'this service is currently unavailable in that market' });
      return;
    }
    if (decision.status === 'NOT_AVAILABLE') {
      res.status(409).json({ error: 'this plan is not available in that market', compliance: decision });
      return;
    }
    if (decision.requiresReview) {
      // COMPLIANCE_REVIEW_REQUIRED — structured record per V2 spec §1. The
      // feature stays disabled and no charge is created until resolved.
      const review = buildReviewRecord(provider, 'esim_data', plan.destination, decision);
      db.prepare(`INSERT INTO admin_events (id, actor, action, order_id, detail, created_at)
        VALUES (?, 'system', 'compliance_review', ?, ?, ?)`).run(uid(), null,
        JSON.stringify({ planId: plan.planId, review }), now());
      res.status(409).json({ error: 'this purchase needs a compliance review first', compliance: decision });
      return;
    }

    const orderId = uid();
    const taxCents = 0; // Tax jurisdiction handling is deferred (spec §16).

    // Referral "Give $5": validate BEFORE charging — bad code rejects the
    // order rather than silently skipping the friend's discount.
    let discountCents = 0;
    let appliedCode: string | null = null;
    if (body.data.referralCode) {
      const code = body.data.referralCode.trim().toUpperCase();
      if (!referrals.lookupCode(db, code)) {
        res.status(400).json({ error: 'referral code not found — check it and try again' });
        return;
      }
      discountCents = config.referral.discountCents;
      appliedCode = code;
    }
    const totalCents = plan.priceCents + taxCents - discountCents;

    // Margin floor (V2 §44): a discounted sale may never drop below wholesale
    // cost × (1 + floor). The eligibility error is phrased for the referral
    // path, which is the only way the total can dip.
    const marginFloor = Math.ceil(plan.costCents * (1 + config.pricing.minMarginPct));
    if (totalCents < marginFloor) {
      res.status(400).json({ error: 'this plan is not eligible for referral credit' });
      return;
    }

    const pi = await billing.createPaymentIntent({
      amountCents: totalCents,
      currency: plan.currency,
      orderId,
    });

    db.transaction(() => {
      db.prepare(
        `INSERT INTO orders (id, plan_id, destination, amount_cents, currency, tax_cents, status, payment_intent_id, plan_name, referral_code, discount_cents, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'created', ?, ?, ?, ?, ?, ?)`,
      ).run(orderId, plan.planId, plan.destination, plan.priceCents, plan.currency, taxCents,
        pi.paymentIntentId, body.data.planName ?? null, appliedCode, discountCents, now(), now());
      if (appliedCode) referrals.redeem(db, orderId, appliedCode, plan.priceCents);
      db.prepare(`INSERT INTO order_events (id, order_id, from_status, to_status, actor, detail, created_at)
        VALUES (?, ?, NULL, 'created', 'system', 'order placed', ?)`).run(uid(), orderId, now());
    })();
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
        subtotalCents: plan.priceCents + taxCents,
        discountCents,
        referralCode: appliedCode,
        totalCents,
        taxCents,
        currency: plan.currency,
        futureCharges: 'none — one-time purchase',
        renewal: plan.renewal.detail,
        activationDeadlineDays: plan.activationDeadlineDays,
        cancellation: 'Refundable until the eSIM is installed: contact support from Help.',
      },
    });
  });

  app.get('/api/v1/orders/:id', (req, res) => {
    const order = getOrder(db, req.params.id);
    if (!order) { res.status(404).json({ error: 'order not found' }); return; }
    res.json({ order });
  });

  // Referrals — "Give $5, Get $5": check a code before checkout.
  app.post('/api/v1/referrals/validate', (req, res) => {
    const code = z.string().min(3).max(20).safeParse(req.body?.code);
    if (!code.success) { res.status(400).json({ error: 'code required' }); return; }
    const row = referrals.lookupCode(db, code.data);
    res.json(row
      ? { valid: true, discountCents: config.referral.discountCents }
      : { valid: false });
  });

  // The customer's own code + earned credit. Code is issued lazily once the
  // order is paid — a code never exists before a verified payment.
  app.get('/api/v1/orders/:id/referral', (req, res) => {
    const order = db.prepare(`SELECT id FROM orders WHERE id=?`).get(req.params.id);
    if (!order) { res.status(404).json({ error: 'order not found' }); return; }
    const codeRow = referrals.ensureCode(db, req.params.id);
    res.json({
      code: codeRow?.code ?? null,
      creditCents: referrals.creditBalance(db, req.params.id),
      redemptionCount: referrals.redemptionCount(db, req.params.id),
    });
  });

  /* ---------- Admin / ops (V2 §§18-19): token-gated ---------- */

  app.get('/api/v1/admin/flags', adminAuth, (_req, res) => {
    res.json({ flags: flags.listFlags(db) });
  });

  // Regulatory kill switch: set any flag without redeploying.
  app.post('/api/v1/admin/flags/:key', adminAuth, (req, res) => {
    const body = z.object({
      enabled: z.boolean(),
      reason: z.string().max(200).nullish(),
    }).safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: 'enabled (boolean) required' }); return; }
    flags.setFlag(db, req.params.key, body.data.enabled, body.data.reason ?? null, 'admin');
    res.json({ key: req.params.key, enabled: body.data.enabled });
  });

  // Cancel & refund: cancels the eSIM at the supplier (refunds our cost) and
  // fully refunds the customer's payment. Refused once the eSIM is installed.
  app.post('/api/v1/admin/orders/:id/cancel', adminAuth, async (req, res) => {
    const reason = z.string().max(200).nullish().safeParse(req.body?.reason);
    try {
      const r = await cancelAndRefund(deps, req.params.id,
        { actor: 'admin', reason: reason.success ? reason.data ?? null : null });
      res.json({ ...r, order: getOrder(db, req.params.id) });
    } catch (err) {
      if (err instanceof RefundError) { res.status(err.status).json({ error: err.message }); return; }
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/v1/admin/supplier/balance', adminAuth, async (_req, res) => {
    if (!supplier.balanceCents) {
      res.status(404).json({ error: `supplier ${supplier.name} has no prepaid balance` }); return;
    }
    try {
      res.json({ supplier: supplier.name, balanceCents: await supplier.balanceCents(),
        lowBalanceAlertCents: config.alerts.lowBalanceCents });
    } catch (err) {
      res.status(502).json({ error: String(err) });
    }
  });

  // Compliance admin view (V2 §19): per-market statuses, provider record,
  // and open legal/compliance reviews in one read.
  app.get('/api/v1/admin/compliance', adminAuth, (_req, res) => {
    const countries = supplier.listDestinations().map(d => ({
      code: d.code, name: d.name,
      compliance: complianceFor(d.code),
      serviceEnabled: flags.isEnabled(db, flags.flagKey('esim', d.code)),
    }));
    const openReviews = db.prepare(
      `SELECT id, action, order_id, detail, created_at FROM admin_events
       WHERE action IN ('compliance_review','compliance_hold') ORDER BY created_at`,
    ).all();
    res.json({ countries, provider: provider, openReviews });
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
  const { db, provisioner, supplier } = deps;
  const provider = providerFor(supplier.name);
  const obj = ev.data as { id?: string; metadata?: { pico_order_id?: string } };
  const orderId = obj.metadata?.pico_order_id;
  if (!orderId) return; // not a PICO payment — ignore but keep the event row

  if (ev.type === 'payment_intent.succeeded') {
    const moved = transitionOrder(db, orderId, 'provisioning',
      { from: ['created', 'payment_failed'], detail: 'verified payment_intent.succeeded' });
    if (moved) {
      // Sequence per master spec §16: verified payment -> compliance
      // verification -> provider provisioning. If a market rule changed between
      // order and payment, stop here — hold for review, never auto-provision.
      const order = db.prepare(`SELECT plan_id, destination FROM orders WHERE id=?`)
        .get(orderId) as { plan_id: string; destination: string } | undefined;
      const decision = order
        ? evaluateService(provider, 'esim_data', order.destination, MOCK_COUNTRY_RULES[order.destination])
        : null;
      if (decision?.requiresReview || decision?.status === 'NOT_AVAILABLE') {
        const review = buildReviewRecord(provider, 'esim_data', order!.destination, decision!);
        transitionOrder(db, orderId, 'needs_review',
          { detail: `compliance checkpoint after payment: ${decision!.status}` });
        db.prepare(`INSERT INTO admin_events (id, actor, action, order_id, detail, created_at)
          VALUES (?, 'system', 'compliance_hold', ?, ?, ?)`)
          .run(uid(), orderId, JSON.stringify(review), now());
      } else {
        provisioner.enqueue(orderId, `prov-${orderId}`);
        await provisioner.processOrder(orderId);
      }
    }
    // Referral credit posts only on verified payment — same trust boundary as
    // fulfillment. Safe on replays: the ledger unique key dedupes.
    referrals.creditReferrer(db, orderId);
    // If status didn't move (already provisioned / refunded / canceled), the event
    // is a duplicate or out-of-order — durable record kept, no re-fulfillment.
  } else if (ev.type === 'payment_intent.payment_failed') {
    transitionOrder(db, orderId, 'payment_failed',
      { from: ['created'], failureReason: 'payment declined' });
  } else if (ev.type === 'charge.refunded' || ev.type === 'payment_intent.canceled') {
    // A refund we issued ourselves arrives here too; don't log it twice.
    transitionOrder(db, orderId,
      ev.type === 'charge.refunded' ? 'refunded' : 'canceled',
      { from: ['created', 'payment_failed', 'paid', 'provisioning', 'provisioned', 'needs_review'] });
    // Revoke the referral: redemption voids and any posted credit is reversed
    // by a negative ledger entry (append-only, idempotent).
    referrals.voidRedemption(db, orderId);
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
  const events = db.prepare(
    `SELECT from_status, to_status, detail, created_at FROM order_events WHERE order_id=? ORDER BY created_at`,
  ).all(id) as any[];
  return {
    ...order,
    // activation_code is deliberately excluded from the default read path —
    // it's a credential; expose only via an authenticated channel (Sprint 2).
    esim: profile ?? null,
    provisioning: job ?? null,
    events, // lifecycle audit trail (V2 spec §7)
  };
}
