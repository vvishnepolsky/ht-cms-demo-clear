// @vitest-environment jsdom
/**
 * CaseAssistPanel — render tests for the Verify Assist out-of-state finding.
 *
 *   1. Header shows the narrative source + the narrative paragraph.
 *   2. Recommendations render ordered by priority with severity + cited paths.
 *   3. The oos-medicaid RFI action opens the RFI pre-filled with the
 *      disenrollment-proof item; the flag card shows status + notes.
 *   4. "Mark flag in review" fires updateVerifyAssistFlag and calls onFlagUpdated.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing/react';
import { describe, it, expect, vi } from 'vitest';
import { CaseAssistPanel, OOS_RFI_ITEM } from './CaseAssistPanel';
import { UPDATE_VERIFY_ASSIST_FLAG_MUTATION } from '../../../lib/ee-operations';
import type { CaseAssistResult, EECase, IdentityVerification } from '../../../types/ee';

function makeCase(overrides: Partial<EECase> = {}): EECase {
  return {
    id: 'case-1',
    customerId: 'cust',
    householdId: 'hh-1',
    household: { id: 'hh-1', customerId: 'cust', members: [] },
    caseNumber: 'SX-2026-000001',
    caseType: 'INITIAL',
    status: 'PENDING_VERIFICATION',
    statusReason: null,
    notes: null,
    flagReason: 'verify_assist:out_of_state_medicaid',
    intakeData: { applicantName: 'Jordan Rivera' },
    ruleEvaluations: null,
    rfiDetails: null,
    documentId: null,
    linkedCaseId: null,
    linkedCase: null,
    caseAssistNarrative: null,
    determinations: [],
    incomeVerification: null,
    assetVerification: null,
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
    ...overrides,
  };
}

const IV: IdentityVerification = {
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
    { name: 'selfie_document_match', status: 'success' },
  ],
  traits: null,
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
  resolution: null,
  flag: {
    id: 'flag-1',
    type: 'out_of_state_medicaid',
    status: 'open',
    assignee: null,
    dispositionReason: null,
    details: null,
    notes: [{ id: 'n1', author: 'system', body: 'Flag raised by Verify Assist.', createdAt: '2026-09-01T00:05:00Z' }],
    createdAt: '2026-09-01T00:05:00Z',
    updatedAt: '2026-09-01T00:05:00Z',
  },
};

const CASE_ASSIST: CaseAssistResult = {
  narrative: 'Jordan Rivera appears to hold active South Carolina Medicaid; resolve before determination.',
  narrativeSource: 'claude',
  generatedAt: new Date().toISOString(),
  recommendations: [
    {
      id: 'income-unverified',
      type: 'guidance',
      priority: 3,
      severity: 'info',
      source: 'rules',
      title: 'Income not yet verified electronically',
      body: 'Request payroll verification.',
      rationale: { summary: 'incomeVerification.status is PENDING.', citedFieldPaths: ['incomeVerification.status'] },
      suggestedActions: ['Send Argyle payroll link'],
    },
    {
      id: 'oos-medicaid',
      type: 'guidance',
      priority: 1,
      severity: 'critical',
      source: 'verify_assist',
      title: 'Active out-of-state Medicaid coverage detected (South Carolina)',
      body: 'CLEAR found active SC Medicaid coverage.',
      rationale: {
        summary: 'Concurrent enrollment in two states is not permitted.',
        citedFieldPaths: ['identityVerification.determination.payer_state', 'intakeData.applicant.address.state'],
      },
      suggestedActions: [
        'Issue RFI for proof of SC Medicaid disenrollment',
        'Contact South Carolina DHHS to confirm termination date',
        'Hold determination until resolved',
      ],
    },
  ],
};

function renderPanel(props: Partial<React.ComponentProps<typeof CaseAssistPanel>> = {}, mocks: readonly never[] = []) {
  const onIssueRfi = vi.fn();
  const onFlagUpdated = vi.fn(() => Promise.resolve());
  const utils = render(
    <MockedProvider mocks={mocks as never}>
      <CaseAssistPanel
        eeCase={makeCase()}
        caseAssist={CASE_ASSIST}
        identityVerification={IV}
        onIssueRfi={onIssueRfi}
        onFlagUpdated={onFlagUpdated}
        actorEmail="caseworker@state-x.gov"
        {...props}
      />
    </MockedProvider>,
  );
  return { ...utils, onIssueRfi, onFlagUpdated };
}

describe('CaseAssistPanel', () => {
  it('renders the header with the narrative source and the narrative', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Case Assist' })).toBeDefined();
    expect(screen.getByText(/Narrative by Claude/)).toBeDefined();
    expect(screen.getByText(/appears to hold active South Carolina Medicaid/)).toBeDefined();
  });

  it('labels a template narrative as rule-based', () => {
    renderPanel({ caseAssist: { ...CASE_ASSIST, narrativeSource: 'template' } });
    expect(screen.getByText(/Rule-based/)).toBeDefined();
  });

  it('orders recommendations by priority and shows severity + cited field paths', () => {
    renderPanel();
    const articles = screen.getAllByRole('article');
    expect(articles).toHaveLength(2);
    expect(within(articles[0]!).getByText(/Active out-of-state Medicaid coverage detected/)).toBeDefined();
    expect(articles[0]!.getAttribute('data-severity')).toBe('critical');
    // Critical cards are expanded by default → rationale + cited paths visible.
    expect(screen.getByText('identityVerification.determination.payer_state')).toBeDefined();
    expect(within(articles[1]!).getByText(/Income not yet verified/)).toBeDefined();
  });

  it('wires the RFI suggested action to onIssueRfi with the disenrollment-proof item', async () => {
    const user = userEvent.setup();
    const { onIssueRfi } = renderPanel();
    await user.click(screen.getByRole('button', { name: /Issue RFI for proof of SC Medicaid disenrollment/ }));
    expect(onIssueRfi).toHaveBeenCalledWith([OOS_RFI_ITEM]);
  });

  it('renders the flag card with status, notes, and actions', () => {
    renderPanel();
    const card = screen.getByRole('region', { name: 'Verify Assist flag' });
    expect(within(card).getByText('Open')).toBeDefined();
    expect(within(card).getByText('Flag raised by Verify Assist.')).toBeDefined();
    expect(within(card).getByRole('button', { name: 'Mark flag in review' })).toBeDefined();
    expect(within(card).getByRole('button', { name: 'Resolve flag' })).toBeDefined();
    expect(within(card).getByRole('button', { name: 'Dismiss flag' })).toBeDefined();
  });

  it('"Mark flag in review" calls updateVerifyAssistFlag and refetches', async () => {
    const user = userEvent.setup();
    const mutationMock = {
      request: {
        query: UPDATE_VERIFY_ASSIST_FLAG_MUTATION,
        variables: { input: { flagId: 'flag-1', status: 'in_review', assignee: 'caseworker@state-x.gov' } },
      },
      result: {
        data: {
          updateVerifyAssistFlag: {
            flag: {
              id: 'flag-1',
              status: 'in_review',
              assignee: 'caseworker@state-x.gov',
              dispositionReason: null,
              notes: [],
              updatedAt: '2026-09-02T00:00:00Z',
            },
            errors: [],
          },
        },
      },
    };
    const { onFlagUpdated } = renderPanel({}, [mutationMock] as never);
    await user.click(screen.getByRole('button', { name: 'Mark flag in review' }));
    await waitFor(() => expect(onFlagUpdated).toHaveBeenCalled());
  });

  it('resolve requires a disposition reason before submitting', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Resolve flag' }));
    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Resolve flag' });
    expect(submit).toBeDisabled();
    await user.click(within(dialog).getByLabelText(/Disenrollment confirmed by the other state/));
    expect(submit).not.toBeDisabled();
  });

  it('hides the flag card when the verification found no coverage', () => {
    renderPanel({
      identityVerification: { ...IV, determination: { ...IV.determination!, duplicate_enrollment: false }, flag: null },
      caseAssist: { ...CASE_ASSIST, recommendations: [] },
    });
    expect(screen.queryByRole('region', { name: 'Verify Assist flag' })).toBeNull();
    expect(screen.getByText('No recommendations for this case.')).toBeDefined();
  });
});
