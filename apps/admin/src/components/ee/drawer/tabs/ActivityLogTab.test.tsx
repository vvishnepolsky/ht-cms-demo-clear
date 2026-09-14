/**
 * ActivityLogTab — ENG-2037 hardcoded ex-parte audit log.
 *
 * The Diane Caldwell ex-parte renewal archetype renders the curated
 * narrative rows from data/exParteAuditLog.ts instead of querying the real
 * `medicaidAuditLog` feed; every other case keeps the live query path.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActivityLogTab } from './ActivityLogTab';
import { EX_PARTE_AUDIT_ROWS, isExParteAuditMockCase } from '../../../../data/exParteAuditLog';
import { getCaseDetail } from '../../../../data/case-details';
import type { DrawerCaseRow } from '../types';

// Apollo v4 has no MockedProvider — mock useQuery (same pattern as
// CaseDetailsDrawer.test.tsx) and assert on the `skip` option.
interface MockQueryResult {
  data:
    | { medicaidAuditLog: { entries: ReturnType<typeof Object>[]; totalCount: number; hasNextPage: boolean } }
    | undefined;
  loading: boolean;
  error: Error | undefined;
  refetch: () => void;
}

const mockUseQuery = vi.fn(
  (..._args: unknown[]): MockQueryResult => ({
    data: undefined,
    loading: false,
    error: undefined,
    refetch: vi.fn(),
  }),
);

vi.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

const DIANE_CASE_ROW: DrawerCaseRow = {
  id: 'cmpvdfodd000ltrulzacckt9o',
  caseNumber: 'SX-2026-061847',
  applicantName: 'Diane M. Caldwell',
  status: 'PENDING_VERIFICATION',
  flagReason: null,
};

const OTHER_CASE_ROW: DrawerCaseRow = {
  id: 'case-other-001',
  caseNumber: 'SX-2026-041537',
  applicantName: 'Patricia Chen',
  status: 'IN_REVIEW',
  flagReason: null,
};

const DETAILS = getCaseDetail('nonexistent-case-id');

describe('isExParteAuditMockCase (ENG-2037)', () => {
  it('matches the Diane Caldwell archetype, with and without middle initial', () => {
    expect(isExParteAuditMockCase('Diane M. Caldwell')).toBe(true);
    expect(isExParteAuditMockCase('Diane Caldwell')).toBe(true);
  });

  it('rejects other applicants and empty names', () => {
    expect(isExParteAuditMockCase('Patricia Chen')).toBe(false);
    expect(isExParteAuditMockCase('Diane Mitchell')).toBe(false);
    expect(isExParteAuditMockCase(null)).toBe(false);
    expect(isExParteAuditMockCase(undefined)).toBe(false);
  });
});

describe('ActivityLogTab — Diane Caldwell hardcoded log (ENG-2037)', () => {
  beforeEach(() => {
    mockUseQuery.mockClear();
  });

  it('queries the live feed AND renders all five narrative events (merge — ENG-2080)', () => {
    render(<ActivityLogTab caseRow={DIANE_CASE_ROW} details={DETAILS} />);

    // ENG-2080: archetype cases no longer skip the query — curated rows merge
    // with the real feed so live caseworker actions stay visible.
    const options = mockUseQuery.mock.calls[0]?.[1] as { skip?: boolean };
    expect(options.skip).not.toBe(true);

    expect(EX_PARTE_AUDIT_ROWS).toHaveLength(5);
    for (const row of EX_PARTE_AUDIT_ROWS) {
      expect(screen.getByText(row.summary)).toBeInTheDocument();
    }
    expect(screen.getByText(/5 events/)).toBeInTheDocument();
  });

  it('renders Auto badges and bullet bodies instead of resource ids', () => {
    render(<ActivityLogTab caseRow={DIANE_CASE_ROW} details={DETAILS} />);

    expect(screen.getAllByText('Auto')).toHaveLength(5);
    // Bullet copy from the design reference, with the bolded label split off.
    expect(screen.getByText('Reasonable compatibility test failed')).toBeInTheDocument();
    expect(screen.getByText('SSA:')).toBeInTheDocument();
    expect(screen.getByText('matched (citizenship & identity)')).toBeInTheDocument();
    // No raw case-id resource line on narrative rows.
    expect(screen.queryByText(DIANE_CASE_ROW.id)).not.toBeInTheDocument();
  });

  it('applies the outcome filter client-side (only the failed ex-parte event is a failure)', () => {
    render(<ActivityLogTab caseRow={DIANE_CASE_ROW} details={DETAILS} />);

    fireEvent.click(screen.getByRole('button', { name: 'Failure' }));
    expect(screen.getByText(/EX-PARTE RENEWAL FAILED/)).toBeInTheDocument();
    expect(screen.queryByText('Renewal Cycle Initiated (T-90)')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Success' }));
    expect(screen.queryByText(/EX-PARTE RENEWAL FAILED/)).not.toBeInTheDocument();
    expect(screen.getByText('Renewal Cycle Initiated (T-90)')).toBeInTheDocument();
  });

  it('search matches bullet bodies, not just summaries', () => {
    render(<ActivityLogTab caseRow={DIANE_CASE_ROW} details={DETAILS} />);

    fireEvent.change(screen.getByLabelText('Search activity entries on this page'), {
      target: { value: 'SWICA' },
    });
    expect(screen.getByText('FDSH + State Source Queries Complete')).toBeInTheDocument();
    expect(screen.getByText(/EX-PARTE RENEWAL FAILED/)).toBeInTheDocument();
    expect(screen.queryByText('Renewal Cycle Initiated (T-90)')).not.toBeInTheDocument();
  });

  it('renders no curated rows for non-archetype cases', () => {
    render(<ActivityLogTab caseRow={OTHER_CASE_ROW} details={DETAILS} />);

    expect(mockUseQuery).toHaveBeenCalled();
    expect(screen.queryByText('Renewal Cycle Initiated (T-90)')).not.toBeInTheDocument();
    expect(screen.getByText(/0 events/)).toBeInTheDocument();
  });
});

// ─── ENG-2080: merge with the real feed ─────────────────────────────────────

/** Minimal AuditLogEntry factory for feed fixtures. */
function entry(overrides: {
  id: string;
  timestamp: string;
  action: string;
  actorId?: string;
  outcome?: 'success' | 'failure';
  metadata?: Record<string, unknown>;
}) {
  return {
    id: overrides.id,
    timestamp: overrides.timestamp,
    serviceId: 'medicaid-ee-service',
    eventType: 'RECORD_UPDATE',
    actorId: overrides.actorId ?? 'system',
    customerId: 'customer-statex',
    action: overrides.action,
    resourceType: 'medicaid_ee_case',
    resourceId: 'case-jasmine-001',
    outcome: overrides.outcome ?? ('success' as const),
    traceId: null,
    metadata: overrides.metadata,
  };
}

function mockFeed(entries: ReturnType<typeof entry>[], totalCount = entries.length) {
  mockUseQuery.mockReturnValue({
    data: { medicaidAuditLog: { entries, totalCount, hasNextPage: false } },
    loading: false,
    error: undefined,
    refetch: vi.fn(),
  });
}

const JASMINE_CASE_ROW: DrawerCaseRow = {
  id: 'case-jasmine-001',
  caseNumber: null,
  applicantName: 'Jasmine Carter',
  status: 'APPROVED',
  flagReason: null,
};

describe('ActivityLogTab — persona narrative merge (ENG-2080)', () => {
  beforeEach(() => {
    mockUseQuery.mockClear();
    mockUseQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
      refetch: vi.fn(),
    });
  });

  it('interleaves Jasmine handshake rows inside the real create→evaluate window', () => {
    mockFeed([
      entry({ id: 'real-create', timestamp: '2026-06-08T15:00:00.000Z', action: 'CREATE', actorId: 'person-1' }),
      entry({ id: 'real-evaluate', timestamp: '2026-06-08T15:01:00.000Z', action: 'EVALUATE' }),
      entry({
        id: 'real-approve',
        timestamp: '2026-06-08T15:01:30.000Z',
        action: 'STATUS_TRANSITION',
        metadata: { fromStatus: 'IN_REVIEW', toStatus: 'APPROVED' },
      }),
    ]);
    render(<ActivityLogTab caseRow={JASMINE_CASE_ROW} details={DETAILS} />);

    // Real + curated counts (3 organic + 6 handshake rows).
    expect(screen.getByText(/9 events/)).toBeInTheDocument();

    // Curated handshake rows render alongside the real events. (Exact
    // chronological placement inside the create→evaluate window is covered by
    // personaAuditNarratives.test.ts; the tab just merges + sorts.)
    expect(screen.getByText('Verification requested from SSA — SSN & identity')).toBeInTheDocument();
    expect(screen.getByText('Verification received from FDSH/IRS — income verified')).toBeInTheDocument();
  });

  it('merges curated rows on page 1 only (pagination guard)', () => {
    // 26 real events → 2 pages. Demo cases never actually paginate, but the
    // guard must hold if one ever does: curated rows render once, on page 1.
    const manyEntries = Array.from({ length: 26 }, (_, i) =>
      entry({ id: `real-${i}`, timestamp: `2026-06-08T15:00:${String(i).padStart(2, '0')}.000Z`, action: 'CREATE' }),
    );
    mockUseQuery.mockReturnValue({
      data: { medicaidAuditLog: { entries: manyEntries.slice(0, 25), totalCount: 26, hasNextPage: true } },
      loading: false,
      error: undefined,
      refetch: vi.fn(),
    });
    render(<ActivityLogTab caseRow={JASMINE_CASE_ROW} details={DETAILS} />);

    expect(screen.getByText('Verification requested from SSA — SSN & identity')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.queryByText('Verification requested from SSA — SSN & identity')).not.toBeInTheDocument();
  });

  it('renders curated rows with a now-anchored fallback when the feed is still empty', () => {
    mockFeed([]);
    render(<ActivityLogTab caseRow={JASMINE_CASE_ROW} details={DETAILS} />);

    expect(screen.getByText(/6 events/)).toBeInTheDocument();
    expect(screen.getByText('Verification received from State Vital Records — residency verified')).toBeInTheDocument();
  });

  it('keeps curated rows visible when the audit feed errors (demo resilience)', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error('boom'),
      refetch: vi.fn(),
    });
    render(<ActivityLogTab caseRow={DIANE_CASE_ROW} details={DETAILS} />);

    expect(screen.queryByText('Failed to load activity log. Try again.')).not.toBeInTheDocument();
    expect(screen.getByText('Renewal Cycle Initiated (T-90)')).toBeInTheDocument();
  });

  it('interleaves real events into the Diane arc (live actions stay visible)', () => {
    mockFeed([
      entry({
        id: 'real-resolve-rfi',
        timestamp: '2026-06-08T16:00:00.000Z',
        action: 'RESOLVE_RFI',
        actorId: 'b2c3d4e5-2001-4000-8000-000000000001',
      }),
    ]);
    render(<ActivityLogTab caseRow={DIANE_CASE_ROW} details={DETAILS} />);

    // 1 real + 5 curated.
    expect(screen.getByText(/6 events/)).toBeInTheDocument();
    // The live June event sorts above the frozen March arc rows.
    const items = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    const rfiIdx = items.findIndex(
      (s) => s.includes('request for information'.toUpperCase()) || s.includes('RFI') || s.includes('resolved'),
    );
    const arcIdx = items.findIndex((s) => s.includes('Renewal Cycle Initiated (T-90)'));
    expect(rfiIdx).toBeGreaterThanOrEqual(0);
    expect(rfiIdx).toBeLessThan(arcIdx);
  });
});
