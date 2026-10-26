import { createHmac, randomUUID } from 'node:crypto';
import type { Destination, PlanDisclosure, ProvisionResult, SupplierAdapter } from './types.js';
import { SupplierCancelRefused, SupplierTimeout } from './types.js';

/**
 * eSIM Access (https://docs.esimaccess.com) supplier adapter.
 * Prices from the API are USD × 10,000 (10000 = $1.00); volumes are bytes.
 * There is no sandbox: every order is real and debits the account balance,
 * so ordering is disabled unless `ordersEnabled` is set explicitly.
 */

export interface EsimAccessConfig {
  accessCode: string;
  secretKey: string;
  baseUrl?: string;
  ordersEnabled: boolean;
  /** Retail = wholesale × markup, rounded up to the next $x.99. */
  markup?: number;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

interface PackageInfo {
  packageCode: string;
  slug: string;
  name: string;
  price: number;
  currencyCode: string;
  volume: number;
  unusedValidTime: number;
  duration: number;
  durationUnit: string;
  location: string;
  locationCode: string;
  dataType: number;
  speed?: string;
  fupPolicy?: string;
  smsStatus?: number;
}

interface EsimProfile {
  iccid: string;
  ac: string;
  transactionId?: string;
  orderNo?: string;
}

type Tier = PlanDisclosure['tier'];

/** PICO destination → eSIM Access location filter + the slug used for each tier. */
const DESTINATIONS: Array<Destination & { query: string; tiers: Record<Tier, string> }> = [
  { code: 'US', name: 'United States', kind: 'country', query: 'US',
    tiers: { light: 'US_3_30', everyday: 'US_10_30', heavy: 'US_20_30' } },
  { code: 'FR', name: 'France', kind: 'country', query: 'FR',
    tiers: { light: 'FR_3_30', everyday: 'FR_10_30', heavy: 'FR_20_30' } },
  { code: 'JP', name: 'Japan', kind: 'country', query: 'JP',
    tiers: { light: 'JP_3_30', everyday: 'JP_10_30', heavy: 'JP_20_30' } },
  { code: 'EU35', name: 'Europe 35 (excludes France)', kind: 'region', query: '!RG',
    tiers: { light: 'EU-35_3_30', everyday: 'EU-35_10_30', heavy: 'EU-35_20_30' } },
];

const TIER_NAMES: Record<Tier, string> = { light: 'Light Use', everyday: 'Everyday Use', heavy: 'Heavy Use' };

export function retailCents(wholesaleUnits: number, markup: number): number {
  const costCents = Math.ceil(wholesaleUnits / 100);
  const target = Math.ceil(costCents * markup);
  const dollars = Math.max(3, Math.ceil((target + 1) / 100));
  return dollars * 100 - 1;
}

function gb(bytes: number): string {
  const v = bytes / 2 ** 30;
  return `${Number.isInteger(v) ? v : v.toFixed(1)} GB`;
}

export function toPlan(dest: Destination, tier: Tier, p: PackageInfo, markup: number): PlanDisclosure {
  const covered = p.location.split(',').map(s => s.trim()).filter(Boolean);
  const days = p.durationUnit === 'DAY' ? p.duration : p.duration * 30;
  return {
    planId: `esa-${p.slug}`,
    name: `${dest.name} ${TIER_NAMES[tier]} — ${gb(p.volume)} / ${days} days`,
    tier,
    destination: dest.code,
    coveredDestinations: covered,
    dataAllowance: gb(p.volume),
    dataBytes: p.volume,
    validityDays: days,
    validityStarts: 'when the eSIM first connects to a covered network',
    activationDeadlineDays: p.unusedValidTime || 180,
    calls: { included: false, detail: 'Data only — no calls on this plan.' },
    sms: { included: false, detail: 'Data only — no SMS on this plan.' },
    phoneNumber: { available: false, detail: 'No local phone number is included.' },
    hotspot: 'Personal hotspot allowed where the local network permits it.',
    speedPolicy: p.fupPolicy
      ? `Full speed (${p.speed ?? '4G/5G'}) up to the allowance, then ${p.fupPolicy}.`
      : `Full speed (${p.speed ?? '4G/5G'}) up to the allowance; data stops when it runs out (no overage charges).`,
    fairUse: 'Subject to the local network operator\'s fair-use policy.',
    renewal: { renewable: false, detail: 'One-time purchase; no automatic renewal.' },
    sharedAcrossCountries: covered.length > 1,
    priceCents: retailCents(p.price, markup),
    costCents: Math.ceil(p.price / 100),
    currency: p.currencyCode || 'USD',
  };
}

export class EsimAccessError extends Error {
  constructor(public code: string, msg: string) { super(`eSIM Access ${code}: ${msg}`); this.name = 'EsimAccessError'; }
}

export class EsimAccessSupplier implements SupplierAdapter {
  name = 'esimaccess';
  private plans: PlanDisclosure[] = [];
  private packages = new Map<string, PackageInfo>();
  private base: string;
  private fetchImpl: typeof fetch;
  private markup: number;

  constructor(private cfg: EsimAccessConfig) {
    this.base = cfg.baseUrl ?? 'https://api.esimaccess.com';
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.markup = cfg.markup ?? 2;
  }

  private async call<T>(path: string, body: unknown, timeoutMs = 20_000): Promise<T> {
    const raw = JSON.stringify(body ?? {});
    const ts = String(Date.now());
    const rid = randomUUID().replace(/-/g, '');
    const signature = createHmac('sha256', this.cfg.secretKey)
      .update(ts + rid + this.cfg.accessCode + raw).digest('hex');
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/api/v1/open/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'RT-AccessCode': this.cfg.accessCode,
          'RT-RequestID': rid,
          'RT-Timestamp': ts,
          'RT-Signature': signature,
        },
        body: raw,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new SupplierTimeout(`eSIM Access ${path} unreachable: ${String(err)}`);
    }
    if (res.status >= 500) throw new SupplierTimeout(`eSIM Access ${path} HTTP ${res.status}`);
    const json = await res.json() as { success: boolean; errorCode?: string | null; errorMsg?: string | null; obj?: T };
    if (!json.success) throw new EsimAccessError(json.errorCode ?? 'unknown', json.errorMsg ?? 'request failed');
    return json.obj as T;
  }

  /** Load the curated catalog. Missing packages are skipped (fail closed). */
  async refreshCatalog(): Promise<void> {
    const plans: PlanDisclosure[] = [];
    const packages = new Map<string, PackageInfo>();
    for (const dest of DESTINATIONS) {
      const obj = await this.call<{ packageList: PackageInfo[] }>('package/list',
        { locationCode: dest.query, type: 'BASE' });
      const bySlug = new Map(obj.packageList.map(p => [p.slug, p]));
      for (const tier of ['light', 'everyday', 'heavy'] as Tier[]) {
        const pkg = bySlug.get(dest.tiers[tier]);
        if (!pkg || pkg.dataType !== 1) continue;
        const plan = toPlan(dest, tier, pkg, this.markup);
        plans.push(plan);
        packages.set(plan.planId, pkg);
      }
    }
    this.plans = plans;
    this.packages = packages;
  }

  async balanceCents(): Promise<number> {
    const obj = await this.call<{ balance: number }>('balance/query', {});
    return Math.floor(obj.balance / 100);
  }

  listDestinations(): Destination[] {
    return DESTINATIONS
      .filter(d => this.plans.some(p => p.destination === d.code))
      .map(({ code, name, kind }) => {
        const covered = this.plans.find(p => p.destination === code)?.coveredDestinations;
        return kind === 'region' ? { code, name, kind, coveredCountries: covered } : { code, name, kind };
      });
  }

  listPlans(destination?: string) {
    return destination ? this.plans.filter(p => p.destination === destination) : this.plans;
  }

  getPlan(planId: string) { return this.plans.find(p => p.planId === planId) ?? null; }

  private async waitForProfile(orderNo: string): Promise<ProvisionResult> {
    const interval = this.cfg.pollIntervalMs ?? 3_000;
    const deadline = Date.now() + (this.cfg.pollTimeoutMs ?? 60_000);
    while (Date.now() < deadline) {
      try {
        const obj = await this.call<{ esimList: EsimProfile[] }>('esim/query',
          { orderNo, iccid: '', pager: { pageNum: 1, pageSize: 20 } });
        const p = obj.esimList?.[0];
        if (p?.ac && p.iccid) return toResult(p);
      } catch (err) {
        // 200010: SM-DP+ is still allocating the profile.
        if (!(err instanceof EsimAccessError && err.code === '200010')) throw err;
      }
      await new Promise(r => setTimeout(r, interval));
    }
    throw new SupplierTimeout(`eSIM Access order ${orderNo} not allocated in time`);
  }

  private async placeOrder(idempotencyKey: string, pkg: PackageInfo): Promise<string> {
    const obj = await this.call<{ orderNo: string }>('esim/order', {
      transactionId: idempotencyKey.slice(0, 50),
      amount: pkg.price,
      packageInfoList: [{ packageCode: pkg.packageCode, count: 1, price: pkg.price }],
    });
    return obj.orderNo;
  }

  async provision(req: { orderId: string; planId: string; idempotencyKey: string }): Promise<ProvisionResult> {
    if (!this.cfg.ordersEnabled) {
      throw new Error('real eSIM ordering is disabled on this server (ESIMACCESS_ORDERS_ENABLED is not true)');
    }
    const pkg = this.packages.get(req.planId);
    if (!pkg) throw new Error(`unknown eSIM Access plan ${req.planId}`);
    const orderNo = await this.placeOrder(req.idempotencyKey, pkg);
    return this.waitForProfile(orderNo);
  }

  /**
   * Refunds the eSIM price to the balance. eSIM Access only allows this while the
   * profile is unused and not installed (GOT_RESOURCE / RELEASED); canceling an
   * already-canceled profile succeeds again.
   */
  async cancel(iccid: string): Promise<void> {
    try {
      await this.call('esim/cancel', { iccid });
    } catch (err) {
      if (err instanceof EsimAccessError) throw new SupplierCancelRefused(err.message);
      throw err;
    }
  }

  /** A repeated transactionId returns the original order (eSIM Access dedupes on it). */
  async lookupProvision(idempotencyKey: string): Promise<ProvisionResult | null> {
    if (!this.cfg.ordersEnabled) return null;
    const pkg = [...this.packages.values()][0];
    if (!pkg) return null;
    try {
      const orderNo = await this.placeOrder(idempotencyKey, pkg);
      return await this.waitForProfile(orderNo);
    } catch {
      return null;
    }
  }
}

function toResult(p: EsimProfile): ProvisionResult {
  // ac = "LPA:1$<smdp address>$<matching id>"
  const parts = p.ac.split('$');
  return { iccid: p.iccid, activationCode: p.ac, smdpAddress: parts[1] ?? '', isMock: false };
}
