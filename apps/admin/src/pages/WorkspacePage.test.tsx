/**
 * WorkspacePage component tests — AC-001, AC-005, AC-006 (ENG-1767)
 *
 * Verifies that clicking "Full Case Details" opens CaseDetailsDrawer
 * (not DocumentViewer), that the drawer shows all four tabs (permission-
 * gated) and that no other modal mounts as a side effect.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing/react';
import type { MockedResponse } from '@apollo/client/testing';
import { describe, it, expect, vi } from 'vitest';
import WorkspacePage, {
  DDS_REFER_LABEL,
  DDS_CONFIRM_LABEL,
  DDS_VALIDATE_LABEL,
  DDS_SUBMIT_LABEL,
} from './WorkspacePage';
import { ACTION_REVIEW_INCOME } from '../types/ee';

// The DDS confirm CTA renders with ActionBar's demo treatment, which prefixes
// the label ("⚙ Simulate: <label>") — match the accessible name by substring.
const DDS_CONFIRM_NAME = new RegExp(`Simulate: ${DDS_CONFIRM_LABEL}`);
import {
  GET_EE_CASE_QUERY,
  LIST_EE_CASES_QUERY,
  APPROVE_EE_CASE_MUTATION,
  QUEUE_FOR_REVIEW_EE_CASE_MUTATION,
} from '../lib/ee-operations';
import type { AdminUser } from '../lib/auth-store';

const AUDITOR: AdminUser = {
  id: 'admin-1',
  email: 'auditor@state-x.gov',
  firstName: 'Sarah',
  lastName: 'Johnson',
  customerId: 'cust-001',
  permissions: ['audit_logs:read', 'cases:write'],
};

vi.mock('../lib/auth-store', () => ({
  useAdmin: () => AUDITOR,
  hasPermission: (user: AdminUser | null, needed: string) => {
    if (!user) return false;
    if (!user.permissions) return true;
    return user.permissions.includes(needed);
  },
  setAdmin: vi.fn(),
  getAdmin: vi.fn(() => AUDITOR),
}));

const MOCK_CASE_ID = 'test-case-001';
const MOCK_CASE_NUMBER = 'SX-2026-041537';

const MOCK_EE_CASE = {
  id: MOCK_CASE_ID,
  customerId: 'cust-001',
  caseNumber: MOCK_CASE_NUMBER,
  caseType: 'MEDICAID',
  status: 'IN_REVIEW',
  statusReason: null,
  notes: null,
  flagReason: null,
  intakeData: {
    applicantName: 'Patricia Chen',
    displayMeta: {
      workflowStatus: 'Action Needed',
      actionNeeded: 'Review income verification',
      daysRemaining: 10,
      flags: [],
    },
  },
  ruleEvaluations: null,
  rfiDetails: null,
  documentId: null,
  householdId: null,
  linkedCaseId: null,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
  household: { id: 'hh-001', customerId: 'cust-001', members: [] },
  determinations: [],
};

const getCaseMock = {
  request: { query: GET_EE_CASE_QUERY, variables: { id: MOCK_CASE_ID } },
  result: { data: { medicaidEeCase: MOCK_EE_CASE } },
};

const listCasesMock = {
  request: {
    query: LIST_EE_CASES_QUERY,
    variables: { pagination: { page: 1, limit: 100 } },
  },
  result: {
    data: {
      medicaidEeCases: {
        data: [],
        pagination: { currentPage: 1, totalPages: 1, totalCount: 0, hasNextPage: false, hasPreviousPage: false },
      },
    },
  },
};

function renderWorkspace() {
  return render(
    <MockedProvider mocks={[getCaseMock, listCasesMock]}>
      <MemoryRouter initialEntries={[`/ee/cases/${MOCK_CASE_ID}`]}>
        <Routes>
          <Route path="/ee/cases/:id" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>
    </MockedProvider>,
  );
}

// ── Non-MAGI / DDS workflow fixtures ────────────────────────────────────────
const NON_MAGI_CASE_ID = 'test-case-nonmagi-001';
const NON_MAGI_CASE_NUMBER = 'SX-2026-099001';

const NON_MAGI_EE_CASE = {
  ...MOCK_EE_CASE,
  id: NON_MAGI_CASE_ID,
  caseNumber: NON_MAGI_CASE_NUMBER,
  intakeData: {
    applicantName: 'Robert Mitchell',
    displayMeta: {
      workflowStatus: 'Action Needed',
      actionNeeded: 'Disability determination pending DDS',
      daysRemaining: 10,
      flags: [],
    },
  },
  determinations: [
    {
      id: 'det-nonmagi-001',
      customerId: 'cust-001',
      caseId: NON_MAGI_CASE_ID,
      person: null,
      status: 'PENDING' as const,
      category: 'NON_MAGI' as const,
      effectiveDate: null,
      expirationDate: null,
      denialReason: null,
      notes: null,
      determinedAt: null,
      determinedBy: null,
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-01T00:00:00Z',
    },
  ],
};

const nonMagiCaseMock = {
  request: { query: GET_EE_CASE_QUERY, variables: { id: NON_MAGI_CASE_ID } },
  result: { data: { medicaidEeCase: NON_MAGI_EE_CASE } },
};

// Used as the refetch response after approval — same query, APPROVED status
const nonMagiCaseApprovedMock = {
  request: { query: GET_EE_CASE_QUERY, variables: { id: NON_MAGI_CASE_ID } },
  result: { data: { medicaidEeCase: { ...NON_MAGI_EE_CASE, status: 'APPROVED' as const } } },
};

const approveMutationMock = {
  request: {
    query: APPROVE_EE_CASE_MUTATION,
    variables: { input: { id: NON_MAGI_CASE_ID } },
  },
  result: {
    data: {
      approveMedicaidEeCase: {
        case: { id: NON_MAGI_CASE_ID, status: 'APPROVED', statusReason: null },
        errors: [],
      },
    },
  },
};

const listCasesNonMagiMock = {
  request: listCasesMock.request,
  result: listCasesMock.result,
};

function renderNonMagiWorkspace(extraMocks: readonly MockedResponse[] = []) {
  const mocks = [nonMagiCaseMock, listCasesNonMagiMock, ...extraMocks];
  return render(
    <MockedProvider mocks={mocks}>
      <MemoryRouter initialEntries={[`/ee/cases/${NON_MAGI_CASE_ID}`]}>
        <Routes>
          <Route path="/ee/cases/:id" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>
    </MockedProvider>,
  );
}

describe('WorkspacePage — DDS workflow for Non-MAGI ABD cases (ENG-1748)', () => {
  it('renders "Prepare DDS Referral Packet" as the primary CTA for a Non-MAGI IN_REVIEW case', async () => {
    renderNonMagiWorkspace();
    await screen.findAllByText(NON_MAGI_CASE_NUMBER);

    expect(screen.getByRole('button', { name: DDS_REFER_LABEL })).toBeInTheDocument();
    // Sanity: the MAGI "Review & Decide" CTA must NOT appear for Non-MAGI cases
    expect(screen.queryByRole('button', { name: /review & decide/i })).not.toBeInTheDocument();
  });

  it('clicking "Prepare DDS Referral Packet" flips the CTA to "⚙ Simulate: DDS Confirms Disability"', async () => {
    const user = userEvent.setup();
    renderNonMagiWorkspace();
    await screen.findAllByText(NON_MAGI_CASE_NUMBER);

    await user.click(screen.getByRole('button', { name: DDS_REFER_LABEL }));

    expect(screen.getByRole('button', { name: DDS_CONFIRM_NAME })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: DDS_REFER_LABEL })).not.toBeInTheDocument();
  });

  it('clicking "DDS Confirms Disability" flips the CTA to "Validate" without firing approveMutation', async () => {
    const user = userEvent.setup();
    // No approve mock provided — if the simulate click fired approveMutation,
    // MockedProvider would error and the Validate CTA would never appear.
    renderNonMagiWorkspace();
    await screen.findAllByText(NON_MAGI_CASE_NUMBER);

    await user.click(screen.getByRole('button', { name: DDS_REFER_LABEL }));
    await user.click(screen.getByRole('button', { name: DDS_CONFIRM_NAME }));

    // Simulate is a pure frontend transition: no dialog, no approval — the
    // CTA becomes "Validate" and the case stays in the active workspace.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: DDS_VALIDATE_LABEL })).toBeInTheDocument();
  });

  it('Verify section shows the DDS status note walking pending → packet sent → verification complete', async () => {
    const user = userEvent.setup();
    renderNonMagiWorkspace();
    await screen.findAllByText(NON_MAGI_CASE_NUMBER);

    // Default phase for IN_REVIEW Non-MAGI is Evaluate — switch to Verify.
    await user.click(screen.getByRole('button', { name: /verify/i }));
    // Amber "Disability Status: Pending" card with the action-required checklist.
    expect(screen.getByText('Disability Status')).toBeInTheDocument();
    expect(screen.getByText('Action Required')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: DDS_REFER_LABEL }));
    // The amber card is REPLACED by the blue "packet prepared" info card
    // (storyboard ddsReferred card) in the same Disability Determination section.
    expect(screen.getByText('✓ DDS Referral Packet Prepared')).toBeInTheDocument();
    expect(screen.getByText('Submitted · Awaiting DDS')).toBeInTheDocument();
    expect(screen.queryByText('Action Required')).not.toBeInTheDocument();
    // Case Assist banner advances with the DDS state (storyboard bannerByState).
    expect(screen.getByText('DDS referral submitted — awaiting disability determination.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: DDS_CONFIRM_NAME }));
    // The packet card becomes the "disability confirmed" card (stays blue).
    expect(screen.getByText('✓ Disability Confirmed by DDS')).toBeInTheDocument();
    expect(screen.queryByText('✓ DDS Referral Packet Prepared')).not.toBeInTheDocument();
    // SSA panel's Disability Case Status flips Pending → Confirmed.
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
    expect(screen.getByText('All criteria met — validate determination and assign ABD category.')).toBeInTheDocument();
  });

  it('clicking "Validate" moves the workspace to the Determine phase with "Submit Determination →"', async () => {
    const user = userEvent.setup();
    renderNonMagiWorkspace();
    await screen.findAllByText(NON_MAGI_CASE_NUMBER);

    await user.click(screen.getByRole('button', { name: DDS_REFER_LABEL }));
    await user.click(screen.getByRole('button', { name: DDS_CONFIRM_NAME }));
    await user.click(screen.getByRole('button', { name: DDS_VALIDATE_LABEL }));

    expect(screen.getByText('Step 3: Determine')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: DDS_SUBMIT_LABEL })).toBeInTheDocument();
    // Storyboard's DecisionHero (abd_assigned): determination summary card.
    expect(screen.getByText('Eligibility Determination')).toBeInTheDocument();
    expect(screen.getByText('Non-MAGI ABD — Disabled')).toBeInTheDocument();
    expect(screen.getByText('Ready to submit')).toBeInTheDocument();
    expect(screen.getByText('MMIS transmission')).toBeInTheDocument();
    // Program Enrollment does not render on the Determine step (storyboard
    // decide-step parity).
    expect(screen.queryByText('Program Enrollment')).not.toBeInTheDocument();
  });

  it('clicking "Submit Determination →" fires approveMutation directly — no modal (ENG-1875)', async () => {
    const user = userEvent.setup();
    renderNonMagiWorkspace([approveMutationMock, nonMagiCaseApprovedMock]);
    await screen.findAllByText(NON_MAGI_CASE_NUMBER);

    await user.click(screen.getByRole('button', { name: DDS_REFER_LABEL }));
    await user.click(screen.getByRole('button', { name: DDS_CONFIRM_NAME }));
    await user.click(screen.getByRole('button', { name: DDS_VALIDATE_LABEL }));
    await user.click(screen.getByRole('button', { name: DDS_SUBMIT_LABEL }));

    // No Review & Decide dialog must appear — the DDS outcome is always Approve
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Approval lands → case refetches as APPROVED → completed view banner.
    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent(/Eligibility notice queued/i);
  });

  it('payload error from approveMutation resets ddsFlowRef so the next CTA click fires approveMutation again — no modal (ENG-1875)', async () => {
    const user = userEvent.setup();

    // Approve mutation returns a payload error — exercises the onCompleted
    // error branch in WorkspacePage that resets ddsFlowRef.current = false.
    const approveErrorMock = {
      request: { query: APPROVE_EE_CASE_MUTATION, variables: { input: { id: NON_MAGI_CASE_ID } } },
      result: {
        data: {
          approveMedicaidEeCase: {
            case: null,
            errors: [{ code: 'INVALID_STATUS_TRANSITION', field: null, message: 'static error' }],
          },
        },
      },
    };

    renderNonMagiWorkspace([approveErrorMock]);
    await screen.findAllByText(NON_MAGI_CASE_NUMBER);

    // DDS flow: Refer → Simulate → Validate → Submit Determination (no modal)
    await user.click(screen.getByRole('button', { name: DDS_REFER_LABEL }));
    await user.click(screen.getByRole('button', { name: DDS_CONFIRM_NAME }));
    await user.click(screen.getByRole('button', { name: DDS_VALIDATE_LABEL }));
    await user.click(screen.getByRole('button', { name: DDS_SUBMIT_LABEL }));

    // No dialog must appear — DDS determination bypasses ReviewDecideModal (ENG-1875)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // CTA must still read DDS_SUBMIT_LABEL (the DDS state is not rolled back
    // on error) and must be actionable once approving returns to false.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: DDS_SUBMIT_LABEL })).not.toBeDisabled();
    });

    // Clicking again fires approve directly — still no modal.
    await user.click(screen.getByRole('button', { name: DDS_SUBMIT_LABEL }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('network error from approveMutation resets ddsFlowRef so the next CTA click fires approveMutation again — no modal (ENG-1875)', async () => {
    const user = userEvent.setup();

    // Approve mutation returns a network error — exercises the onError handler
    // in WorkspacePage that resets ddsFlowRef.current = false (distinct from the
    // payload-error path covered above which fires via onCompleted).
    const approveNetworkErrorMock = {
      request: { query: APPROVE_EE_CASE_MUTATION, variables: { input: { id: NON_MAGI_CASE_ID } } },
      error: new Error('Network error'),
    };

    renderNonMagiWorkspace([approveNetworkErrorMock]);
    await screen.findAllByText(NON_MAGI_CASE_NUMBER);

    // DDS flow: Refer → Simulate → Validate → Submit Determination (no modal)
    await user.click(screen.getByRole('button', { name: DDS_REFER_LABEL }));
    await user.click(screen.getByRole('button', { name: DDS_CONFIRM_NAME }));
    await user.click(screen.getByRole('button', { name: DDS_VALIDATE_LABEL }));
    await user.click(screen.getByRole('button', { name: DDS_SUBMIT_LABEL }));

    // No dialog must appear — DDS determination bypasses ReviewDecideModal (ENG-1875)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // CTA must still read DDS_SUBMIT_LABEL and be actionable once approving
    // returns to false after the onError handler executes.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: DDS_SUBMIT_LABEL })).not.toBeDisabled();
    });

    // Clicking again fires approve directly — still no modal.
    await user.click(screen.getByRole('button', { name: DDS_SUBMIT_LABEL }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ENG-1856: clicking "Prepare DDS Referral Packet" on a PENDING_VERIFICATION Non-MAGI case auto-queues it for review, then enables the DDS simulate CTA', async () => {
    const user = userEvent.setup();

    // Case starts in PENDING_VERIFICATION (BRE returned NEEDS_REVIEW, no IN_REVIEW
    // transition yet) but already has a NON_MAGI determination — isNonMagi = true.
    const pendingVerificationMock = {
      request: { query: GET_EE_CASE_QUERY, variables: { id: NON_MAGI_CASE_ID } },
      result: { data: { medicaidEeCase: { ...NON_MAGI_EE_CASE, status: 'PENDING_VERIFICATION' as const } } },
    };

    // handleReferToDds fires queueForReviewMutation when status is PENDING_VERIFICATION
    const queueForReviewMock = {
      request: { query: QUEUE_FOR_REVIEW_EE_CASE_MUTATION, variables: { input: { id: NON_MAGI_CASE_ID } } },
      result: {
        data: {
          queueForReviewMedicaidEeCase: {
            case: { id: NON_MAGI_CASE_ID, status: 'IN_REVIEW', statusReason: null },
            errors: [],
          },
        },
      },
    };

    // refetch after queue-for-review returns the case now in IN_REVIEW
    const inReviewRefetchMock = {
      request: { query: GET_EE_CASE_QUERY, variables: { id: NON_MAGI_CASE_ID } },
      result: { data: { medicaidEeCase: { ...NON_MAGI_EE_CASE, status: 'IN_REVIEW' as const } } },
    };

    const mocks = [pendingVerificationMock, listCasesNonMagiMock, queueForReviewMock, inReviewRefetchMock];
    render(
      <MockedProvider mocks={mocks}>
        <MemoryRouter initialEntries={[`/ee/cases/${NON_MAGI_CASE_ID}`]}>
          <Routes>
            <Route path="/ee/cases/:id" element={<WorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </MockedProvider>,
    );
    await screen.findAllByText(NON_MAGI_CASE_NUMBER);

    // "Refer to DDS" is enabled; clicking it triggers queue-for-review + refetch
    await user.click(screen.getByRole('button', { name: DDS_REFER_LABEL }));

    // After refetch resolves with IN_REVIEW, the DDS simulate CTA must be enabled
    await waitFor(() => {
      const confirmBtn = screen.getByRole('button', { name: DDS_CONFIRM_NAME });
      expect(confirmBtn).toBeInTheDocument();
      expect(confirmBtn).not.toBeDisabled();
    });

    // Clicking it advances to the Validate state — no modal, no mutation
    await user.click(screen.getByRole('button', { name: DDS_CONFIRM_NAME }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: DDS_VALIDATE_LABEL })).toBeInTheDocument();
  });

  it('ENG-1856: queue-for-review payload error keeps the referral CTA and does not advance the DDS state', async () => {
    const user = userEvent.setup();

    const pendingVerificationMock = {
      request: { query: GET_EE_CASE_QUERY, variables: { id: NON_MAGI_CASE_ID } },
      result: { data: { medicaidEeCase: { ...NON_MAGI_EE_CASE, status: 'PENDING_VERIFICATION' as const } } },
    };

    // queueForReviewMutation returns a payload error — handleReferToDds must
    // toast and return WITHOUT setting ddsReferralSent (no simulate CTA).
    const queueForReviewErrorMock = {
      request: { query: QUEUE_FOR_REVIEW_EE_CASE_MUTATION, variables: { input: { id: NON_MAGI_CASE_ID } } },
      result: {
        data: {
          queueForReviewMedicaidEeCase: {
            case: null,
            errors: [{ code: 'INVALID_STATUS_TRANSITION', field: null, message: 'static error' }],
          },
        },
      },
    };

    render(
      <MockedProvider mocks={[pendingVerificationMock, listCasesNonMagiMock, queueForReviewErrorMock]}>
        <MemoryRouter initialEntries={[`/ee/cases/${NON_MAGI_CASE_ID}`]}>
          <Routes>
            <Route path="/ee/cases/:id" element={<WorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </MockedProvider>,
    );
    await screen.findAllByText(NON_MAGI_CASE_NUMBER);

    await user.click(screen.getByRole('button', { name: DDS_REFER_LABEL }));

    // Referral CTA stays; the DDS simulate CTA never appears.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: DDS_REFER_LABEL })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: DDS_CONFIRM_NAME })).not.toBeInTheDocument();
  });

  it('DDS eligibility notice banner appears after determination submission and dismisses via × button', async () => {
    const user = userEvent.setup();
    // Extra mocks for mutation + refetch after approval
    renderNonMagiWorkspace([approveMutationMock, nonMagiCaseApprovedMock]);
    await screen.findAllByText(NON_MAGI_CASE_NUMBER);

    // Full DDS flow: Refer → Simulate → Validate → Submit Determination
    await user.click(screen.getByRole('button', { name: DDS_REFER_LABEL }));
    await user.click(screen.getByRole('button', { name: DDS_CONFIRM_NAME }));
    await user.click(screen.getByRole('button', { name: DDS_VALIDATE_LABEL }));
    await user.click(screen.getByRole('button', { name: DDS_SUBMIT_LABEL }));

    // onCompleted fires → await refetch() → setDdsNoticeBannerOpen(true)
    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent(/Eligibility notice queued/i);

    // Dismiss banner via the × button
    await user.click(screen.getByRole('button', { name: /dismiss notice banner/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('treats receivingSSDI=true as Non-MAGI even without a NON_MAGI determination', async () => {
    const ssdiCaseId = 'test-case-ssdi-001';
    const ssdiCase = {
      ...MOCK_EE_CASE,
      id: ssdiCaseId,
      caseNumber: 'SX-2026-999001',
      intakeData: {
        applicantName: 'Robert Mitchell',
        applicant: { receivingSSDI: true },
        displayMeta: { workflowStatus: 'Action Needed', actionNeeded: 'DDS pending', daysRemaining: 10, flags: [] },
      },
      determinations: [],
    };
    render(
      <MockedProvider
        mocks={[
          {
            request: { query: GET_EE_CASE_QUERY, variables: { id: ssdiCaseId } },
            result: { data: { medicaidEeCase: ssdiCase } },
          },
          listCasesMock,
        ]}
      >
        <MemoryRouter initialEntries={[`/ee/cases/${ssdiCaseId}`]}>
          <Routes>
            <Route path="/ee/cases/:id" element={<WorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </MockedProvider>,
    );
    await screen.findAllByText('SX-2026-999001');
    expect(screen.getByRole('button', { name: DDS_REFER_LABEL })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review & decide/i })).not.toBeInTheDocument();
  });

  it('treats receivingSSI=true as Non-MAGI even without a NON_MAGI determination', async () => {
    const ssiCaseId = 'test-case-ssi-001';
    const ssiCase = {
      ...MOCK_EE_CASE,
      id: ssiCaseId,
      caseNumber: 'SX-2026-999002',
      intakeData: {
        applicantName: 'Robert Mitchell',
        applicant: { receivingSSI: true },
        displayMeta: { workflowStatus: 'Action Needed', actionNeeded: 'DDS pending', daysRemaining: 10, flags: [] },
      },
      determinations: [],
    };
    render(
      <MockedProvider
        mocks={[
          {
            request: { query: GET_EE_CASE_QUERY, variables: { id: ssiCaseId } },
            result: { data: { medicaidEeCase: ssiCase } },
          },
          listCasesMock,
        ]}
      >
        <MemoryRouter initialEntries={[`/ee/cases/${ssiCaseId}`]}>
          <Routes>
            <Route path="/ee/cases/:id" element={<WorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </MockedProvider>,
    );
    await screen.findAllByText('SX-2026-999002');
    expect(screen.getByRole('button', { name: DDS_REFER_LABEL })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review & decide/i })).not.toBeInTheDocument();
  });

  // ENG-1994: live wizard submissions store no displayMeta.actionNeeded — the
  // ActionBar summary must fall back to the state-derived action. Pins the
  // WorkspacePage wiring (status + intake + determinations → deriveActionNeeded),
  // mirroring the DashboardPage plumbing test. Uses a MAGI case: Non-MAGI
  // cases' ActionBar shows the DDS_STATUS_BY_STATE line instead (the
  // storyboard DDS state machine), not the derived action.
  it('derives the ActionBar summary for a live MAGI case with no stored actionNeeded', async () => {
    const liveCaseId = 'test-case-live-001';
    const liveCase = {
      ...MOCK_EE_CASE,
      id: liveCaseId,
      caseNumber: 'SX-2026-999003',
      status: 'PENDING_VERIFICATION',
      intakeData: {
        applicantName: 'Jasmine Carter',
        applicant: { isDisabled: false, receivingSSI: false },
        // No displayMeta — live wizard-submitted shape.
      },
      determinations: [],
    };
    render(
      <MockedProvider
        mocks={[
          {
            request: { query: GET_EE_CASE_QUERY, variables: { id: liveCaseId } },
            result: { data: { medicaidEeCase: liveCase } },
          },
          listCasesMock,
        ]}
      >
        <MemoryRouter initialEntries={[`/ee/cases/${liveCaseId}`]}>
          <Routes>
            <Route path="/ee/cases/:id" element={<WorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </MockedProvider>,
    );
    await screen.findAllByText('SX-2026-999003');
    expect(screen.getByText(ACTION_REVIEW_INCOME)).toBeInTheDocument();
  });
});

describe('WorkspacePage — Verify vs. Evaluate composition for Non-MAGI ABD cases (ENG-1891)', () => {
  // The fixture case is IN_REVIEW + Non-MAGI, so the default phase is Evaluate;
  // the stepper lets us switch to Verify (state: complete → clickable).
  it('renders the ABD Income Test in Evaluate, not in Verify (AC-003)', async () => {
    const user = userEvent.setup();
    renderNonMagiWorkspace();
    await screen.findAllByText(NON_MAGI_CASE_NUMBER);

    // Default Evaluate phase: the income test now lives here.
    expect(screen.getByText('ABD Income Test')).toBeInTheDocument();

    // Switch to Verify — the income test must no longer render there.
    await user.click(screen.getByRole('button', { name: /verify/i }));
    expect(screen.queryByText('ABD Income Test')).not.toBeInTheDocument();
  });

  it('Verify shows AVS verified and omits the asset test + eligibility criteria table (AC-005, AC-006)', async () => {
    const user = userEvent.setup();
    renderNonMagiWorkspace();
    await screen.findAllByText(NON_MAGI_CASE_NUMBER);

    await user.click(screen.getByRole('button', { name: /verify/i }));

    // Asset verification evidence stays in Verify, rendered as a completed query...
    expect(screen.getByText('AVS Query Results')).toBeInTheDocument();
    // ...with no "Not Started" empty state (AC-005a — AVS always verified).
    expect(screen.queryByText(/No banking connection initiated/i)).not.toBeInTheDocument();

    // Test logic is removed from Verify (AC-005b asset test, AC-006 criteria table).
    expect(screen.queryByText('ABD Asset Test')).not.toBeInTheDocument();
    expect(screen.queryByText('Non-MAGI Eligibility Criteria')).not.toBeInTheDocument();
  });
});

describe('WorkspacePage — CaseDetailsDrawer wiring (ENG-1767)', () => {
  it('opens CaseDetailsDrawer with four tabs when Full Case Details is clicked', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    // Wait for case data to load (case number only appears after Apollo resolves;
    // during loading WorkspacePage shows the last-8-chars fallback instead).
    // findAllByText is used instead of findByText to tolerate multiple matches
    // across different nodes (e.g., the nav bar and drawer header after clicking).
    await screen.findAllByText(MOCK_CASE_NUMBER);

    await user.click(screen.getByRole('button', { name: /full case details/i }));

    // Drawer tablist must appear with exactly 4 tabs in storyboard order
    const tablist = await screen.findByRole('tablist', { name: /case detail sections/i });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveAccessibleName('Application Data');
    expect(tabs[1]).toHaveAccessibleName('Documents');
    expect(tabs[2]).toHaveAccessibleName('Messages & Notices');
    expect(tabs[3]).toHaveAccessibleName('Activity Log');

    // Standalone DocumentViewer must not be in document
    expect(screen.queryByText(/review uploaded application documents\./i)).not.toBeInTheDocument();
  });

  it('does not mount DocumentViewer at the workspace root before any interaction', async () => {
    renderWorkspace();

    // findAllByText is used instead of findByText to tolerate multiple matches
    // across different nodes (e.g., the nav bar and drawer header after clicking).
    await screen.findAllByText(MOCK_CASE_NUMBER);

    expect(screen.queryByText(/review uploaded application documents\./i)).not.toBeInTheDocument();
  });

  it('opening the drawer is the only side effect of onViewDetails', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    // findAllByText is used instead of findByText to tolerate multiple matches
    // across different nodes (e.g., the nav bar and drawer header after clicking).
    await screen.findAllByText(MOCK_CASE_NUMBER);

    // Before clicking: no drawer tablist present
    expect(screen.queryByRole('tablist', { name: /case detail sections/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /full case details/i }));

    // After clicking: drawer tablist appears
    expect(await screen.findByRole('tablist', { name: /case detail sections/i })).toBeInTheDocument();

    // The standalone DocumentViewer (old behavior) must not have mounted
    expect(screen.queryByText(/review uploaded application documents\./i)).not.toBeInTheDocument();
  });
});

describe('WorkspacePage — ex-parte renewal fallout case (Diane Caldwell)', () => {
  // Gate under test: WorkspacePage renders the ex-parte renewal panels (not the
  // generic MAGI surfaces) when caseType === 'RENEWAL' && !!rfiDetails. The
  // shared panels themselves are covered by RenewalPage.test.tsx; this exercises
  // the workspace gate that routes the case to them.
  const EXPARTE_CASE_ID = 'test-case-exparte-001';
  const EXPARTE_CASE_NUMBER = 'SX-2026-061847';

  const EXPARTE_EE_CASE = {
    ...MOCK_EE_CASE,
    id: EXPARTE_CASE_ID,
    caseNumber: EXPARTE_CASE_NUMBER,
    caseType: 'RENEWAL',
    status: 'IN_REVIEW',
    rfiDetails: {
      itemsRequested: ['Recent pay stubs (last 30 days)', 'A completed and signed Medicaid Renewal Form (A-5170)'],
      deadline: '2026-06-30T23:59:59.000Z',
      noteToApplicant: 'Please return the renewal form with recent pay stubs.',
      issuedAt: '2026-05-01T00:00:00.000Z',
      issuedBy: 'Sarah Mitchell',
    },
    intakeData: {
      applicantName: 'Diane M. Caldwell',
      displayMeta: {
        workflowStatus: 'Waiting on Applicant',
        actionNeeded: 'Awaiting income documentation (RFI issued)',
        daysRemaining: 18,
        flags: [],
      },
    },
  };

  const exParteCaseMock = {
    request: { query: GET_EE_CASE_QUERY, variables: { id: EXPARTE_CASE_ID } },
    result: { data: { medicaidEeCase: EXPARTE_EE_CASE } },
  };

  function renderExParteWorkspace() {
    return render(
      <MockedProvider mocks={[exParteCaseMock, listCasesMock]}>
        <MemoryRouter initialEntries={[`/ee/cases/${EXPARTE_CASE_ID}`]}>
          <Routes>
            <Route path="/ee/cases/:id" element={<WorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </MockedProvider>,
    );
  }

  it('lands on the Verify step by default and shows the pre-populated renewal form / RFI (ENG-1949)', async () => {
    renderExParteWorkspace();
    await screen.findAllByText(EXPARTE_CASE_NUMBER);

    // ENG-1949: an ex-parte renewal case defaults to the Verify phase (not the
    // status-derived Determine phase) so the RFI / pre-populated renewal form —
    // "the most important piece of the demo" — is visible on open without a
    // stepper click. The ex-parte gate must render the renewal narrative, not
    // the generic MAGI auto-processing/IRS surfaces.
    expect(await screen.findByText(/Ex-Parte Renewal Attempt/i)).toBeInTheDocument();
    expect(screen.getByText(/Ex-Parte Renewal — Data Source Results/i)).toBeInTheDocument();
    // Generic MAGI verify surfaces must be absent for the ex-parte case.
    expect(screen.queryByText(/IRS Wage Match/i)).not.toBeInTheDocument();
  });

  it('renders the ex-parte locked Determine card when the Determine step is selected', async () => {
    const user = userEvent.setup();
    renderExParteWorkspace();
    await screen.findAllByText(EXPARTE_CASE_NUMBER);

    await user.click(screen.getByRole('button', { name: /determine/i }));

    // The ex-parte gate renders the locked determination, not the generic
    // "Ready for determination" MAGI surface.
    expect(await screen.findByText(/Determination locked until beneficiary returns/i)).toBeInTheDocument();
    expect(screen.queryByText(/Ready for determination/i)).not.toBeInTheDocument();
  });

  it('renders the ex-parte locked Evaluate card on the Evaluate step (not the generic MAGI surfaces)', async () => {
    const user = userEvent.setup();
    renderExParteWorkspace();
    await screen.findAllByText(EXPARTE_CASE_NUMBER);

    await user.click(screen.getByRole('button', { name: /evaluate/i }));

    expect(await screen.findByText(/Step 2: Evaluate — Locked/i)).toBeInTheDocument();
    // Generic MAGI evaluate surface must be absent for the ex-parte case.
    expect(screen.queryByText(/Program Enrollment Status/i)).not.toBeInTheDocument();
  });
});
