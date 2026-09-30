/**
 * Telecom Legal, Compliance & Risk-Control — machine-readable core.
 * (master spec §§1, 2, 4, 7)
 *
 * Every country × service pair has an explicit status. Nothing regulated is
 * offered until its status is APPROVED or APPROVED_WITH_CONDITIONS; anything
 * uncertain routes to compliance review rather than auto-provisioning.
 */

export type ComplianceStatus =
  | 'APPROVED'
  | 'APPROVED_WITH_CONDITIONS'
  | 'REQUIRES_ADDITIONAL_VERIFICATION'
  | 'NOT_AVAILABLE'
  | 'LEGAL_REVIEW_REQUIRED';

/** Regulated service categories PICO may eventually touch. */
export type ServiceType =
  | 'esim_data'          // data-only eSIM plans (Sprint 1 catalog)
  | 'phone_number'       // numbering — Sprint 4, gated by NUMBERING_COMPLIANCE
  | 'sms'
  | 'voice'
  | 'caller_id';         // never customer-supplied — carrier-authorized only

export interface ComplianceDecision {
  status: ComplianceStatus;
  /** human-readable conditions/limitations to show the customer pre-purchase */
  conditions: string[];
  /** true => route to compliance review; never auto-provision */
  requiresReview: boolean;
}

/** Country-level rules for numbering/registration (master spec §4). */
export interface CountryRulePack {
  country: string;                 // ISO code
  kycRequired: boolean;
  businessRegistrationRequired: boolean;
  localPresenceRequired: boolean;
  smsAvailable: boolean;
  voiceAvailable: boolean;
  emergencyCalling: 'available' | 'limited' | 'unavailable' | 'unknown';
  callerIdRestrictions: string;
  portability: boolean;
  notes: string;
}

/** Provider compliance record (master spec §2) — one per supplier contract. */
export interface ProviderComplianceRecord {
  providerLegalEntity: string;
  contractStatus: 'none' | 'draft' | 'signed' | 'active';
  countriesAuthorized: string[];   // ISO codes or region codes
  servicesAuthorized: ServiceType[];
  numberingAuthority: string;
  kycRequirements: string;
  businessRegistrationRequirements: string;
  geographicRestrictions: string;
  acceptableUseRequirements: string;
  emergencyServiceLimitations: string;
  callerIdRequirements: string;
  dataRetentionRequirements: string;
  lawfulRequestProcedures: string;
  suspensionProcedures: string;
}

/**
 * Evaluate whether `service` may be offered in `country` under `provider`'s
 * authorization. Unknowns never default to allowed — they route to review.
 */
export function evaluateService(
  provider: ProviderComplianceRecord,
  service: ServiceType,
  country: string,
  rules?: CountryRulePack,
): ComplianceDecision {
  const conditions: string[] = [];

  if (!provider.servicesAuthorized.includes(service)) {
    return { status: 'NOT_AVAILABLE', requiresReview: false,
      conditions: [`${service} is not covered by the provider contract`] };
  }
  if (!provider.countriesAuthorized.includes(country)
      && !provider.countriesAuthorized.includes('*')) {
    return { status: 'LEGAL_REVIEW_REQUIRED', requiresReview: true,
      conditions: [`${country} is not in the provider's authorized list`] };
  }
  if (!rules) {
    return { status: 'LEGAL_REVIEW_REQUIRED', requiresReview: true,
      conditions: ['no country rule pack on file — cannot determine requirements'] };
  }

  if (rules.emergencyCalling !== 'available') {
    conditions.push(`Emergency calling: ${rules.emergencyCalling}`);
  }
  if (service === 'phone_number') {
    if (rules.kycRequired) conditions.push('Identity verification required before activation');
    if (rules.businessRegistrationRequired)
      conditions.push('Business registration documents required');
    if (rules.localPresenceRequired) conditions.push('Local presence required');
    if (rules.callerIdRestrictions) conditions.push(`Caller ID: ${rules.callerIdRestrictions}`);
    const needsVerification = rules.kycRequired
      || rules.businessRegistrationRequired || rules.localPresenceRequired;
    return {
      status: needsVerification ? 'REQUIRES_ADDITIONAL_VERIFICATION' : 'APPROVED_WITH_CONDITIONS',
      requiresReview: false,
      conditions,
    };
  }
  return {
    status: conditions.length ? 'APPROVED_WITH_CONDITIONS' : 'APPROVED',
    requiresReview: false,
    conditions,
  };
}

/* ---------------- Mock provider record (test mode) ----------------
 * Mirrors what a real supplier contract would carry. The mock is clearly
 * labeled: no real authorization exists — every service evaluable is a
 * simulation of the gate, not evidence of authorization.
 */
export const MOCK_PROVIDER: ProviderComplianceRecord = {
  providerLegalEntity: 'Mock Supplier Ltd (TEST — no real contract)',
  contractStatus: 'none',
  countriesAuthorized: ['FR', 'JP', 'US', 'EU38'],
  servicesAuthorized: ['esim_data'],
  numberingAuthority: 'none — data-only plans',
  kycRequirements: 'none for data plans',
  businessRegistrationRequirements: 'n/a',
  geographicRestrictions: 'test catalog only',
  acceptableUseRequirements: 'standard AUP applies (docs/legal/AUP.md)',
  emergencyServiceLimitations: 'data-only plans cannot place calls, including emergency calls',
  callerIdRequirements: 'n/a — no numbers issued',
  dataRetentionRequirements: 'order + webhook records retained per docs/RECOVERY.md',
  lawfulRequestProcedures: 'see docs/COMPLIANCE.md §9',
  suspensionProcedures: 'see docs/COMPLIANCE.md §8',
};

/** Rule packs for the mock catalog destinations (data-only, so mostly N/A). */
export const MOCK_COUNTRY_RULES: Record<string, CountryRulePack> = {
  FR: { country: 'FR', kycRequired: false, businessRegistrationRequired: false,
    localPresenceRequired: false, smsAvailable: false, voiceAvailable: false,
    emergencyCalling: 'unavailable', callerIdRestrictions: 'n/a', portability: false,
    notes: 'data-only travel eSIM; French registration rules apply to SIMs sold IN France by carriers' },
  JP: { country: 'JP', kycRequired: false, businessRegistrationRequired: false,
    localPresenceRequired: false, smsAvailable: false, voiceAvailable: false,
    emergencyCalling: 'unavailable', callerIdRestrictions: 'n/a', portability: false,
    notes: 'data-only travel eSIM' },
  US: { country: 'US', kycRequired: false, businessRegistrationRequired: false,
    localPresenceRequired: false, smsAvailable: false, voiceAvailable: false,
    emergencyCalling: 'unavailable', callerIdRestrictions: 'n/a', portability: false,
    notes: 'data-only travel eSIM' },
  EU38: { country: 'EU38', kycRequired: false, businessRegistrationRequired: false,
    localPresenceRequired: false, smsAvailable: false, voiceAvailable: false,
    emergencyCalling: 'unavailable', callerIdRestrictions: 'n/a', portability: false,
    notes: 'regional data-only eSIM covering 38 European countries' },
};

/** Risk levels for fraud/abuse controls (master spec §7, spec §19.D). */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED';

/**
 * COMPLIANCE_REVIEW_REQUIRED record (V2 spec §1). When a regulated feature's
 * rules can't be confidently determined, the feature stays disabled and one of
 * these records documents exactly what must be resolved before it can ship.
 */
export interface ComplianceReviewRecord {
  jurisdiction: string;
  feature: ServiceType;
  provider: string;
  regulatoryQuestion: string;
  informationRequired: string[];
  technicalOptions: string[];
  knownRisks: string[];
  requiredConfirmation: string;
}

export function buildReviewRecord(
  provider: ProviderComplianceRecord,
  service: ServiceType,
  country: string,
  decision: ComplianceDecision,
): ComplianceReviewRecord {
  return {
    jurisdiction: country,
    feature: service,
    provider: provider.providerLegalEntity,
    regulatoryQuestion:
      `May ${service} be offered to PICO customers in ${country} under the ` +
      `provider's current authorization?`,
    informationRequired: [
      'Provider confirmation of country coverage for this service',
      'Country rule pack (KYC, registration, numbering, emergency, AUP requirements)',
      'Any required customer disclosures or verification steps',
    ],
    technicalOptions: [
      'Keep feature disabled for this market (current default)',
      'Enable only after provider contract amendment + rule pack on file',
      'Offer via an alternate authorized provider if one exists',
    ],
    knownRisks: [
      'Regulatory exposure if sold without authorization',
      'Provider contract violation',
      'Customer harm from service that cannot legally be delivered',
    ],
    requiredConfirmation:
      `Written provider authorization for ${service} in ${country}, plus ` +
      `compliance sign-off. Decision recorded: ${decision.status}`,
  };
}
