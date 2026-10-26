import { describe, it, expect } from 'vitest';
import { EsimAccessSupplier, retailCents } from '../src/supplier/esimaccess.js';
import { SupplierCancelRefused } from '../src/supplier/types.js';

const GB = 2 ** 30;
function pkg(slug: string, price: number, volumeGb: number, location = 'US') {
  return { packageCode: `PC-${slug}`, slug, name: slug, price, currencyCode: 'USD', volume: volumeGb * GB,
    unusedValidTime: 180, duration: 30, durationUnit: 'DAY', location, locationCode: location,
    dataType: 1, speed: '4G/5G' };
}
const catalog: Record<string, unknown[]> = {
  US: [pkg('US_3_30', 22000, 3), pkg('US_10_30', 66300, 10), pkg('US_20_30', 120000, 20), pkg('US_1_7', 9000, 1)],
  FR: [pkg('FR_3_30', 18000, 3, 'FR')],
  JP: [],
  '!RG': [pkg('EU-35_3_30', 30000, 3, 'FR,DE,IT')],
};

function fakeApi(opts: { allocateAfter?: number; cancelFails?: boolean; alreadyCanceled?: boolean } = {}) {
  const calls: Array<{ path: string; body: any; headers: Record<string, string> }> = [];
  const orders = new Map<string, string>();
  let queries = 0;
  const impl = (async (url: string, init: RequestInit) => {
    const path = url.split('/api/v1/open/')[1];
    const body = JSON.parse(String(init.body));
    calls.push({ path, body, headers: init.headers as Record<string, string> });
    const ok = (obj: unknown) => new Response(JSON.stringify({ success: true, errorCode: '0', obj }));
    if (path === 'package/list') return ok({ packageList: catalog[body.locationCode] ?? [] });
    if (path === 'esim/order') {
      if (!orders.has(body.transactionId)) orders.set(body.transactionId, `B${orders.size + 1}`);
      return ok({ orderNo: orders.get(body.transactionId) });
    }
    if (path === 'esim/query' && body.iccid) {
      return ok({ esimList: [{ iccid: body.iccid, esimStatus: opts.alreadyCanceled ? 'CANCEL' : 'IN_USE' }] });
    }
    if (path === 'esim/query') {
      queries++;
      if (queries <= (opts.allocateAfter ?? 0)) {
        return new Response(JSON.stringify({ success: false, errorCode: '200010', errorMsg: 'allocating' }));
      }
      return ok({ esimList: [{ iccid: '8943000000000000001', orderNo: body.orderNo,
        ac: 'LPA:1$rsp-eu.redteamobile.com$ABC123' }] });
    }
    if (path === 'esim/cancel') {
      if (opts.cancelFails) {
        return new Response(JSON.stringify({ success: false, errorCode: '310241', errorMsg: 'profile already installed' }));
      }
      return ok({});
    }
    return ok({ balance: 500000 });
  }) as unknown as typeof fetch;
  return { impl, calls, orders };
}

async function make(ordersEnabled = true, allocateAfter = 0) {
  const api = fakeApi({ allocateAfter });
  const s = new EsimAccessSupplier({ accessCode: 'ac', secretKey: 'sk', ordersEnabled,
    fetchImpl: api.impl, pollIntervalMs: 1, pollTimeoutMs: 1000 });
  await s.refreshCatalog();
  return { s, api };
}

describe('eSIM Access adapter', () => {
  it('prices at 2× wholesale rounded up to $x.99, never below $2.99', () => {
    expect(retailCents(22000, 2)).toBe(499);   // $2.20 cost → $4.40 → $4.99
    expect(retailCents(66300, 2)).toBe(1399);  // $6.63 → $13.26 → $13.99
    expect(retailCents(5000, 2)).toBe(299);
  });

  it('builds the curated catalog and skips missing tiers', async () => {
    const { s } = await make();
    expect(s.listPlans('US').map(p => p.planId)).toEqual(['esa-US_3_30', 'esa-US_10_30', 'esa-US_20_30']);
    expect(s.listPlans('FR')).toHaveLength(1);
    expect(s.listDestinations().map(d => d.code)).toEqual(['US', 'FR', 'EU35']);
    const eu = s.listDestinations().find(d => d.code === 'EU35')!;
    expect(eu.coveredCountries).toEqual(['FR', 'DE', 'IT']);
    const us = s.getPlan('esa-US_3_30')!;
    expect(us).toMatchObject({ dataBytes: 3 * GB, validityDays: 30, costCents: 220, priceCents: 499,
      activationDeadlineDays: 180 });
  });

  it('signs requests with the access code', async () => {
    const { api } = await make();
    const h = api.calls[0].headers;
    expect(h['RT-AccessCode']).toBe('ac');
    expect(h['RT-Signature']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('orders with the idempotency key as transactionId and waits for allocation', async () => {
    const { s, api } = await make(true, 2);
    const r = await s.provision({ orderId: 'o1', planId: 'esa-US_3_30', idempotencyKey: 'idem-1' });
    expect(r).toEqual({ iccid: '8943000000000000001', activationCode: 'LPA:1$rsp-eu.redteamobile.com$ABC123',
      smdpAddress: 'rsp-eu.redteamobile.com', isMock: false });
    const order = api.calls.find(c => c.path === 'esim/order')!;
    expect(order.body).toEqual({ transactionId: 'idem-1', amount: 22000,
      packageInfoList: [{ packageCode: 'PC-US_3_30', count: 1, price: 22000 }] });
  });

  it('lookup reuses the same transactionId and returns the original order', async () => {
    const { s, api } = await make();
    await s.provision({ orderId: 'o1', planId: 'esa-US_3_30', idempotencyKey: 'idem-2' });
    const r = await s.lookupProvision('idem-2');
    expect(r?.iccid).toBe('8943000000000000001');
    expect(api.orders.size).toBe(1);
  });

  it('refuses to order when ordering is disabled', async () => {
    const { s, api } = await make(false);
    await expect(s.provision({ orderId: 'o1', planId: 'esa-US_3_30', idempotencyKey: 'k' }))
      .rejects.toThrow(/disabled/);
    expect(api.calls.some(c => c.path === 'esim/order')).toBe(false);
  });
});

describe('eSIM Access cancel & naming', () => {
  it('labels the Europe region as excluding France', async () => {
    const { s } = await make();
    expect(s.listDestinations().find(d => d.code === 'EU35')?.name).toBe('Europe 35 (excludes France)');
  });

  it('cancels by ICCID through esim/cancel', async () => {
    const { s, api } = await make();
    await s.cancel('8943000000000000001');
    expect(api.calls.at(-1)).toMatchObject({ path: 'esim/cancel', body: { iccid: '8943000000000000001' } });
  });

  it('maps a provider refusal to SupplierCancelRefused', async () => {
    const api = fakeApi({ cancelFails: true });
    const s = new EsimAccessSupplier({ accessCode: 'ac', secretKey: 'sk', ordersEnabled: false, fetchImpl: api.impl });
    await expect(s.cancel('89430')).rejects.toBeInstanceOf(SupplierCancelRefused);
  });

  it('treats a profile that is already canceled at eSIM Access as done', async () => {
    const api = fakeApi({ cancelFails: true, alreadyCanceled: true });
    const s = new EsimAccessSupplier({ accessCode: 'ac', secretKey: 'sk', ordersEnabled: false, fetchImpl: api.impl });
    await expect(s.cancel('89430')).resolves.toBeUndefined();
    expect(api.calls.at(-1)).toMatchObject({ path: 'esim/query', body: { iccid: '89430' } });
  });
});
