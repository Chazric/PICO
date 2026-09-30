import 'dotenv/config';

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var ${name}`);
  return v;
}

const stripeSecret = process.env.STRIPE_SECRET_KEY ?? '';
const stripeConfigured = /^sk_(test|live)_\S+/.test(stripeSecret);

export const config = {
  env: req('NODE_ENV', 'development'),
  port: Number(req('PORT', '4242')),
  databasePath: req('DATABASE_PATH', './data/pico.sqlite'),
  stripe: {
    secretKey: stripeSecret,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    configured: stripeConfigured,
    live: stripeSecret.startsWith('sk_live_'),
  },
  supplierAdapter: req('SUPPLIER_ADAPTER', 'mock'),
  sessionSecret: req('SESSION_SECRET', 'dev-only-insecure-session-secret'),
} as const;

if (config.stripe.live && config.env !== 'production') {
  // Sprint 1 guardrail: never run live keys outside production.
  throw new Error('Live Stripe key detected outside production — refusing to start.');
}
