/**
 * ApplicantSidebar tests — case-status de-duplication (ENG-1942).
 *
 * The case "Status" used to appear twice in the caseworker workspace: in the
 * top banner (CaseActionBanner / CaseNavBar) AND as a "Status" row in the
 * sidebar's Case block. ENG-1942 removes the sidebar row, leaving the banner
 * as the single source of truth.
 *
 * These are pure render tests — no Apollo, no router, no mutations.
 *
 *   1. The Case block still renders its other labels (Case ID, Type, Program,
 *      Worker) — proves the block itself is intact.
 *   2. No "Status" label is rendered — regression guard against the row
 *      returning.
 *   3. An approved case still renders the green "Coverage Active" block —
 *      proves the removal did not touch the coverage section.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ApplicantSidebar } from './ApplicantSidebar';
import type { EECase } from '../../types/ee';

function makeCase(overrides: Partial<EECase> = {}): EECase {
  return {
    id: 'case-1',
    customerId: 'cust-1',
    householdId: 'hh-1',
    household: { id: 'hh-1', customerId: 'cust-1', members: [] },
    caseNumber: 'MO-2026-001',
    caseType: 'INITIAL',
    status: 'IN_REVIEW',
    statusReason: null,
    notes: null,
    flagReason: null,
    intakeData: {
      applicationDate: '2026-01-15',
      displayMeta: { workflowStatus: 'Action Needed', assignedTo: 'Robert Mitchell' },
    },
    ruleEvaluations: null,
    rfiDetails: null,
    documentId: null,
    linkedCaseId: null,
    linkedCase: null,
    caseAssistNarrative: null,
    determinations: [],
    incomeVerification: null,
    assetVerification: null,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('ApplicantSidebar', () => {
  it('renders the Case block labels but not a Status row (ENG-1942)', () => {
    render(<ApplicantSidebar eeCase={makeCase()} applicantName="Robert Mitchell" />);

    expect(screen.getByText('Case ID')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Program')).toBeInTheDocument();
    expect(screen.getByText('Worker')).toBeInTheDocument();

    // The duplicated status row is gone; the top banner is the single source.
    expect(screen.queryByText('Status')).toBeNull();
  });

  // ENG-1973 Cluster B: the multi-member block must source names from the intake
  // householdMembers (matched by personId) when the federated PersonRecord is
  // null — which it is on dev for these personIds. Before the fix every member
  // rendered "—".
  it('falls back to intake householdMembers names when determination.person is null', () => {
    const members = [
      { personId: 'p-jas', firstName: 'Jasmine', lastName: 'Carter' },
      { personId: 'p-mar', firstName: 'Marcus', lastName: 'Carter' },
      { personId: 'p-aal', firstName: 'Aaliyah', lastName: 'Carter' },
    ];
    const mkDet = (personId: string, category: 'MAGI' | 'NON_MAGI' = 'MAGI') => ({
      id: `d-${personId}`,
      customerId: 'cust-1',
      caseId: 'case-1',
      personId,
      coverageGroup: null,
      person: null, // identity federation unhydrated on dev
      status: 'INELIGIBLE' as const,
      category,
      effectiveDate: null,
      expirationDate: null,
      denialReason: null,
      notes: null,
      determinedAt: null,
      determinedBy: null,
      createdAt: '2026-01-15T00:00:00.000Z',
      updatedAt: '2026-01-15T00:00:00.000Z',
    });
    const eeCase = makeCase({
      intakeData: { applicationDate: '2026-06-02', householdMembers: members },
      determinations: [mkDet('p-jas'), mkDet('p-mar'), mkDet('p-aal')],
    });

    render(<ApplicantSidebar eeCase={eeCase} applicantName="Jasmine Carter" />);

    // First names render (the block shows name.split(' ')[0]) instead of "—".
    expect(screen.getByText('Jasmine')).toBeInTheDocument();
    expect(screen.getByText('Marcus')).toBeInTheDocument();
    expect(screen.getByText('Aaliyah')).toBeInTheDocument();
  });

  // Graceful degradation: a determination whose personId matches neither the
  // federated PersonRecord (null) nor any intake householdMembers row falls
  // through to "—" (ENG-1973 review suggestion 3).
  it('renders "—" for a determination personId with no intake match', () => {
    const mkDet = (personId: string) => ({
      id: `d-${personId}`,
      customerId: 'cust-1',
      caseId: 'case-1',
      personId,
      coverageGroup: null,
      person: null,
      status: 'INELIGIBLE' as const,
      category: 'MAGI' as const,
      effectiveDate: null,
      expirationDate: null,
      denialReason: null,
      notes: null,
      determinedAt: null,
      determinedBy: null,
      createdAt: '2026-01-15T00:00:00.000Z',
      updatedAt: '2026-01-15T00:00:00.000Z',
    });
    const eeCase = makeCase({
      // Only p-jas is in intake; p-ghost matches nothing.
      intakeData: {
        applicationDate: '2026-06-02',
        householdMembers: [{ personId: 'p-jas', firstName: 'Jasmine', lastName: 'Carter' }],
      },
      determinations: [mkDet('p-jas'), mkDet('p-ghost')],
    });

    render(<ApplicantSidebar eeCase={eeCase} applicantName="Jasmine Carter" />);

    // Scope to the Members block so the Person-block "—" sentinels don't interfere.
    const membersBlock = screen.getByText('Members').parentElement!;
    expect(within(membersBlock).getByText('Jasmine')).toBeInTheDocument();
    expect(within(membersBlock).getByText('—')).toBeInTheDocument();
  });

  it('still renders the approved-case Coverage block', () => {
    const approved = makeCase({
      status: 'APPROVED',
      determinations: [
        {
          id: 'd-1',
          customerId: 'cust-1',
          caseId: 'case-1',
          personId: 'p-1',
          coverageGroup: null,
          person: null,
          status: 'ELIGIBLE',
          category: 'MAGI',
          effectiveDate: '2026-02-01',
          expirationDate: '2027-01-31',
          denialReason: null,
          notes: null,
          determinedAt: null,
          determinedBy: null,
          createdAt: '2026-01-15T00:00:00.000Z',
          updatedAt: '2026-01-15T00:00:00.000Z',
        },
      ],
    });

    render(<ApplicantSidebar eeCase={approved} applicantName="Robert Mitchell" />);

    expect(screen.getByText('Coverage Active')).toBeInTheDocument();
    expect(screen.queryByText('Status')).toBeNull();
  });
});
