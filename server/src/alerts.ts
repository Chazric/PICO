import type { DB } from './db.js';
import { uid } from './db.js';

export interface Mailer {
  readonly configured: boolean;
  send(msg: { to: string; subject: string; text: string }): Promise<void>;
}

/** Sends through the Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendMailer implements Mailer {
  readonly configured = true;
  constructor(private apiKey: string, private from: string, private fetchImpl: typeof fetch = fetch) {}

  async send(msg: { to: string; subject: string; text: string }) {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, text: msg.text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${await res.text()}`);
  }
}

/** Fallback when no email provider is configured: the alert is only logged. */
export class LogMailer implements Mailer {
  readonly configured = false;
  async send(msg: { to: string; subject: string; text: string }) {
    console.warn(`[alert email not configured] to=${msg.to} ${msg.subject}`);
  }
}

export function makeMailer(cfg: { resendApiKey: string; emailFrom: string }): Mailer {
  return cfg.resendApiKey ? new ResendMailer(cfg.resendApiKey, cfg.emailFrom) : new LogMailer();
}

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Email the owner when the prepaid supplier balance drops below the threshold,
 * at most once per cooldown window. A failed send is not recorded, so the next
 * check retries it.
 */
export async function checkSupplierBalance(o: {
  db: DB;
  supplierName: string;
  getBalanceCents: () => Promise<number>;
  mailer: Mailer;
  to: string;
  thresholdCents: number;
  cooldownHours: number;
  nowMs?: number;
}): Promise<{ balanceCents: number; low: boolean; alerted: boolean }> {
  const balanceCents = await o.getBalanceCents();
  const low = balanceCents < o.thresholdCents;
  if (!low) return { balanceCents, low, alerted: false };

  const nowMs = o.nowMs ?? Date.now();
  const last = o.db.prepare(
    `SELECT created_at FROM admin_events WHERE action='low_balance_alert' ORDER BY created_at DESC LIMIT 1`,
  ).get() as { created_at: string } | undefined;
  if (last && nowMs - Date.parse(last.created_at) < o.cooldownHours * 3_600_000) {
    return { balanceCents, low, alerted: false };
  }

  await o.mailer.send({
    to: o.to,
    subject: `PICO: ${o.supplierName} balance is low (${usd(balanceCents)})`,
    text: [
      `Your ${o.supplierName} balance is ${usd(balanceCents)}, below the ${usd(o.thresholdCents)} alert level.`,
      '',
      'Each PICO order is paid from this balance. Once it cannot cover an eSIM, new orders',
      'stop being delivered and go to "needs review".',
      '',
      'Top up the balance in your eSIM Access console to keep sales running.',
      `You will get this reminder at most every ${o.cooldownHours} hours while the balance stays low.`,
    ].join('\n'),
  });
  o.db.prepare(`INSERT INTO admin_events (id, actor, action, order_id, detail, created_at)
    VALUES (?, 'system', 'low_balance_alert', NULL, ?, ?)`).run(uid(),
    JSON.stringify({ balanceCents, thresholdCents: o.thresholdCents, emailed: o.mailer.configured }),
    new Date(nowMs).toISOString());
  return { balanceCents, low, alerted: true };
}
