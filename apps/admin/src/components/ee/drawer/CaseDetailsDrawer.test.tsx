/**
 * CaseDetailsDrawer component tests — AC-002 (ENG-1767)
 *
 * Verifies that the Activity Log tab is shown/hidden based on the
 * `audit_logs:read` permission of the signed-in admin.
 */
import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CaseDetailsDrawer } from './CaseDetailsDrawer';
import type { DrawerCaseRow } from './types';
import type { AdminUser } from '../../../lib/auth-store';

// Apollo v4 has no MockedProvider. Mock useQuery to return loading so the
// drawer falls back to getCaseDetail fixture data — tab tests only need
// permission-gating, not live query data.
vi.mock('@apollo/client/react', () => ({
  useQuery: vi.fn(() => ({ data: undefined, loading: true, error: undefined })),
}));

const mockUseAdmin = vi.fn(() => null as AdminUser | null);

vi.mock('../../../lib/auth-store', () => ({
  useAdmin: () => mockUseAdmin(),
  hasPermission: (user: AdminUser | null, needed: string) => {
    if (!user) return false;
    if (!user.permissions) return true;
    return user.permissions.includes(needed);
  },
}));

const FIXTURE_CASE_ROW: DrawerCaseRow = {
  id: 'test-case-001',
  caseNumber: 'SX-2026-041537',
  applicantName: 'Patricia Chen',
  status: 'IN_REVIEW',
  flagReason: null,
};

const CASEWORKER: AdminUser = {
  id: 'admin-2',
  email: 'caseworker@state-x.gov',
  firstName: 'James',
  lastName: 'Rivera',
  customerId: 'cust-001',
  permissions: ['cases:write'],
};

const AUDITOR: AdminUser = {
  id: 'admin-1',
  email: 'auditor@state-x.gov',
  firstName: 'Sarah',
  lastName: 'Johnson',
  customerId: 'cust-001',
  permissions: ['audit_logs:read', 'cases:write'],
};

describe('CaseDetailsDrawer — Activity Log permission gate (AC-002, ENG-1767)', () => {
  beforeEach(() => {
    mockUseAdmin.mockReset();
  });

  it('hides Activity Log tab when admin lacks audit_logs:read', () => {
    mockUseAdmin.mockImplementation(() => CASEWORKER);

    render(<CaseDetailsDrawer caseRow={FIXTURE_CASE_ROW} onClose={() => {}} />);

    const tablist = screen.getByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    const tabLabels = tabs.map((t) => t.textContent?.trim());
    expect(tabLabels).not.toContain('Activity Log');
  });

  it('shows Activity Log tab when admin has audit_logs:read', () => {
    mockUseAdmin.mockImplementation(() => AUDITOR);

    render(<CaseDetailsDrawer caseRow={FIXTURE_CASE_ROW} onClose={() => {}} />);

    const tablist = screen.getByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs[3]).toHaveAccessibleName('Activity Log');
  });

  it('updates visible tabs when permissions change between renders', () => {
    mockUseAdmin.mockImplementation(() => CASEWORKER);

    const { rerender } = render(<CaseDetailsDrawer caseRow={FIXTURE_CASE_ROW} onClose={() => {}} />);

    let tablist = screen.getByRole('tablist');
    expect(within(tablist).getAllByRole('tab')).toHaveLength(3);

    mockUseAdmin.mockImplementation(() => AUDITOR);
    rerender(<CaseDetailsDrawer caseRow={FIXTURE_CASE_ROW} onClose={() => {}} />);

    tablist = screen.getByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs[3]).toHaveAccessibleName('Activity Log');
  });
});

describe('CaseDetailsDrawer — case-aware empty states (Bug #3 from audit)', () => {
  beforeEach(() => {
    mockUseAdmin.mockReset();
    mockUseAdmin.mockImplementation(() => CASEWORKER);
  });

  it('Application Data tab shows empty state for an unknown case id', () => {
    // FIXTURE_CASE_ROW.id ('test-case-001') has no entry in CASE_DETAILS,
    // so hasCaseDetail() returns false. Previously the drawer would fall
    // back to Robert Mitchell's identity here; now it renders an empty
    // state with the actual case context.
    render(<CaseDetailsDrawer caseRow={FIXTURE_CASE_ROW} onClose={() => {}} />);

    // Default tab is 'application' — empty state should be visible
    // immediately with case-aware copy.
    expect(screen.getByText(/Application data not yet wired for this case/i)).toBeInTheDocument();
    // Case-aware: pulls the applicant name + label from caseRow, not the
    // fallback fixture. The strings appear in the drawer header AND in the
    // empty-state body, so use getAllByText and assert at least one match.
    expect(screen.getAllByText(/SX-2026-041537/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Patricia Chen/).length).toBeGreaterThan(0);
    // Crucially — the fallback fixture's identity (Robert Mitchell) does
    // NOT appear anywhere in the rendered tab.
    expect(screen.queryByText(/Robert/i)).toBeNull();
    expect(screen.queryByText(/Mitchell/i)).toBeNull();
  });

  it('Messages & Notices tab shows empty state for an unknown case id (review S1)', () => {
    // Symmetric with the Application Data assertion above — NoticesMessagesTab
    // has its own `if (!hasRealDetails)` early return that the suite didn't
    // previously exercise. A regression on the messages path would otherwise
    // pass silently.
    render(<CaseDetailsDrawer caseRow={FIXTURE_CASE_ROW} onClose={() => {}} />);

    const tablist = screen.getByRole('tablist');
    fireEvent.click(within(tablist).getByRole('tab', { name: /Messages & Notices/i }));

    expect(screen.getByText(/Messages & notices not yet wired for this case/i)).toBeInTheDocument();
    expect(screen.getAllByText(/SX-2026-041537/).length).toBeGreaterThan(0);
    // Fallback fixture identity must not leak on this tab either.
    expect(screen.queryByText(/Robert/i)).toBeNull();
    expect(screen.queryByText(/Mitchell/i)).toBeNull();
  });
});
