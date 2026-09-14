// @vitest-environment jsdom
/**
 * Tests for the CaseActionBanner ENG-1828 narrative overlay:
 * caseAssistNarrative (LLM) takes precedence over derived context when populated.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CaseActionBanner } from './CaseActionBanner';
import type { EECase } from '../../types/ee';

function makeCase(overrides: Partial<EECase> = {}): EECase {
  return {
    id: 'case-1',
    customerId: 'cust',
    householdId: 'hh-1',
    household: { id: 'hh-1', customerId: 'cust', members: [] },
    caseNumber: 'TEST-001',
    caseType: 'INITIAL',
    status: 'PENDING_VERIFICATION',
    statusReason: null,
    notes: null,
    flagReason: null,
    intakeData: null,
    ruleEvaluations: null,
    rfiDetails: null,
    documentId: null,
    linkedCaseId: null,
    linkedCase: null,
    caseAssistNarrative: null,
    determinations: [],
    incomeVerification: null,
    assetVerification: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

describe('CaseActionBanner — caseAssistNarrative overlay (ENG-1828)', () => {
  it('renders the LLM narrative when caseAssistNarrative is populated', () => {
    const eeCase = makeCase({
      status: 'IN_REVIEW',
      caseAssistNarrative: 'LLM-generated context paragraph for this case.',
    });
    render(<CaseActionBanner eeCase={eeCase} determinations={[]} />);
    expect(screen.getByText('LLM-generated context paragraph for this case.')).toBeDefined();
  });

  it('falls back to derived context when caseAssistNarrative is null', () => {
    const eeCase = makeCase({
      status: 'APPROVED',
      intakeData: { applicantName: 'Test Person', householdSize: 1 },
      caseAssistNarrative: null,
    });
    render(<CaseActionBanner eeCase={eeCase} determinations={[]} />);
    // Derived context IS rendered
    expect(screen.getByText(/determination complete for a household of 1/)).toBeDefined();
    // LLM text is NOT rendered
    expect(screen.queryByText('LLM-generated context paragraph for this case.')).toBeNull();
  });
});

describe('CaseActionBanner — CLEAR out-of-state coverage finding', () => {
  it('renders the red ACTION NEEDED banner with the Case Assist narrative when the flag is open', () => {
    const eeCase = makeCase({
      status: 'PENDING_VERIFICATION',
      intakeData: { applicantName: 'Jordan Rivera' },
      identityVerification: {
        id: 'ver-1',
        provider: 'CLEAR',
        status: 'success',
        mode: 'mock',
        subjectName: 'Jordan Rivera',
        createdAt: '2026-09-01T00:00:00Z',
        completedAt: '2026-09-01T00:05:00Z',
        checks: [],
        traits: null,
        determination: {
          result: 'issue_found',
          duplicate_enrollment: true,
          payer_state: 'SC',
          payer_state_name: 'South Carolina',
          coverage: null,
        },
        resolution: null,
        flag: {
          id: 'flag-1',
          type: 'out_of_state_medicaid',
          status: 'open',
          assignee: null,
          dispositionReason: null,
          details: null,
          notes: [],
          createdAt: '2026-09-01T00:05:00Z',
          updatedAt: '2026-09-01T00:05:00Z',
        },
      },
      caseAssist: {
        recommendations: [],
        narrative: 'Jordan appears to hold active South Carolina Medicaid.',
        narrativeSource: 'template',
        generatedAt: '2026-09-01T00:05:00Z',
      },
    });
    render(<CaseActionBanner eeCase={eeCase} determinations={[]} />);
    expect(screen.getByRole('region', { name: /Case assist: ACTION NEEDED/ })).toBeDefined();
    expect(screen.getByText('Resolve out-of-state Medicaid coverage before determination')).toBeDefined();
    expect(screen.getByText('Jordan appears to hold active South Carolina Medicaid.')).toBeDefined();
  });
});
