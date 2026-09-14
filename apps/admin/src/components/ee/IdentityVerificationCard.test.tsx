// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { IdentityVerificationCard } from './IdentityVerificationCard';
import { identityVerificationStep, STEP_LABEL_IDENTITY_CLEAR } from './AutoProcessingPipeline';
import type { IdentityVerification } from '../../types/ee';

const BASE: IdentityVerification = {
  id: 'ver-1',
  provider: 'CLEAR',
  status: 'success',
  mode: 'mock',
  subjectName: 'Jordan Rivera',
  createdAt: '2026-09-01T00:00:00Z',
  completedAt: '2026-09-01T00:05:00Z',
  checks: [
    { name: 'selfie_liveness', status: 'success' },
    { name: 'document_authenticity', status: 'success' },
    { name: 'selfie_document_match', status: 'failed' },
  ],
  traits: {
    phone: '(555) 123-4567',
    ssnLast4: '6789',
    document: {
      first_name: 'Jordan',
      middle_name: null,
      last_name: 'Rivera',
      date_of_birth: '1991-01-10',
      address_line1: '742 Evergreen Terrace',
      address_line2: null,
      city: 'Springfield',
      state: 'SX',
      postal_code: '55501',
      document_type: 'drivers_license',
      issuing_state: 'SX',
      document_number_last4: '4821',
      expiration_date: '2029-01-10',
      gender: null,
    },
  },
  determination: {
    result: 'issue_found',
    duplicate_enrollment: true,
    payer_state: 'SC',
    payer_state_name: 'South Carolina',
    coverage: {
      payer_id: 'SCMCD',
      payer_name: 'South Carolina Medicaid',
      plan_status: 'ACTIVE',
      insurance_member_id: '123485135',
      policy_holder_first_name: 'Jordan',
      policy_holder_last_name: 'Rivera',
      coverage_start_date: '2025-11-01',
    },
  },
  resolution: 'ended_submit_proof',
  flag: null,
};

describe('IdentityVerificationCard', () => {
  it('renders the checks with pass/fail states', () => {
    render(<IdentityVerificationCard identityVerification={BASE} />);
    const list = screen.getByRole('list', { name: 'Verification checks' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByText('Selfie liveness')).toBeDefined();
    expect(within(items[0]!).getByText('Passed')).toBeDefined();
    expect(within(items[2]!).getByText('Selfie ↔ document match')).toBeDefined();
    expect(within(items[2]!).getByText('Failed')).toBeDefined();
  });

  it('renders the document summary and masks DOB / document last-4 behind SensitiveValue', () => {
    render(<IdentityVerificationCard identityVerification={BASE} />);
    expect(screen.getByText("Driver's license")).toBeDefined();
    expect(screen.getByText('••/••/1991')).toBeDefined();
    expect(screen.queryByText('Jan 10, 1991')).toBeNull();
    expect(screen.getByText('••••')).toBeDefined();
    expect(screen.getByText('•••-••-6789')).toBeDefined();
    expect(screen.getByText('742 Evergreen Terrace')).toBeDefined();
  });

  it('renders the coverage-discovered sub-card with the applicant resolution', () => {
    render(<IdentityVerificationCard identityVerification={BASE} />);
    const note = screen.getByRole('note', { name: 'Coverage discovered' });
    expect(within(note).getByText('South Carolina Medicaid')).toBeDefined();
    expect(within(note).getByText('ACTIVE')).toBeDefined();
    expect(within(note).getByText('123485135')).toBeDefined();
    expect(within(note).getByText(/coverage has ended and will submit proof/)).toBeDefined();
  });

  it('renders the server-curated checks summary footer under the list', () => {
    render(
      <IdentityVerificationCard
        identityVerification={{ ...BASE, checksSummary: '8 identity checks passed · 13 additional CLEAR checks passed · 3 not applicable' }}
      />,
    );
    expect(screen.getByText('8 identity checks passed · 13 additional CLEAR checks passed · 3 not applicable')).toBeDefined();
  });

  it('renders the coverage block neutral with a Resolved tag once the flag is resolved', () => {
    render(
      <IdentityVerificationCard
        identityVerification={{
          ...BASE,
          flag: {
            id: 'flag-1',
            type: 'out_of_state_medicaid',
            status: 'resolved',
            assignee: 'caseworker@state-x.gov',
            dispositionReason: 'disenrollment_confirmed',
            details: null,
            notes: [],
            createdAt: '2026-09-01T00:05:00Z',
            updatedAt: '2026-09-14T18:00:00Z',
          },
        }}
      />,
    );
    const note = screen.getByRole('note', { name: 'Coverage discovered' });
    expect(note.getAttribute('data-state')).toBe('closed');
    expect(within(note).getByText('Resolved')).toBeDefined();
    expect(within(note).getByText(/Finding resolved/)).toBeDefined();
    // Evidence stays.
    expect(within(note).getByText('123485135')).toBeDefined();
  });

  it('omits the coverage sub-card when no duplicate enrollment was found', () => {
    render(
      <IdentityVerificationCard
        identityVerification={{
          ...BASE,
          determination: { result: 'clear', duplicate_enrollment: false, payer_state: null, payer_state_name: null, coverage: null },
        }}
      />,
    );
    expect(screen.queryByRole('note', { name: 'Coverage discovered' })).toBeNull();
    expect(screen.getByText(/no active Medicaid coverage found in another state/)).toBeDefined();
  });
});

describe('identityVerificationStep (Auto-Processing Pipeline row)', () => {
  it('returns null without a linked verification', () => {
    expect(identityVerificationStep(null)).toBeNull();
  });

  it('is a warn row when CLEAR found out-of-state coverage', () => {
    const step = identityVerificationStep(BASE);
    expect(step?.label).toBe(STEP_LABEL_IDENTITY_CLEAR);
    expect(step?.status).toBe('warn');
    expect(step?.note).toMatch(/South Carolina Medicaid/);
  });

  it('passes (with a note) once the out-of-state flag has been resolved', () => {
    const step = identityVerificationStep({
      ...BASE,
      flag: {
        id: 'flag-1',
        type: 'out_of_state_medicaid',
        status: 'resolved',
        assignee: null,
        dispositionReason: 'disenrollment_confirmed',
        details: null,
        notes: [],
        createdAt: '2026-09-01T00:05:00Z',
        updatedAt: '2026-09-14T18:00:00Z',
      },
    });
    expect(step?.status).toBe('pass');
    expect(step?.note).toMatch(/resolved/);
  });

  it('is an info row for a clean success and a block row for a failed session', () => {
    const clean = identityVerificationStep({ ...BASE, determination: null });
    expect(clean?.status).toBe('info');
    expect(identityVerificationStep({ ...BASE, status: 'failed' })?.status).toBe('block');
    expect(identityVerificationStep({ ...BASE, status: 'awaiting_user' })?.status).toBe('pend');
  });
});
