import { createHash, randomInt } from 'node:crypto';
import type { Destination, PlanDisclosure, ProvisionResult, SupplierAdapter } from './types.js';
import { SupplierTimeout } from './types.js';

/**
 * Explicit MOCK supplier adapter (spec §12): clearly labeled simulated results.
 * Deterministic catalog; provisioning outcomes can be forced per-order for tests
 * via plan ids or env knobs below — never used for real purchases.
 */

const COUNTRIES: Destination[] = [
  { code: 'FR', name: 'France', kind: 'country' },
  { code: 'JP', name: 'Japan', kind: 'country' },
  { code: 'US', name: 'United States', kind: 'country' },
  {
    code: 'EU38', name: 'Europe (38 countries)', kind: 'region',
    coveredCountries: ['FR', 'DE', 'IT', 'ES', 'PT', 'NL', 'BE', 'IE', 'AT', 'PL'],
  },
];

function plan(
  destination: string, tier: PlanDisclosure['tier'], dataGb: number, days: number, cents: number,
): PlanDisclosure {
  const dest = COUNTRIES.find(d => d.code === destination)!;
  const covered = dest.coveredCountries ?? [dest.code];
  const tierName = { light: 'Light Use', everyday: 'Everyday Use', heavy: 'Heavy Use' }[tier];
  return {
    planId: `mock-${destination.toLowerCase()}-${tier}`,
    name: `${dest.name} ${tierName} — ${dataGb} GB / ${days} days`,
    tier,
    destination,
    coveredDestinations: covered,
    dataAllowance: `${dataGb} GB`,
    dataBytes: dataGb * 1_000_000_000,
    validityDays: days,
    validityStarts: 'on first connection to a covered network',
    activationDeadlineDays: 180,
    calls: { included: false, detail: 'Data only — no calls or SMS on this plan.' },
    sms: { included: false, detail: 'Data only.' },
    phoneNumber: { available: false, detail: 'No local phone number is included.' },
    hotspot: 'Personal hotspot allowed where the local network permits it.',
    speedPolicy: 'Full speed up to allowance; data stops when exhausted (no overage charges).',
    fairUse: 'No throttling in covered countries.',
    renewal: { renewable: false, detail: 'One-time purchase; top-up available after activation.' },
    sharedAcrossCountries: covered.length > 1,
    priceCents: cents,
    costCents: Math.round(cents * 0.55), // simulated wholesale (labeled mock)
    currency: 'USD',
  };
}

const CATALOG: PlanDisclosure[] = [
  plan('FR', 'light', 3, 7, 699),
  plan('FR', 'everyday', 10, 15, 1499),
  plan('FR', 'heavy', 30, 30, 3299),
  plan('JP', 'light', 3, 7, 899),
  plan('JP', 'everyday', 10, 15, 1899),
  plan('JP', 'heavy', 30, 30, 3999),
  plan('US', 'light', 3, 7, 799),
  plan('US', 'everyday', 10, 15, 1699),
  plan('US', 'heavy', 30, 30, 3499),
  plan('EU38', 'light', 3, 7, 999),
  plan('EU38', 'everyday', 10, 15, 1999),
  plan('EU38', 'heavy', 30, 30, 3999),
];

/** Deterministic fake provisioning result derived from the idempotency key. */
function fakeResult(idemKey: string): ProvisionResult {
  const h = createHash('sha256').update(idemKey).digest('hex');
  return {
    iccid: `8901${h.slice(0, 16)}`,
    activationCode: `LPA:1$mock.smdp.example$${h.slice(16, 32)}`,
    smdpAddress: 'mock.smdp.example',
    isMock: true,
  };
}

export class MockSupplier implements SupplierAdapter {
  name = 'mock';
  /** In-memory record of provision calls, keyed by idempotency key (what a real supplier stores). */
  private provisioned = new Map<string, ProvisionResult>();
  /** Test hooks: keys that should hang once (timeout), always fail, etc. */
  private failOnceTimeout = new Set<string>();

  listDestinations() { return COUNTRIES; }
  listPlans(destination?: string) {
    return destination ? CATALOG.filter(p => p.destination === destination) : CATALOG;
  }
  getPlan(planId: string) { return CATALOG.find(p => p.planId === planId) ?? null; }

  /** Test hook — makes the first provision attempt for a key throw SupplierTimeout. */
  forceTimeoutOnce(idempotencyKey: string) { this.failOnceTimeout.add(idempotencyKey); }

  async provision(req: { orderId: string; planId: string; idempotencyKey: string }): Promise<ProvisionResult> {
    if (this.failOnceTimeout.delete(req.idempotencyKey)) {
      throw new SupplierTimeout(`mock supplier timed out for order ${req.orderId}`);
    }
    // Idempotent: same key always yields the same eSIM — a retry never duplicates.
    let res = this.provisioned.get(req.idempotencyKey);
    if (!res) {
      res = fakeResult(req.idempotencyKey);
      this.provisioned.set(req.idempotencyKey, res);
    }
    return res;
  }

  async lookupProvision(idempotencyKey: string): Promise<ProvisionResult | null> {
    return this.provisioned.get(idempotencyKey) ?? null;
  }
}
