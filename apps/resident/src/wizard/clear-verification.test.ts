import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyVerificationToPrimary,
  parseWizardHash,
  unverifyField,
  isFieldVerified,
  readPendingVerification,
  writePendingVerification,
  clearPendingVerification,
  setReturnLegVerificationId,
  takeReturnLegVerificationId,
  describeResolution,
} from './clear-verification';
import { normalizeDocumentTraits, normalizeIsoDate, normalizePhoneTrait } from '../lib/verify-assist-client';
import type { Verification } from '../lib/verify-assist-client';

// Demo identity the server returns in mock mode (docs/api-contract.md).
function jordan(overrides: Partial<Verification> = {}): Verification {
  return {
    id: 'verify_abc123',
    externalRef: 'SX-APP-2026-000001',
    role: 'applicant',
    subjectName: 'Jordan Rivera',
    status: 'success',
    hostedUrl: 'http://localhost:5187/flow?token=t',
    createdAt: '2026-09-14T20:00:00.000Z',
    completedAt: '2026-09-14T20:02:00.000Z',
    checks: [{ name: 'selfie_liveness', status: 'success' }],
    traits: {
      document: {
        document_type: 'drivers_license',
        first_name: 'Jordan',
        middle_name: null,
        last_name: 'Rivera',
        date_of_birth: '1991-01-10',
        gender: 'X',
        address_line1: '742 Evergreen Terrace',
        address_line2: null,
        city: 'Springfield',
        state: 'SX',
        postal_code: '55501',
      },
      phone: '(555) 123-4567',
      ssnLast4: '6789',
    },
    determination: { result: 'issue_found', duplicate_enrollment: true, payer_state: 'SC', payer_state_name: 'South Carolina' },
    resolution: null,
    ...overrides,
  };
}

describe('parseWizardHash', () => {
  it('parses a bare step hash', () => {
    const { stepId, params } = parseWizardHash('#/personal');
    expect(stepId).toBe('personal');
    expect(params.get('verified')).toBeNull();
  });
  it('splits a query string after the step id (hosted-flow returnTo)', () => {
    const { stepId, params } = parseWizardHash('#/personal?verified=verify_abc&x=1');
    expect(stepId).toBe('personal');
    expect(params.get('verified')).toBe('verify_abc');
  });
  it('tolerates an empty hash', () => {
    expect(parseWizardHash('').stepId).toBe('');
  });
});

describe('applyVerificationToPrimary', () => {
  it('prefills identity/address/phone from traits.document and records the verification', () => {
    const next = applyVerificationToPrimary({ firstName: 'Typed', ssn: '123456789', state: 'SX' }, jordan());
    expect(next.firstName).toBe('Jordan');
    expect(next.lastName).toBe('Rivera');
    expect(next.dob).toBe('1991-01-10');
    expect(next.sex).toBe('x');
    expect(next.streetAddress).toBe('742 Evergreen Terrace');
    expect(next.city).toBe('Springfield');
    expect(next.state).toBe('SX');
    expect(next.zip).toBe('55501');
    expect(next.phone).toBe('5551234567');
    expect(next.homeless).toBe(false);
    // Full SSN never comes from CLEAR: typed digits are cleared, last-4 kept.
    expect(next.ssn).toBe('');
    expect(next.noSSN).toBe(false);
    expect(next.identityVerification).toEqual({
      id: 'verify_abc123',
      provider: 'CLEAR',
      status: 'success',
      verifiedFields: ['firstName', 'lastName', 'dob', 'sex', 'streetAddress', 'city', 'state', 'zip', 'phone', 'ssn'],
      ssnLast4: '6789',
      verifiedAt: '2026-09-14T20:02:00.000Z',
    });
  });

  it('accepts CLEAR-spelled document fields (dob / address_1 / subdivision / sex)', () => {
    const v = jordan({
      traits: {
        document: {
          first_name: 'Sam',
          last_name: 'Rivera',
          dob: '03/14/1993',
          sex: 'F',
          address_1: '742 Evergreen Terrace',
          address_2: 'Apt 2',
          city: 'Springfield',
          subdivision: 'sx',
          postal_code: '55501-1234',
        },
        phone: { number: '+1 555 123 4567' },
        ssnLast4: null,
      },
    });
    const next = applyVerificationToPrimary({}, v);
    expect(next.dob).toBe('1993-03-14');
    expect(next.sex).toBe('female');
    expect(next.aptUnit).toBe('Apt 2');
    expect(next.state).toBe('SX');
    expect(next.zip).toBe('55501');
    expect(next.phone).toBe('5551234567');
    expect(next.identityVerification?.ssnLast4).toBeNull();
    expect(next.identityVerification?.verifiedFields).not.toContain('ssn');
  });

  it('returns the applicant unchanged when there are no document traits', () => {
    const primary = { firstName: 'Typed' };
    expect(applyVerificationToPrimary(primary, jordan({ traits: null }))).toEqual(primary);
  });
});

describe('verified field bookkeeping', () => {
  it('unverifyField drops the field but keeps the verification record', () => {
    const verified = applyVerificationToPrimary({}, jordan());
    expect(isFieldVerified(verified, 'firstName')).toBe(true);
    const edited = unverifyField({ ...verified, firstName: 'Jordy' }, 'firstName');
    expect(isFieldVerified(edited, 'firstName')).toBe(false);
    expect(isFieldVerified(edited, 'lastName')).toBe(true);
    expect(edited.identityVerification?.id).toBe('verify_abc123');
  });
});

describe('pending marker + return-leg slot', () => {
  beforeEach(() => {
    sessionStorage.clear();
    setReturnLegVerificationId(null);
  });
  it('round-trips the pending marker in sessionStorage', () => {
    writePendingVerification({ id: 'verify_1', role: 'applicant' });
    expect(sessionStorage.getItem('sx-pending-verification')).toContain('verify_1');
    expect(readPendingVerification()).toEqual({ id: 'verify_1', role: 'applicant' });
    clearPendingVerification();
    expect(readPendingVerification()).toBeNull();
  });
  it('prefers the URL id, falls back to the pending marker, and is one-shot', () => {
    writePendingVerification({ id: 'verify_pending', role: 'applicant' });
    setReturnLegVerificationId('verify_url');
    expect(takeReturnLegVerificationId()).toEqual({ id: 'verify_url', source: 'url' });
    expect(takeReturnLegVerificationId()).toEqual({ id: 'verify_pending', source: 'pending' });
    clearPendingVerification();
    expect(takeReturnLegVerificationId()).toBeNull();
  });
});

describe('normalisers', () => {
  it('normalizeIsoDate handles ISO datetimes and US dates', () => {
    expect(normalizeIsoDate('1991-01-10T00:00:00Z')).toBe('1991-01-10');
    expect(normalizeIsoDate('1/9/1991')).toBe('1991-01-09');
    expect(normalizeIsoDate('')).toBe('');
  });
  it('normalizePhoneTrait strips formatting and a leading country code', () => {
    expect(normalizePhoneTrait('+1 (555) 123-4567')).toBe('5551234567');
    expect(normalizePhoneTrait({ number: null })).toBe('');
  });
  it('normalizeDocumentTraits returns null for an empty document', () => {
    expect(normalizeDocumentTraits({})).toBeNull();
  });
  it('describeResolution maps the in-flow answer to resident copy', () => {
    expect(describeResolution('confirm_enrolled')).toMatch(/still enrolled/);
    expect(describeResolution('ended_submit_proof')).toMatch(/ended/);
    expect(describeResolution(null)).toBeNull();
  });
});
