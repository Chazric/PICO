import Stripe from 'stripe';
import { createHmac, randomUUID } from 'node:crypto';
import { config } from './config.js';

export interface PaymentIntentResult {
  paymentIntentId: string;
  clientSecret: string;
  isMock: boolean;
}

export interface BillingAdapter {
  mode: 'stripe' | 'mock';
  createPaymentIntent(args: { amountCents: number; currency: string; orderId: string }): Promise<PaymentIntentResult>;
  verifyAndParseWebhook(rawBody: Buffer, signature: string | undefined): { eventId: string; type: string; data: unknown };
}

/** Real Stripe adapter — used whenever a sk_test_/sk_live_ secret is configured. */
export class StripeBilling implements BillingAdapter {
  mode = 'stripe' as const;
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(secretKey: string, webhookSecret: string) {
    this.stripe = new Stripe(secretKey);
    this.webhookSecret = webhookSecret;
  }

  async createPaymentIntent(args: { amountCents: number; currency: string; orderId: string }) {
    const pi = await this.stripe.paymentIntents.create({
      amount: args.amountCents,
      currency: args.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: { pico_order_id: args.orderId },
    });
    return { paymentIntentId: pi.id, clientSecret: pi.client_secret!, isMock: false };
  }

  verifyAndParseWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!signature) throw new Error('missing stripe-signature header');
    // constructEvent requires the exact raw body — express.raw must be mounted on this route.
    const ev = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    return { eventId: ev.id, type: ev.type, data: ev.data.object };
  }
}

/**
 * MOCK billing — used only when no Stripe secret is configured.
 * Client secrets are fake and labeled; the webhook verifier uses the real
 * Stripe signature scheme (HMAC-SHA256 of "t.payload") against the configured
 * webhook secret, so the verification path under test is the real one.
 */
export class MockBilling implements BillingAdapter {
  mode = 'mock' as const;
  private webhookSecret: string;

  constructor(webhookSecret: string) {
    this.webhookSecret = webhookSecret;
  }

  async createPaymentIntent(args: { amountCents: number; currency: string; orderId: string }) {
    const id = `pi_mock_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
    return {
      paymentIntentId: id,
      clientSecret: `${id}_secret_mock_${randomUUID().replaceAll('-', '').slice(0, 16)}`,
      isMock: true,
    };
  }

  verifyAndParseWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!signature) throw new Error('missing stripe-signature header');
    const parts = Object.fromEntries(
      signature.split(',').map(kv => kv.split('=') as [string, string]),
    );
    const t = parts['t'];
    const v1s = Object.entries(parts).filter(([k]) => k === 'v1').map(([, v]) => v);
    if (!t || v1s.length === 0) throw new Error('malformed stripe-signature header');
    const expected = createHmac('sha256', this.webhookSecret)
      .update(`${t}.${rawBody.toString('utf8')}`)
      .digest('hex');
    if (!v1s.includes(expected)) throw new Error('webhook signature verification failed');
    const ev = JSON.parse(rawBody.toString('utf8'));
    return { eventId: ev.id, type: ev.type, data: ev.data.object };
  }

  /** Test/dev helper — build a signed event the verifier will accept. */
  static sign(payload: object, webhookSecret: string): { body: Buffer; header: string } {
    const body = Buffer.from(JSON.stringify(payload));
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', webhookSecret).update(`${t}.${body.toString('utf8')}`).digest('hex');
    return { body, header: `t=${t},v1=${v1}` };
  }
}

export function makeBilling(): BillingAdapter {
  if (config.stripe.configured) {
    return new StripeBilling(config.stripe.secretKey, config.stripe.webhookSecret);
  }
  // Mock webhook secret default keeps local/test runs self-contained.
  return new MockBilling(config.stripe.webhookSecret || 'whsec_mock_local_test');
}
