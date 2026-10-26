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
  esimAccess: {
    accessCode: process.env.ESIMACCESS_ACCESS_CODE ?? '',
    secretKey: process.env.ESIMACCESS_SECRET_KEY ?? '',
    // No sandbox exists: real orders debit the eSIM Access balance.
    ordersEnabled: process.env.ESIMACCESS_ORDERS_ENABLED === 'true',
    markup: Number(req('ESIMACCESS_MARKUP', '2')),
  },
  alerts: {
    emailTo: req('ALERT_EMAIL_TO', 'redreishilife+pico@gmail.com'),
    // Resend (https://resend.com) sends the email; without a key alerts are only logged.
    resendApiKey: process.env.RESEND_API_KEY ?? '',
    emailFrom: req('ALERT_EMAIL_FROM', 'PICO Alerts <onboarding@resend.dev>'),
    lowBalanceCents: Number(req('LOW_BALANCE_ALERT_CENTS', '2000')),
    checkMinutes: Number(req('LOW_BALANCE_CHECK_MINUTES', '60')),
    cooldownHours: Number(req('LOW_BALANCE_ALERT_COOLDOWN_HOURS', '24')),
  },
  sessionSecret: req('SESSION_SECRET', 'dev-only-insecure-session-secret'),
  referral: {
    // "Give $5 — Get $5": friend saves this much, referrer earns this much.
    discountCents: Number(req('REFERRAL_DISCOUNT_CENTS', '500')),
    // Abuse cap (V2 §46): one customer's lifetime referral credit is capped —
    // unlimited fraudulent credit is not possible.
    maxCreditCents: Number(req('REFERRAL_MAX_CREDIT_CENTS', '2500')),
  },
  pricing: {
    // Margin floor (V2 §44): the discounted total may never drop below
    // wholesale cost × (1 + floor) unless explicitly authorized.
    minMarginPct: Number(req('PICO_MIN_MARGIN_PCT', '0.10')),
  },
  admin: {
    // Ops endpoints (/admin/*) are token-gated even in test mode. Production
    // MUST set a real ADMIN_TOKEN — there is no production default.
    token: process.env.ADMIN_TOKEN ??
      (process.env.NODE_ENV === 'production' ? undefined : 'dev-admin-token'),
  },
} as const;

if (config.env === 'production' && !config.admin.token) {
  throw new Error('ADMIN_TOKEN is required in production — admin endpoints would be unguarded.');
}

if (config.stripe.live && config.env !== 'production') {
  // Sprint 1 guardrail: never run live keys outside production.
  throw new Error('Live Stripe key detected outside production — refusing to start.');
}

if (config.supplierAdapter === 'esimaccess'
    && (!config.esimAccess.accessCode || !config.esimAccess.secretKey)) {
  throw new Error('SUPPLIER_ADAPTER=esimaccess needs ESIMACCESS_ACCESS_CODE and ESIMACCESS_SECRET_KEY.');
}
