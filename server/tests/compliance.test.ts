import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeFixture } from './helpers.js';
import { evaluateService, MOCK_PROVIDER, MOCK_COUNTRY_RULES } from '../src/compliance/statuses.js';

describe('compliance engine (master spec §§1,2,4)', () => {
  it('never assumes a service is available — unknown country routes to review', () => {
    const d = evaluateService(MOCK_PROVIDER, 'esim_data', 'BR', undefined);
    expect(d.status).toBe('LEGAL_REVIEW_REQUIRED');
    expect(d.requiresReview).toBe(true);
  });

  it('rejects services the provider contract does not authorize', () => {
    const d = evaluateService(MOCK_PROVIDER, 'phone_number', 'FR', MOCK_COUNTRY_RULES.FR);
    expect(d.status).toBe('NOT_AVAILABLE');
    expect(d.requiresReview).toBe(false);
  });

  it('marks data-only eSIM as approved-with-conditions (emergency limits disclosed)', () => {
    const d = evaluateService(MOCK_PROVIDER, 'esim_data', 'FR', MOCK_COUNTRY_RULES.FR);
    expect(d.status).toBe('APPROVED_WITH_CONDITIONS');
    expect(d.conditions.join(' ')).toContain('Emergency calling');
  });

  it('attaches an explicit compliance status to every catalog destination', async () => {
    const fx = makeFixture();
    const res = await request(fx.app).get('/api/v1/catalog/destinations');
    expect(res.status).toBe(200);
    for (const d of res.body.destinations) {
      expect(d.compliance.status).toMatch(/APPROVED|APPROVED_WITH_CONDITIONS/);
      expect(d.compliance.requiresReview).toBe(false);
    }
  });

  it('plans carry the market compliance decision', async () => {
    const fx = makeFixture();
    const res = await request(fx.app).get('/api/v1/catalog/plans?destination=FR');
    expect(res.body.compliance.status).toBe('APPROVED_WITH_CONDITIONS');
  });
});
