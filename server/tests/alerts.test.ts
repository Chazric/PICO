import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { checkSupplierBalance, ResendMailer, type Mailer } from '../src/alerts.js';

function recorder(fail = false) {
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  const mailer: Mailer = { configured: true, async send(m) { if (fail) throw new Error('smtp down'); sent.push(m); } };
  return { sent, mailer };
}

const base = (db: ReturnType<typeof openDb>, mailer: Mailer, balance: number, nowMs: number) => ({
  db, mailer, supplierName: 'esimaccess', getBalanceCents: async () => balance,
  to: 'owner@example.com', thresholdCents: 2000, cooldownHours: 24, nowMs,
});

describe('low-balance alert', () => {
  const t0 = Date.parse('2026-10-26T12:00:00Z');

  it('does nothing while the balance is above the threshold', async () => {
    const db = openDb(':memory:');
    const { sent, mailer } = recorder();
    const r = await checkSupplierBalance(base(db, mailer, 4820, t0));
    expect(r).toEqual({ balanceCents: 4820, low: false, alerted: false });
    expect(sent).toHaveLength(0);
  });

  it('emails once when low, then waits for the cooldown', async () => {
    const db = openDb(':memory:');
    const { sent, mailer } = recorder();
    expect((await checkSupplierBalance(base(db, mailer, 1500, t0))).alerted).toBe(true);
    expect(sent[0].to).toBe('owner@example.com');
    expect(sent[0].subject).toBe('PICO: esimaccess balance is low ($15.00)');
    expect(sent[0].text).toContain('below the $20.00 alert level');

    expect((await checkSupplierBalance(base(db, mailer, 1400, t0 + 3_600_000))).alerted).toBe(false);
    expect((await checkSupplierBalance(base(db, mailer, 1400, t0 + 25 * 3_600_000))).alerted).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it('does not record a failed send, so the next check retries', async () => {
    const db = openDb(':memory:');
    await expect(checkSupplierBalance(base(db, recorder(true).mailer, 100, t0))).rejects.toThrow('smtp down');
    const { sent, mailer } = recorder();
    expect((await checkSupplierBalance(base(db, mailer, 100, t0 + 60_000))).alerted).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it('sends through the Resend API', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
    }) as unknown as typeof fetch;
    await new ResendMailer('re_test', 'PICO <onboarding@resend.dev>', fetchImpl)
      .send({ to: 'owner@example.com', subject: 's', text: 't' });
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    expect(JSON.parse(String(calls[0].init.body))).toEqual(
      { from: 'PICO <onboarding@resend.dev>', to: ['owner@example.com'], subject: 's', text: 't' });
  });
});
