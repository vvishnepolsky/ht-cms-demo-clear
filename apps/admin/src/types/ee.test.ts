/**
 * Unit tests for deriveApprovalLabel (ENG-1810).
 *
 * The helper is the single place that resolves the caseworker-facing approval
 * label. Its invariant: case.status is authoritative for terminal state, so a
 * completed case can never show an active label, while the positive
 * auto-processing labels survive on APPROVED cases. These tests lock every
 * branch — including the Auto-Approved / Auto-Enrolled preservation path, which
 * a future refactor could otherwise collapse to plain 'Approved' unnoticed.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveApprovalLabel,
  WORKFLOW_STATUS_ACTION_NEEDED,
  WORKFLOW_STATUS_WAITING_APPLICANT,
  WORKFLOW_STATUS_AUTO_APPROVED,
  WORKFLOW_STATUS_AUTO_ENROLLED,
} from './ee';

describe('deriveApprovalLabel', () => {
  it('returns Denied for a DENIED case regardless of stale workflowStatus', () => {
    expect(deriveApprovalLabel(WORKFLOW_STATUS_ACTION_NEEDED, 'DENIED')).toBe('Denied');
    expect(deriveApprovalLabel(WORKFLOW_STATUS_WAITING_APPLICANT, 'DENIED')).toBe('Denied');
    expect(deriveApprovalLabel(null, 'DENIED')).toBe('Denied');
  });

  it('collapses a stale active workflowStatus to Approved for an APPROVED case', () => {
    expect(deriveApprovalLabel(WORKFLOW_STATUS_ACTION_NEEDED, 'APPROVED')).toBe('Approved');
    expect(deriveApprovalLabel(WORKFLOW_STATUS_WAITING_APPLICANT, 'APPROVED')).toBe('Approved');
    expect(deriveApprovalLabel(null, 'APPROVED')).toBe('Approved');
  });

  it('preserves the auto-processing label on an APPROVED case', () => {
    expect(deriveApprovalLabel(WORKFLOW_STATUS_AUTO_APPROVED, 'APPROVED')).toBe(WORKFLOW_STATUS_AUTO_APPROVED);
    expect(deriveApprovalLabel(WORKFLOW_STATUS_AUTO_ENROLLED, 'APPROVED')).toBe(WORKFLOW_STATUS_AUTO_ENROLLED);
  });

  it('passes through workflowStatus for a non-terminal case', () => {
    expect(deriveApprovalLabel(WORKFLOW_STATUS_ACTION_NEEDED, 'IN_REVIEW')).toBe(WORKFLOW_STATUS_ACTION_NEEDED);
    expect(deriveApprovalLabel(WORKFLOW_STATUS_WAITING_APPLICANT, 'PENDING_VERIFICATION')).toBe(
      WORKFLOW_STATUS_WAITING_APPLICANT,
    );
  });

  it('defaults to Action Needed when a non-terminal case has no workflowStatus', () => {
    expect(deriveApprovalLabel(null, 'IN_REVIEW')).toBe(WORKFLOW_STATUS_ACTION_NEEDED);
    expect(deriveApprovalLabel(null, 'PENDING_VERIFICATION')).toBe(WORKFLOW_STATUS_ACTION_NEEDED);
  });
});
