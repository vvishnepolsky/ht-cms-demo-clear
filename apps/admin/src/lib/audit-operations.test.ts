/**
 * Unit tests for audit-operations adapters. ENG-1667 ST-1.
 */

import { describe, it, expect } from 'vitest';
import {
  buildDefaultAuditFilter,
  auditEntryToActivityRow,
  sortByTimestampDesc,
  matchesSearch,
  type AuditLogEntry,
} from './audit-operations';

// Mirror the fixtures in audit-presenter.test.ts: the seeded State-X admin
// login UUID (aliased to Sarah Mitchell) and a UUID resolving to no roster
// member or alias (an applicant personId shape).
const SEEDED_ADMIN_UUID = 'b2c3d4e5-2001-4000-8000-000000000001';
const NON_ROSTER_UUID = 'a1b2c3d4-9999-4000-8000-000000000099';

const baseEntry: AuditLogEntry = {
  id: 'evt-1',
  timestamp: '2026-05-19T11:02:00.000Z',
  serviceId: 'medicaid-ee-service',
  eventType: 'CaseTransition',
  actorId: 'user_abc123def456',
  customerId: '00000000-0000-4000-a000-000000000003',
  action: 'APPROVE',
  resourceType: 'MedicaidEeCase',
  resourceId: 'case_0123456789abcdef',
  outcome: 'success',
  traceId: 'trace-xyz',
};

describe('buildDefaultAuditFilter', () => {
  it('produces ISO strings for start and end', () => {
    const f = buildDefaultAuditFilter('case-1');
    expect(typeof f.startDate).toBe('string');
    expect(typeof f.endDate).toBe('string');
    expect(() => new Date(f.startDate).toISOString()).not.toThrow();
    expect(() => new Date(f.endDate).toISOString()).not.toThrow();
  });

  it('passes the caseId through as resourceId', () => {
    const f = buildDefaultAuditFilter('case-7');
    expect(f.resourceId).toBe('case-7');
  });

  it('spans exactly 31 days (start inclusive, end exclusive)', () => {
    const f = buildDefaultAuditFilter('case-1');
    const start = new Date(f.startDate);
    const end = new Date(f.endDate);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    expect(days).toBe(31);
  });

  it('uses UTC midnight boundaries', () => {
    const f = buildDefaultAuditFilter('case-1');
    expect(f.startDate.endsWith('T00:00:00.000Z')).toBe(true);
    expect(f.endDate.endsWith('T00:00:00.000Z')).toBe(true);
  });
});

describe('auditEntryToActivityRow', () => {
  it('maps each API field onto its display counterpart', () => {
    const row = auditEntryToActivityRow(baseEntry);
    expect(row.key).toBe('evt-1');
    expect(row.action).toBe('APPROVE');
    expect(row.resourceType).toBe('MedicaidEeCase');
    expect(row.eventType).toBe('CaseTransition');
    expect(row.outcome).toBe('success');
  });

  it('formats displayDate as MM/DD/YYYY h:mm AM/PM in UTC', () => {
    const row = auditEntryToActivityRow(baseEntry);
    expect(row.displayDate).toBe('05/19/2026 11:02 AM');
  });

  it('formats compactDate as MM/DD h:mm AM/PM in UTC', () => {
    const row = auditEntryToActivityRow(baseEntry);
    expect(row.compactDate).toBe('05/19 11:02 AM');
  });

  it('shows the resolved actor name (not the raw id) in display, keeps full id in tooltip', () => {
    // ENG-1988 ST-2: actorDisplay is the resolved actor, not a truncated id.
    // An unmatched opaque id on an unmapped action falls back to "A caseworker";
    // the raw id is preserved only in the tooltip for audit fidelity.
    const row = auditEntryToActivityRow(baseEntry);
    expect(row.actorDisplay).toBe('A caseworker');
    expect(row.actorTooltip).toBe('user_abc123def456');
    expect(row.actorDisplay).not.toContain('user_abc');
  });

  it('truncates resourceId to 12 chars + ellipsis in display, keeps full in tooltip', () => {
    const row = auditEntryToActivityRow(baseEntry);
    expect(row.resourceIdDisplay).toBe('case_0123456…');
    expect(row.resourceIdTooltip).toBe('case_0123456789abcdef');
  });

  it('derives 2-char uppercase initials from the resolved actor name', () => {
    // "A caseworker" → "AC" (was the raw-id-derived "US" before ENG-1988 ST-2).
    const row = auditEntryToActivityRow(baseEntry);
    expect(row.initials).toBe('AC');
  });

  it('passes outcome through unchanged for failure', () => {
    const row = auditEntryToActivityRow({ ...baseEntry, outcome: 'failure' });
    expect(row.outcome).toBe('failure');
  });

  it('does not throw on null traceId', () => {
    expect(() => auditEntryToActivityRow({ ...baseEntry, traceId: null })).not.toThrow();
  });

  it('does not expose metadata on the row (defense-in-depth)', () => {
    // As of ENG-1925 the GQL query DOES select `metadata`, but it is only read
    // transiently by the sentence presenter (allowlist-enforced) and must never
    // be projected raw onto the row. This guard ensures `metadata` stays off
    // ActivityRow even with a metadata-bearing entry. See AuditLogEntry doc.
    const row = auditEntryToActivityRow({
      ...baseEntry,
      metadata: { fromStatus: 'PENDING_REVIEW', toStatus: 'APPROVED' },
    });
    expect(row).not.toHaveProperty('metadata');
  });

  it('does not truncate a resourceId shorter than the max', () => {
    const row = auditEntryToActivityRow({ ...baseEntry, resourceId: 'short-id' });
    expect(row.resourceIdDisplay).toBe('short-id');
  });

  // --- ENG-1988 ST-2: actor attribution on the row chip ---

  it('renders a System row for a machine action, with "SY" initials and the raw id in the tooltip', () => {
    const row = auditEntryToActivityRow({
      ...baseEntry,
      action: 'EVALUATE',
      actorId: NON_ROSTER_UUID,
      metadata: { breOutcome: 'ELIGIBLE' },
    });
    expect(row.actorDisplay).toBe('System');
    expect(row.initials).toBe('SY');
    // Full id preserved in the tooltip only — never in the visible chip.
    expect(row.actorTooltip).toBe(NON_ROSTER_UUID);
    expect(row.badgeLabel).toBeUndefined();
  });

  it('renders the seeded-alias caseworker name with name-derived initials', () => {
    const row = auditEntryToActivityRow({
      ...baseEntry,
      action: 'STATUS_TRANSITION',
      actorId: SEEDED_ADMIN_UUID,
      metadata: { fromStatus: 'PENDING_REVIEW', toStatus: 'APPROVED' },
    });
    expect(row.actorDisplay).toBe('Sarah Mitchell');
    expect(row.initials).toBe('SM');
    expect(row.actorTooltip).toBe(SEEDED_ADMIN_UUID);
  });

  it('renders an applicant row (case CREATE) using the applicantName from context', () => {
    const row = auditEntryToActivityRow(
      {
        ...baseEntry,
        action: 'CREATE',
        resourceType: 'MedicaidEeCase',
        actorId: NON_ROSTER_UUID,
      },
      { applicantName: 'Jasmine Carter' },
    );
    expect(row.actorDisplay).toBe('Jasmine Carter');
    expect(row.initials).toBe('JC');
    expect(row.actorTooltip).toBe(NON_ROSTER_UUID);
  });

  it('renders a System chip for RECEIVE_VERIFICATION while the summary stays source-framed', () => {
    // The one chip/sentence asymmetry by design: the sentence names the
    // verification source ("IRS verified income" — no actor prefix), while the
    // actor chip still attributes the machine action to System.
    const row = auditEntryToActivityRow({
      ...baseEntry,
      action: 'RECEIVE_VERIFICATION',
      actorId: NON_ROSTER_UUID,
      metadata: { service: 'IRS', verificationType: 'INCOME', result: 'VERIFIED' },
    });
    expect(row.actorDisplay).toBe('System');
    expect(row.initials).toBe('SY');
    expect(row.actorTooltip).toBe(NON_ROSTER_UUID);
    expect(row.summary).toBe('IRS verified income');
  });

  it('falls back to "Applicant" for a case CREATE with no applicantName in context', () => {
    const row = auditEntryToActivityRow({
      ...baseEntry,
      action: 'CREATE',
      resourceType: 'MedicaidEeCase',
      actorId: NON_ROSTER_UUID,
    });
    expect(row.actorDisplay).toBe('Applicant');
    expect(row.initials).toBe('AP');
  });
});

describe('sortByTimestampDesc', () => {
  it('returns entries in reverse-chronological order', () => {
    const a: AuditLogEntry = { ...baseEntry, id: 'a', timestamp: '2026-05-01T00:00:00.000Z' };
    const b: AuditLogEntry = { ...baseEntry, id: 'b', timestamp: '2026-05-02T00:00:00.000Z' };
    const c: AuditLogEntry = { ...baseEntry, id: 'c', timestamp: '2026-05-03T00:00:00.000Z' };
    const sorted = sortByTimestampDesc([a, c, b]);
    expect(sorted.map((e) => e.id)).toEqual(['c', 'b', 'a']);
  });

  it('preserves API order for equal timestamps (stable sort)', () => {
    const ts = '2026-05-19T11:02:00.000Z';
    const x: AuditLogEntry = { ...baseEntry, id: 'x', timestamp: ts };
    const y: AuditLogEntry = { ...baseEntry, id: 'y', timestamp: ts };
    const z: AuditLogEntry = { ...baseEntry, id: 'z', timestamp: ts };
    const sorted = sortByTimestampDesc([x, y, z]);
    expect(sorted.map((e) => e.id)).toEqual(['x', 'y', 'z']);
  });

  it('does not mutate the input array', () => {
    const input = [
      { ...baseEntry, id: '1', timestamp: '2026-05-01T00:00:00.000Z' },
      { ...baseEntry, id: '2', timestamp: '2026-05-02T00:00:00.000Z' },
    ];
    const snapshot = input.map((e) => e.id);
    sortByTimestampDesc(input);
    expect(input.map((e) => e.id)).toEqual(snapshot);
  });
});

describe('matchesSearch', () => {
  const row = auditEntryToActivityRow(baseEntry);

  it('matches everything when the query is empty', () => {
    expect(matchesSearch(row, '')).toBe(true);
  });

  it('matches on `action` case-insensitively', () => {
    expect(matchesSearch(row, 'approve')).toBe(true);
    expect(matchesSearch(row, 'APPROVE')).toBe(true);
  });

  it('matches on `resourceType`', () => {
    expect(matchesSearch(row, 'medicaidee')).toBe(true);
  });

  it('matches on the FULL actorId (actorTooltip), not the truncated display', () => {
    // actorDisplay is "user_abc…" but the full id is "user_abc123def456".
    // Searching for the trailing portion exercises the actorTooltip branch.
    expect(matchesSearch(row, 'def456')).toBe(true);
  });

  it('matches on `eventType`', () => {
    expect(matchesSearch(row, 'casetransition')).toBe(true);
  });

  it('returns false when no field contains the needle', () => {
    expect(matchesSearch(row, 'no-such-substring-anywhere')).toBe(false);
  });

  // S3 (review) — the summary branch, exercised where summary differs from action.
  it('matches on the human-readable summary when the action string does not (ENG-1925)', () => {
    const statusRow = auditEntryToActivityRow({
      ...baseEntry,
      action: 'STATUS_TRANSITION',
      metadata: { fromStatus: 'PENDING_REVIEW', toStatus: 'APPROVED' },
    });
    // summary = "A caseworker changed case status from Pending Review to Approved"
    // (baseEntry.actorId is unmatched → "A caseworker"). "changed case status"
    // and "pending review" appear only in summary, never in the action code.
    expect(statusRow.action).toBe('STATUS_TRANSITION');
    expect(matchesSearch(statusRow, 'changed case status')).toBe(true);
    expect(matchesSearch(statusRow, 'pending review')).toBe(true);
  });
});
