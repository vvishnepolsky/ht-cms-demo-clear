/**
 * DashboardPage tests — Appeals tab, county filter, and Go to Workspace CTA (ENG-1773)
 *
 * Verifies:
 *   1. isAppeal helper via the Appeals tab (APL- case visible, non-APL hidden)
 *   2. "Active Appeals" KPI count
 *   3. County filter dropdown filters displayed cases
 *   4. "Go to Workspace" navigates to first non-completed/cancelled case
 *   5. "Go to Workspace" is disabled when no actionable cases exist
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DashboardPage from './DashboardPage';
import { LIST_EE_CASES_QUERY } from '../test-utils/fixtures';
import {
  WORKFLOW_STATUS_ACTION_NEEDED,
  ACTION_REVIEW_INCOME,
  ACTION_REVIEW_DETERMINE,
  ACTION_REVIEW_DISABILITY,
} from '../types/ee';
import { EE_FLAG_DIS, EE_FLAG_PREG, EE_FLAG_SSI } from '../lib/ee-flags';

// ── Auth mock ─────────────────────────────────────────────────────────────────

vi.mock('../lib/auth-store');

// ── Navigation mock ───────────────────────────────────────────────────────────

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Case factories ────────────────────────────────────────────────────────────

/** Resident-submitted case with no displayMeta — tests ENG-1858 derivation. */
function makeCaseNoMeta(overrides: {
  id: string;
  caseNumber: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  isDisabled?: boolean;
  isPregnant?: boolean;
  receivingSSI?: boolean;
  receivingSSDI?: boolean;
  applicationDate?: string;
  determinations?: Array<{ id: string; status: string; category: string; person: null }>;
}) {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  return {
    id: overrides.id,
    caseNumber: overrides.caseNumber,
    status: overrides.status,
    flagReason: null,
    createdAt: overrides.createdAt ?? twoDaysAgo.toISOString(),
    updatedAt: overrides.updatedAt ?? new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    household: { id: `hh-${overrides.id}`, members: [] },
    determinations: overrides.determinations ?? [],
    intakeData: {
      applicantName: 'Submitted Applicant',
      county: null,
      applicationDate: overrides.applicationDate ?? twoDaysAgo.toISOString().slice(0, 10),
      applicant: {
        isDisabled: overrides.isDisabled ?? false,
        isPregnant: overrides.isPregnant ?? false,
        receivingSSI: overrides.receivingSSI ?? false,
        receivingSSDI: overrides.receivingSSDI ?? false,
      },
    },
  };
}

function makeCase(overrides: {
  id: string;
  caseNumber: string;
  status: string;
  county?: string;
  applicantName?: string;
  updatedAt?: string;
  autoProcessed?: boolean;
  lastActivity?: string;
}) {
  return {
    id: overrides.id,
    caseNumber: overrides.caseNumber,
    status: overrides.status,
    flagReason: null,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-05-01T00:00:00Z',
    household: { id: `hh-${overrides.id}`, members: [] },
    determinations: [],
    intakeData: {
      applicantName: overrides.applicantName ?? 'Test Applicant',
      county: overrides.county ?? null,
      displayMeta: {
        workflowStatus: WORKFLOW_STATUS_ACTION_NEEDED,
        actionNeeded: 'Review case',
        lastActivity: overrides.lastActivity ?? '2026-05-01',
        daysRemaining: 5,
        flags: [],
        mcNumber: null,
        caseCategory: null,
        autoProcessed: overrides.autoProcessed ?? false,
      },
    },
  };
}

// ── Seed data ─────────────────────────────────────────────────────────────────

// APL- case: filtered into the Appeals tab by isAppeal()
const APL_CASE = makeCase({
  id: 'case-apl-1',
  caseNumber: 'APL-2026-00482',
  status: 'IN_REVIEW',
  applicantName: 'Alice Appeal',
  county: 'County A',
});

// Regular active case: appears in the default "All Fallout" tab
const PENDING_CASE = makeCase({
  id: 'case-pending-1',
  caseNumber: 'SX-2026-00100',
  status: 'PENDING_VERIFICATION',
  applicantName: 'Bob Pending',
  county: 'County B',
});

// Completed case: only visible in the Completed tab
const APPROVED_CASE = makeCase({
  id: 'case-approved-1',
  caseNumber: 'SX-2026-00200',
  status: 'APPROVED',
  applicantName: 'Carol Approved',
  county: 'County A',
});

// Cancelled case: skipped by "Go to Workspace" CTA
const CANCELED_CASE = makeCase({
  id: 'case-canceled-1',
  caseNumber: 'SX-2026-00300',
  status: 'CANCELED',
  applicantName: 'Dave Canceled',
  county: 'County B',
});

// ── Mock builder ──────────────────────────────────────────────────────────────

// Loose case shape that satisfies the EECaseListItem GraphQL type (intakeData is
// Record<string, unknown>). Both makeCase and makeCaseNoMeta satisfy this type.
type CaseMockInput = {
  id: string;
  caseNumber: string;
  status: string;
  flagReason: null;
  createdAt: string;
  updatedAt: string;
  household: { id: string; members: unknown[] };
  determinations: unknown[];
  intakeData: Record<string, unknown> | null;
};

function buildMock(cases: CaseMockInput[]) {
  return {
    request: {
      query: LIST_EE_CASES_QUERY,
      variables: { pagination: { page: 1, limit: 20 } },
    },
    result: {
      data: {
        medicaidEeCases: {
          data: cases,
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalCount: cases.length,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        },
      },
    },
  };
}

// ── Render helper ─────────────────────────────────────────────────────────────

function renderDashboard(mocks: ReturnType<typeof buildMock>[]) {
  return render(
    <MockedProvider mocks={mocks}>
      <MemoryRouter initialEntries={['/ee/cases']}>
        <DashboardPage />
      </MemoryRouter>
    </MockedProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DashboardPage — Appeals tab, county filter, Go to Workspace CTA (ENG-1773)', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('shows APL- case in Appeals tab and hides the non-APL case', async () => {
    const user = userEvent.setup();
    renderDashboard([buildMock([APL_CASE, PENDING_CASE, APPROVED_CASE])]);

    // The default "All Fallout" tab excludes APL- cases; wait for Bob Pending
    // (PENDING_VERIFICATION) which IS shown there to confirm data has loaded.
    await screen.findByText('SX-2026-00100');

    // Switch to the Appeals tab
    await user.click(screen.getByRole('button', { name: /appeals/i }));

    // APL- case row must now be visible
    expect(screen.getByText('APL-2026-00482')).toBeInTheDocument();

    // The non-APL active case (Bob Pending) must NOT appear in Appeals view
    expect(screen.queryByText('SX-2026-00100')).not.toBeInTheDocument();
  });

  it('shows "Active Appeals" KPI value of 1 with one APL- case', async () => {
    renderDashboard([buildMock([APL_CASE, PENDING_CASE, APPROVED_CASE])]);

    // Wait for data to load (Bob Pending is visible in default "All Fallout" tab)
    await screen.findByText('SX-2026-00100');

    // The KPI tile for Active Appeals must show 1
    const kpiLabel = screen.getByText('Active Appeals');
    const kpiTile = kpiLabel.closest('.ht-kpi') as HTMLElement;
    expect(kpiTile).not.toBeNull();
    expect(within(kpiTile!).getByText('1')).toBeInTheDocument();
  });

  it('filters out County B cases when County A is selected in the filter dropdown', async () => {
    const user = userEvent.setup();
    // APL_CASE = County A; PENDING_CASE = County B
    renderDashboard([buildMock([APL_CASE, PENDING_CASE])]);

    // Bob Pending (County B, PENDING_VERIFICATION) appears in "All Fallout" tab
    await screen.findByText('SX-2026-00100');

    // Open the county filter dropdown
    await user.click(screen.getByRole('button', { name: /filter/i }));

    // Select County A only — filter uses role="menuitemcheckbox" (not checkbox)
    const countyAItem = screen.getByRole('menuitemcheckbox', { name: 'County A' });
    await user.click(countyAItem);

    // Bob Pending (County B) must no longer appear in "All Fallout" tab
    expect(screen.queryByText('SX-2026-00100')).not.toBeInTheDocument();
    expect(screen.queryByText('Bob Pending')).not.toBeInTheDocument();

    // Switch to Appeals and confirm Alice (County A) is still visible
    await user.click(screen.getByRole('button', { name: /appeals/i }));
    expect(screen.getByText('Alice Appeal')).toBeInTheDocument();
  });

  it('navigates to the first non-completed, non-cancelled case when "Go to Workspace" is clicked', async () => {
    const user = userEvent.setup();
    // PENDING_CASE is first and is actionable; APPROVED and CANCELED should be skipped
    renderDashboard([buildMock([PENDING_CASE, APPROVED_CASE, CANCELED_CASE])]);

    // Wait for the table to populate (Bob Pending appears in "All Fallout")
    await screen.findByText('SX-2026-00100');

    const btn = screen.getByRole('button', { name: /go to workspace/i });
    expect(btn).not.toBeDisabled();
    await user.click(btn);

    expect(mockNavigate).toHaveBeenCalledWith(`/ee/cases/${PENDING_CASE.id}`);
  });

  it('disables "Go to Workspace" when all cases are completed or denied', async () => {
    const DENIED_CASE = makeCase({
      id: 'case-denied-1',
      caseNumber: 'SX-2026-00400',
      status: 'DENIED',
      applicantName: 'Eve Denied',
    });
    // Both APPROVED and DENIED — no actionable cases
    renderDashboard([buildMock([APPROVED_CASE, DENIED_CASE])]);

    // Neither APPROVED nor DENIED cases appear in "All Fallout" tab.
    // Wait for the footer "Showing 0 of 2 cases" which renders once Apollo
    // resolves and the completed-only result is in the table.
    await screen.findByText(/showing 0 of 2 cases/i);

    const btn = screen.getByRole('button', { name: /go to workspace/i });
    expect(btn).toBeDisabled();
  });

  // ENG-1810: a completed case must never render an active approval label.
  // APPROVED_CASE carries a stale displayMeta.workflowStatus of "Action
  // Needed" (the approve mutation does not rewrite displayMeta) — case.status
  // must win so the Completed tab shows a terminal label instead.
  it('renders the terminal approval label, not stale "Action Needed", for a completed case', async () => {
    const user = userEvent.setup();
    const DENIED_CASE = makeCase({
      id: 'case-denied-2',
      caseNumber: 'SX-2026-00500',
      status: 'DENIED',
      applicantName: 'Frank Denied',
    });
    // Both APPROVED_CASE and DENIED_CASE carry workflowStatus: "Action Needed"
    renderDashboard([buildMock([PENDING_CASE, APPROVED_CASE, DENIED_CASE])]);

    // Wait for the default tab to load before switching
    await screen.findByText('SX-2026-00100');

    await user.click(screen.getByRole('button', { name: /completed/i }));

    // Both completed rows are visible
    const approvedRow = (await screen.findByText('Carol Approved')).closest('tr') as HTMLElement;
    const deniedRow = screen.getByText('Frank Denied').closest('tr') as HTMLElement;

    // Terminal labels derived from case.status, not the stale workflowStatus
    expect(within(approvedRow).getByText('Approved')).toBeInTheDocument();
    expect(within(deniedRow).getByText('Denied')).toBeInTheDocument();

    // The stale "Action Needed" badge must not appear anywhere in the table
    expect(screen.queryByText(WORKFLOW_STATUS_ACTION_NEEDED)).not.toBeInTheDocument();
  });
});

describe('DashboardPage — enrollment banner reflects real completion time (ENG-1809)', () => {
  it('renders relative time from updatedAt, not the frozen seed lastActivity string', async () => {
    const recent = makeCase({
      id: 'case-auto-1',
      caseNumber: 'SX-2026-00500',
      status: 'APPROVED',
      applicantName: 'Robert Martinez',
      autoProcessed: true,
      // The stale, hard-coded string the banner used to print verbatim.
      lastActivity: 'Case approved · 12/01/2025',
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    });

    renderDashboard([buildMock([recent, PENDING_CASE])]);

    // Banner header uses the new wording — no hard-coded "today"
    const header = await screen.findByText(/recently completed/i);
    const banner = header.closest('div') as HTMLElement;

    // Real relative time, derived from updatedAt, is shown
    expect(within(banner).getByText(/hours ago/i)).toBeInTheDocument();

    // The frozen seed string is no longer rendered anywhere
    expect(screen.queryByText(/Case approved · 12\/01\/2025/)).not.toBeInTheDocument();
    expect(screen.queryByText(/completed today/i)).not.toBeInTheDocument();
  });

  it('lists the most recently completed enrollment first', async () => {
    const older = makeCase({
      id: 'case-auto-old',
      caseNumber: 'SX-2026-00600',
      status: 'APPROVED',
      applicantName: 'Older Completion',
      autoProcessed: true,
      updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
    });
    const newer = makeCase({
      id: 'case-auto-new',
      caseNumber: 'SX-2026-00601',
      status: 'APPROVED',
      applicantName: 'Newer Completion',
      autoProcessed: true,
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    });

    // Pass older first to prove the banner sorts by updatedAt, not input order
    renderDashboard([buildMock([older, newer, PENDING_CASE])]);

    const header = await screen.findByText(/recently completed/i);
    const banner = header.closest('div') as HTMLElement;

    const items = within(banner).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Newer Completion');
    expect(items[1]).toHaveTextContent('Older Completion');
  });
});

// ── ENG-1858: resident-submitted cases without displayMeta ────────────────────

describe('DashboardPage — displayMeta derivation for resident-submitted cases (ENG-1858)', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('derives days remaining from applicationDate when displayMeta is absent', async () => {
    // applicationDate = 2 days ago → expect ~88 days remaining
    const c = makeCaseNoMeta({ id: 'nm-1', caseNumber: 'SX-2026-00700', status: 'IN_REVIEW' });
    renderDashboard([buildMock([c])]);
    await screen.findByText('SX-2026-00700');
    expect(screen.getByText(/\d+ days/)).toBeInTheDocument();
  });

  it('falls back to createdAt when applicationDate is malformed and shows a numeric days value', async () => {
    const c = {
      ...makeCaseNoMeta({ id: 'nm-1b', caseNumber: 'SX-2026-00700B', status: 'IN_REVIEW' }),
      intakeData: {
        applicantName: 'Bad Date Applicant',
        county: null,
        applicationDate: 'not-a-date',
        applicant: { isDisabled: false, isPregnant: false, receivingSSI: false, receivingSSDI: false },
      },
    };
    renderDashboard([buildMock([c])]);
    await screen.findByText('SX-2026-00700B');
    // Falls back to createdAt (2 days ago) → still shows a number, never "NaN days"
    expect(screen.getByText(/\d+ days/)).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it('shows no numeric days or active action text for APPROVED cases without displayMeta', async () => {
    const user = userEvent.setup();
    const c = makeCaseNoMeta({ id: 'nm-2', caseNumber: 'SX-2026-00701', status: 'APPROVED' });
    renderDashboard([buildMock([c])]);
    await screen.findByText(/showing/i);
    await user.click(screen.getByRole('button', { name: /completed/i }));
    await screen.findByText('SX-2026-00701');
    expect(screen.queryByText(/\d+ days/)).not.toBeInTheDocument();
    // deriveActionNeeded default branch → DASH, not an active action string
    expect(screen.queryByText(ACTION_REVIEW_INCOME)).not.toBeInTheDocument();
    expect(screen.queryByText(ACTION_REVIEW_DETERMINE)).not.toBeInTheDocument();
  });

  it('shows no numeric days or active action text for DENIED cases without displayMeta', async () => {
    const user = userEvent.setup();
    const c = makeCaseNoMeta({ id: 'nm-denied', caseNumber: 'SX-2026-00711', status: 'DENIED' });
    renderDashboard([buildMock([c])]);
    await screen.findByText(/showing/i);
    await user.click(screen.getByRole('button', { name: /completed/i }));
    await screen.findByText('SX-2026-00711');
    expect(screen.queryByText(/\d+ days/)).not.toBeInTheDocument();
    expect(screen.queryByText(ACTION_REVIEW_INCOME)).not.toBeInTheDocument();
    expect(screen.queryByText(ACTION_REVIEW_DETERMINE)).not.toBeInTheDocument();
  });

  it('shows no numeric days or active action text for CANCELED cases in All Fallout tab without displayMeta', async () => {
    // CANCELED is terminal → daysRemaining=null and actionNeeded=DASH.
    // CANCELED is not excluded from the All Fallout tab (only APPROVED/DENIED are).
    const c = makeCaseNoMeta({ id: 'nm-canceled', caseNumber: 'SX-2026-00710', status: 'CANCELED' });
    renderDashboard([buildMock([c])]);
    await screen.findByText('SX-2026-00710');
    expect(screen.queryByText(/\d+ days/)).not.toBeInTheDocument();
    expect(screen.queryByText(ACTION_REVIEW_INCOME)).not.toBeInTheDocument();
    expect(screen.queryByText(ACTION_REVIEW_DETERMINE)).not.toBeInTheDocument();
  });

  it('derives DIS flag from applicant.isDisabled when displayMeta.flags is absent', async () => {
    const c = makeCaseNoMeta({ id: 'nm-3', caseNumber: 'SX-2026-00702', status: 'IN_REVIEW', isDisabled: true });
    renderDashboard([buildMock([c])]);
    await screen.findByText('SX-2026-00702');
    expect(screen.getByText(EE_FLAG_DIS)).toBeInTheDocument();
  });

  it('derives PREG flag from applicant.isPregnant when displayMeta.flags is absent', async () => {
    const c = makeCaseNoMeta({ id: 'nm-4', caseNumber: 'SX-2026-00703', status: 'IN_REVIEW', isPregnant: true });
    renderDashboard([buildMock([c])]);
    await screen.findByText('SX-2026-00703');
    expect(screen.getByText(EE_FLAG_PREG)).toBeInTheDocument();
  });

  it('derives SSI flag from applicant.receivingSSI when displayMeta.flags is absent', async () => {
    const c = makeCaseNoMeta({ id: 'nm-4b', caseNumber: 'SX-2026-00703B', status: 'IN_REVIEW', receivingSSI: true });
    renderDashboard([buildMock([c])]);
    await screen.findByText('SX-2026-00703B');
    expect(screen.getByText(EE_FLAG_SSI)).toBeInTheDocument();
  });

  it('derives SSI flag from applicant.receivingSSDI when displayMeta.flags is absent', async () => {
    const c = makeCaseNoMeta({ id: 'nm-4c', caseNumber: 'SX-2026-00703C', status: 'IN_REVIEW', receivingSSDI: true });
    renderDashboard([buildMock([c])]);
    await screen.findByText('SX-2026-00703C');
    expect(screen.getByText(EE_FLAG_SSI)).toBeInTheDocument();
  });

  it('shows no flags for a standard MAGI case without displayMeta', async () => {
    const c = makeCaseNoMeta({ id: 'nm-5', caseNumber: 'SX-2026-00704', status: 'IN_REVIEW' });
    renderDashboard([buildMock([c])]);
    await screen.findByText('SX-2026-00704');
    // Flags column should show the em-dash placeholder, not a badge
    expect(screen.queryByText(EE_FLAG_DIS)).not.toBeInTheDocument();
    expect(screen.queryByText(EE_FLAG_PREG)).not.toBeInTheDocument();
    expect(screen.queryByText(EE_FLAG_SSI)).not.toBeInTheDocument();
  });

  it('derives "Review income verification" for PENDING_VERIFICATION without actionNeeded', async () => {
    const c = makeCaseNoMeta({ id: 'nm-6', caseNumber: 'SX-2026-00705', status: 'PENDING_VERIFICATION' });
    renderDashboard([buildMock([c])]);
    await screen.findByText('SX-2026-00705');
    expect(screen.getByText(ACTION_REVIEW_INCOME)).toBeInTheDocument();
  });

  it('derives "Review & determine" for IN_REVIEW non-disabled cases without actionNeeded', async () => {
    const c = makeCaseNoMeta({ id: 'nm-7', caseNumber: 'SX-2026-00706', status: 'IN_REVIEW' });
    renderDashboard([buildMock([c])]);
    await screen.findByText('SX-2026-00706');
    expect(screen.getByText(ACTION_REVIEW_DETERMINE)).toBeInTheDocument();
  });

  it('derives "Review disability documentation" for IN_REVIEW disabled cases without actionNeeded', async () => {
    const c = makeCaseNoMeta({ id: 'nm-8', caseNumber: 'SX-2026-00707', status: 'IN_REVIEW', isDisabled: true });
    renderDashboard([buildMock([c])]);
    await screen.findByText('SX-2026-00707');
    expect(screen.getByText(ACTION_REVIEW_DISABILITY)).toBeInTheDocument();
  });

  // ENG-1994 Robert Mitchell regression: a Non-MAGI ABD case in
  // PENDING_VERIFICATION pends on DDS — the old status-only switch showed
  // "Review income verification" here.
  it('derives "Review disability documentation" for PENDING_VERIFICATION disabled cases without actionNeeded', async () => {
    const c = makeCaseNoMeta({
      id: 'nm-r',
      caseNumber: 'SX-2026-00709',
      status: 'PENDING_VERIFICATION',
      isDisabled: true,
    });
    renderDashboard([buildMock([c])]);
    await screen.findByText('SX-2026-00709');
    expect(screen.getByText(ACTION_REVIEW_DISABILITY)).toBeInTheDocument();
  });

  // Guards the determinations plumbing through getDisplayMeta: no intake
  // flags at all — the NON_MAGI route is known only from the determination
  // category, which DashboardPage must thread into deriveActionNeeded.
  it('derives the DDS action from a NON_MAGI determination alone (no intake flags)', async () => {
    const c = makeCaseNoMeta({
      id: 'nm-r2',
      caseNumber: 'SX-2026-00712',
      status: 'PENDING_VERIFICATION',
      determinations: [{ id: 'det-r2', status: 'DEFERRED', category: 'NON_MAGI', person: null }],
    });
    renderDashboard([buildMock([c])]);
    await screen.findByText('SX-2026-00712');
    expect(screen.getByText(ACTION_REVIEW_DISABILITY)).toBeInTheDocument();
  });

  it('derives last activity from updatedAt when displayMeta.lastActivity is absent', async () => {
    const c = makeCaseNoMeta({
      id: 'nm-9',
      caseNumber: 'SX-2026-00708',
      status: 'IN_REVIEW',
      updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
    });
    renderDashboard([buildMock([c])]);
    await screen.findByText('SX-2026-00708');
    expect(screen.getByText(/hours ago/i)).toBeInTheDocument();
  });
});
