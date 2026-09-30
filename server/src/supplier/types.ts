// Supplier-facing contract. A real eSIM provider implements this in Sprint 2;
// the mock adapter below implements it fully so the app/backend never special-case it.

export interface Destination {
  code: string;        // ISO country or region code
  name: string;
  kind: 'country' | 'region';
  coveredCountries?: string[]; // for regions
}

export interface PlanDisclosure {
  planId: string;
  name: string;
  tier: 'light' | 'everyday' | 'heavy';
  destination: string;
  coveredDestinations: string[];
  dataAllowance: string;         // e.g. "3 GB"
  dataBytes: number;
  validityDays: number;
  validityStarts: string;        // human rule, e.g. "on first network connection"
  activationDeadlineDays: number;
  calls: { included: boolean; detail: string };
  sms: { included: boolean; detail: string };
  phoneNumber: { available: boolean; detail: string };
  hotspot: string;
  speedPolicy: string;
  fairUse: string;
  renewal: { renewable: boolean; detail: string };
  sharedAcrossCountries: boolean;
  priceCents: number;
  /** Wholesale cost (V2 §44 pricing engine) — margin floor is checked against it. */
  costCents: number;
  currency: string;
}

export interface ProvisionResult {
  iccid: string;
  activationCode: string;
  smdpAddress: string;
  isMock: boolean;
}

export interface SupplierAdapter {
  name: string;
  listDestinations(): Destination[];
  listPlans(destination?: string): PlanDisclosure[];
  getPlan(planId: string): PlanDisclosure | null;
  /** May throw SupplierTimeout — a timeout does NOT prove the order failed. */
  provision(req: { orderId: string; planId: string; idempotencyKey: string }): Promise<ProvisionResult>;
  /** Reconcile uncertain outcomes: look up a prior provision call by idempotency key. */
  lookupProvision(idempotencyKey: string): Promise<ProvisionResult | null>;
}

export class SupplierTimeout extends Error {
  constructor(msg = 'supplier timeout') { super(msg); this.name = 'SupplierTimeout'; }
}
