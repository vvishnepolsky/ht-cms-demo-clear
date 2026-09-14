/**
 * Tests for the context-aware case-assist banner derivation (ENG-1670).
 */

import { describe, it, expect } from 'vitest';
import {
  deriveCaseAssistBanner,
  EYEBROW_ACTION_NEEDED,
  EYEBROW_CASE_IN_PROGRESS,
  EYEBROW_READY_FOR_APPROVAL,
  OOS_BANNER_ACTION,
} from './case-assist-derive';
import type { EECase, EEDetermination, IdentityVerification } from '../types/ee';

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

function makeDet(overrides: Partial<EEDetermination> = {}): EEDetermination {
  return {
    id: 'det-1',
    customerId: 'cust',
    caseId: 'case-1',
    personId: null,
    coverageGroup: null,
    person: null,
    status: 'PENDING',
    category: 'MAGI',
    effectiveDate: null,
    expirationDate: null,
    denialReason: null,
    notes: null,
    determinedAt: null,
    determinedBy: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

describe('deriveCaseAssistBanner — APPROVED path', () => {
  it('renders coverage-active copy with applicant name from intake', () => {
    const c = makeCase({
      caseNumber: 'NEW-001',
      status: 'APPROVED',
      intakeData: { applicantName: 'Jane Q. Public', householdSize: 4, requestedProgram: 'State-X Medicaid' },
    });
    const b = deriveCaseAssistBanner(c, []);
    expect(b.tone).toBe('green');
    expect(b.action).toMatch(/Jane Q\. Public approved/);
    expect(b.context).toMatch(/State-X Medicaid/);
    expect(b.context).toMatch(/household of 4/);
  });

  it('falls back gracefully when intake fields are missing', () => {
    const c = makeCase({ caseNumber: 'NEW-002', status: 'APPROVED', intakeData: null });
    const b = deriveCaseAssistBanner(c, []);
    expect(b.tone).toBe('green');
    expect(b.action).toMatch(/Case approved/);
  });
});

describe('deriveCaseAssistBanner — PENDING_VERIFICATION path', () => {
  it('prioritizes RFI details when an RFI is open', () => {
    const c = makeCase({
      caseNumber: 'NEW-003',
      status: 'PENDING_VERIFICATION',
      intakeData: { applicantName: 'Maria Santos' },
      rfiDetails: {
        itemsRequested: ['Pay stub for March 2026', 'Bank statement'],
        deadline: '2026-04-15',
        noteToApplicant: null,
        issuedAt: '2026-04-01',
        issuedBy: 'caseworker-1',
      },
    });
    const b = deriveCaseAssistBanner(c, []);
    expect(b.tone).toBe('amber');
    expect(b.action).toMatch(/Maria/);
    expect(b.context).toMatch(/Pay stub for March 2026/);
    expect(b.context).toMatch(/Apr 15/);
  });

  it('uses the failed rule eval description when no RFI is open', () => {
    const c = makeCase({
      caseNumber: 'NEW-004',
      status: 'PENDING_VERIFICATION',
      intakeData: { applicantName: 'Aisha Brown' },
      ruleEvaluations: [
        { ruleId: 'INC-001', ruleName: 'Income Verification', status: 'FAILED', description: 'Payroll $200/mo high' },
      ] as unknown as Record<string, unknown>[],
    });
    const b = deriveCaseAssistBanner(c, []);
    expect(b.tone).toBe('amber');
    expect(b.context).toMatch(/Payroll \$200\/mo high/);
  });

  it('surfaces flagReason in the generic fallback when no RFI and no failed eval', () => {
    const c = makeCase({
      caseNumber: 'NEW-FLAG',
      status: 'PENDING_VERIFICATION',
      intakeData: { applicantName: 'Test Person' },
      flagReason: 'Identity mismatch',
    });
    const b = deriveCaseAssistBanner(c, []);
    expect(b.tone).toBe('amber');
    expect(b.context).toMatch(/Identity mismatch/);
  });

  it('uses the generic review-documentation copy when flagReason is also absent', () => {
    const c = makeCase({
      caseNumber: 'NEW-NOFLAG',
      status: 'PENDING_VERIFICATION',
      intakeData: { applicantName: 'Test Person' },
    });
    const b = deriveCaseAssistBanner(c, []);
    expect(b.tone).toBe('amber');
    expect(b.context).toMatch(/Review documentation/);
  });
});

describe('deriveCaseAssistBanner — IN_REVIEW paths', () => {
  it('Non-MAGI determination → DDS referral banner', () => {
    const c = makeCase({
      caseNumber: 'NEW-005',
      status: 'IN_REVIEW',
      intakeData: { applicantName: 'Eddie Thompson', monthlyHouseholdIncome: 950, federalPovertyLevelPercent: 96 },
    });
    const b = deriveCaseAssistBanner(c, [makeDet({ category: 'NON_MAGI' })]);
    expect(b.tone).toBe('amber');
    expect(b.action).toMatch(/DDS disability referral/);
    expect(b.context).toMatch(/\$950\/mo/);
  });

  it('intake-flagged Non-MAGI (receivingSSDI, no determinations) → DDS referral banner', () => {
    // C.2 shared-classifier fix: a freshly submitted Non-MAGI application has
    // intake flags but no determinations yet — it must still get the DDS
    // banner, matching WorkspacePage/Dashboard classification.
    const c = makeCase({
      caseNumber: 'NEW-007',
      status: 'IN_REVIEW',
      intakeData: { applicantName: 'Robert Moges', applicant: { receivingSSDI: true } },
    });
    const b = deriveCaseAssistBanner(c, []);
    expect(b.action).toMatch(/DDS disability referral/);
  });

  it('ddsFlowState=referred → grey "referral submitted" banner', () => {
    const c = makeCase({
      caseNumber: 'NEW-005',
      status: 'IN_REVIEW',
      intakeData: { applicantName: 'Eddie Thompson' },
    });
    const b = deriveCaseAssistBanner(c, [makeDet({ category: 'NON_MAGI' })], { ddsFlowState: 'referred' });
    expect(b.tone).toBe('grey');
    expect(b.action).toMatch(/DDS referral submitted — awaiting disability determination/);
    expect(b.context).toMatch(/Eddie is otherwise eligible/);
  });

  it('ddsFlowState=confirmed → green "validate" banner with the DDS reference', () => {
    const c = makeCase({ caseNumber: 'NEW-005', status: 'IN_REVIEW' });
    const b = deriveCaseAssistBanner(c, [makeDet({ category: 'NON_MAGI' })], { ddsFlowState: 'confirmed' });
    expect(b.tone).toBe('green');
    expect(b.action).toMatch(/validate determination and assign ABD category/i);
    expect(b.context).toMatch(/DDS-2026-SX-058293/);
  });

  it('ddsFlowState=validated → green "submit determination" banner', () => {
    const c = makeCase({ caseNumber: 'NEW-005', status: 'IN_REVIEW' });
    const b = deriveCaseAssistBanner(c, [makeDet({ category: 'NON_MAGI' })], { ddsFlowState: 'validated' });
    expect(b.tone).toBe('green');
    expect(b.action).toMatch(/ready to submit determination/i);
  });

  it('advanced ddsFlowState beats a per-case override; pending does not', () => {
    // SX-2026-052135 is a registered Non-MAGI override case.
    const c = makeCase({ caseNumber: 'SX-2026-052135', status: 'IN_REVIEW' });
    const pending = deriveCaseAssistBanner(c, [makeDet({ category: 'NON_MAGI' })], { ddsFlowState: 'pending' });
    const referred = deriveCaseAssistBanner(c, [makeDet({ category: 'NON_MAGI' })], { ddsFlowState: 'referred' });
    expect(pending.action).not.toMatch(/DDS referral submitted/);
    expect(referred.action).toMatch(/DDS referral submitted/);
  });

  it('DEFERRED determination → split-pathway banner', () => {
    const c = makeCase({
      caseNumber: 'NEW-006',
      status: 'IN_REVIEW',
      intakeData: { applicantName: 'Gloria Washington' },
    });
    const b = deriveCaseAssistBanner(c, [makeDet({ status: 'DEFERRED' })]);
    expect(b.tone).toBe('amber');
    expect(b.action).toMatch(/SSI recipient flagged/);
    expect(b.context).toMatch(/Non-MAGI/);
  });

  it('mixed household (one INELIGIBLE determination) → amber review banner, NOT green ready-for-approval (ENG-1906)', () => {
    // ENG-1906 symptom 2: CaseAssist must not claim "ready for approval" (green) when
    // a member was denied — that contradicts the caseworker's per-member determination.
    const c = makeCase({
      caseNumber: 'NEW-MIXED',
      status: 'IN_REVIEW',
      intakeData: { applicantName: 'Jasmine Carter' },
    });
    const b = deriveCaseAssistBanner(c, [
      makeDet({ id: 'd-child', status: 'ELIGIBLE' }),
      makeDet({ id: 'd-adult1', status: 'INELIGIBLE' }),
      makeDet({ id: 'd-adult2', status: 'INELIGIBLE' }),
    ]);
    expect(b.tone).toBe('amber');
    expect(b.eyebrow).toBe(EYEBROW_ACTION_NEEDED);
    expect(b.eyebrow).not.toBe(EYEBROW_READY_FOR_APPROVAL);
    expect(b.action).toMatch(/Mixed determination/);
    expect(b.context).toMatch(/1 of 3/);
  });

  it('IN_REVIEW renewal with an open RFI → amber "awaiting RFI", NOT green ready-for-approval (ENG-2084)', () => {
    // Diane Caldwell (SX-2026-061847): an ex-parte renewal fell out to a
    // caseworker with an open RFI but the platform status stayed IN_REVIEW.
    // The RFI/failed-eval handling used to be gated on PENDING_VERIFICATION,
    // so this case fell through to the green "ready for approval" banner —
    // contradicting the PendingRfiBanner shown alongside it.
    const c = makeCase({
      caseNumber: 'SX-2026-061847',
      caseType: 'RENEWAL',
      status: 'IN_REVIEW',
      intakeData: { applicantName: 'Diane M. Caldwell' },
      ruleEvaluations: [
        { ruleId: 'EXP-001', ruleName: 'Ex Parte Income Verification', status: 'FAILED', description: 'RFI required.' },
      ] as unknown as Record<string, unknown>[],
      rfiDetails: {
        itemsRequested: ['Recent pay stubs (last 30 days)', 'Renewal Form A-5170'],
        deadline: '2026-06-11T23:59:59.000Z',
        noteToApplicant: null,
        issuedAt: '2026-05-27T15:00:00.000Z',
        issuedBy: 'Sarah Mitchell',
      },
    });
    const b = deriveCaseAssistBanner(c, [makeDet({ status: 'PENDING' })]);
    expect(b.tone).toBe('amber');
    expect(b.eyebrow).toBe(EYEBROW_ACTION_NEEDED);
    expect(b.eyebrow).not.toBe(EYEBROW_READY_FOR_APPROVAL);
    expect(b.action).toMatch(/Awaiting RFI response from Diane/);
    expect(b.context).toMatch(/Recent pay stubs/);
    expect(b.context).toMatch(/Jun 11/);
  });

  it('IN_REVIEW with a failed verification eval (no RFI) → amber, NOT green (ENG-2084)', () => {
    const c = makeCase({
      caseNumber: 'NEW-FAILEDEVAL',
      status: 'IN_REVIEW',
      intakeData: { applicantName: 'Marcus Lee' },
      ruleEvaluations: [
        {
          ruleId: 'INC-001',
          ruleName: 'Income Verification',
          status: 'FAILED',
          description: 'Payroll exceeds reported.',
        },
      ] as unknown as Record<string, unknown>[],
    });
    const b = deriveCaseAssistBanner(c, [makeDet({ status: 'PENDING' })]);
    expect(b.tone).toBe('amber');
    expect(b.eyebrow).toBe(EYEBROW_ACTION_NEEDED);
    expect(b.context).toMatch(/Payroll exceeds reported/);
  });

  it('clean MAGI → ready-for-approval banner with FPL math', () => {
    const c = makeCase({
      caseNumber: 'NEW-007',
      status: 'IN_REVIEW',
      intakeData: {
        applicantName: 'Patricia Chen',
        monthlyHouseholdIncome: 1800,
        federalPovertyLevelPercent: 71.3,
        federalPovertyLevelThreshold: 2523,
        householdSize: 2,
      },
    });
    const b = deriveCaseAssistBanner(c, [makeDet({ status: 'PENDING' })]);
    expect(b.tone).toBe('green');
    expect(b.eyebrow).toBe(EYEBROW_READY_FOR_APPROVAL);
    expect(b.context).toMatch(/\$1,800\/mo/);
    expect(b.context).toMatch(/71\.3%/);
    expect(b.context).toMatch(/HH of 2/);
  });

  it('clean MAGI falls back to a generic ready message when intake fields are missing', () => {
    const c = makeCase({ caseNumber: 'NEW-008', status: 'IN_REVIEW' });
    const b = deriveCaseAssistBanner(c, []);
    expect(b.tone).toBe('green');
    expect(b.context).toMatch(/automated checks passed/i);
  });

  it('clean MAGI uses the passed income-threshold rule description when available', () => {
    const c = makeCase({
      caseNumber: 'NEW-INC-RULE',
      status: 'IN_REVIEW',
      intakeData: { applicantName: 'Test Person', monthlyHouseholdIncome: 1200 },
      ruleEvaluations: [
        {
          ruleId: 'INC-THRESH',
          ruleName: 'Income Threshold Check',
          status: 'PASSED',
          description: 'Income $1,200/mo well under $2,523/mo threshold for HH of 2.',
        },
      ] as unknown as Record<string, unknown>[],
    });
    const b = deriveCaseAssistBanner(c, [makeDet({ status: 'PENDING' })]);
    expect(b.tone).toBe('green');
    expect(b.eyebrow).toBe(EYEBROW_READY_FOR_APPROVAL);
    // The PASSED income-threshold rule's description takes precedence over the
    // derived FPL math (the `incomePassEval` branch of the IN_REVIEW path).
    expect(b.context).toBe('Income $1,200/mo well under $2,523/mo threshold for HH of 2.');
  });
});

describe('deriveCaseAssistBanner — terminal & fallback', () => {
  it('DENIED uses the case status reason when present', () => {
    const c = makeCase({
      caseNumber: 'NEW-009',
      status: 'DENIED',
      statusReason: 'Income above MAGI threshold',
    });
    const b = deriveCaseAssistBanner(c, []);
    expect(b.tone).toBe('grey');
    expect(b.context).toBe('Income above MAGI threshold');
  });

  it('DENIED falls back to a generic denial message when statusReason is absent', () => {
    const c = makeCase({ caseNumber: 'NEW-DENIED-FALLBACK', status: 'DENIED', statusReason: null });
    const b = deriveCaseAssistBanner(c, []);
    expect(b.tone).toBe('grey');
    expect(b.context).toMatch(/appeal rights/);
  });

  it('CANCELED / unknown status returns the generic in-progress banner', () => {
    const c = makeCase({ caseNumber: 'NEW-010', status: 'CANCELED' });
    const b = deriveCaseAssistBanner(c, []);
    expect(b.tone).toBe('grey');
    expect(b.eyebrow).toBe(EYEBROW_CASE_IN_PROGRESS);
  });
});

describe('deriveCaseAssistBanner — CLEAR / Verify Assist out-of-state coverage', () => {
  function makeIv(flagStatus: string | null, duplicate = true): IdentityVerification {
    return {
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
        result: duplicate ? 'issue_found' : 'clear',
        duplicate_enrollment: duplicate,
        payer_state: duplicate ? 'SC' : null,
        payer_state_name: duplicate ? 'South Carolina' : null,
        coverage: duplicate
          ? {
              payer_id: 'SCMCD',
              payer_name: 'South Carolina Medicaid',
              plan_status: 'ACTIVE',
              insurance_member_id: '123485135',
              policy_holder_first_name: 'Jordan',
              policy_holder_last_name: 'Rivera',
              coverage_start_date: '2025-11-01',
            }
          : null,
      },
      resolution: null,
      flag: flagStatus
        ? {
            id: 'flag-1',
            type: 'out_of_state_medicaid',
            status: flagStatus,
            assignee: null,
            dispositionReason: null,
            details: null,
            notes: [],
            createdAt: '2026-09-01T00:05:00Z',
            updatedAt: '2026-09-01T00:05:00Z',
          }
        : null,
    };
  }

  it('open flag → red ACTION NEEDED banner with the narrative as context', () => {
    const c = makeCase({
      caseNumber: 'SX-2026-041537', // has a per-case override — the OOS finding must still win
      status: 'PENDING_VERIFICATION',
      intakeData: { applicantName: 'Jordan Rivera' },
    });
    const b = deriveCaseAssistBanner(c, [], {
      identityVerification: makeIv('open'),
      narrative: 'Narrative from Case Assist.',
    });
    expect(b.tone).toBe('red');
    expect(b.eyebrow).toBe(EYEBROW_ACTION_NEEDED);
    expect(b.action).toBe(OOS_BANNER_ACTION);
    expect(b.context).toBe('Narrative from Case Assist.');
  });

  it('in_review flag with no narrative → red banner with a derived context naming the payer', () => {
    const c = makeCase({ caseNumber: 'NEW-OOS', intakeData: { applicantName: 'Jordan Rivera' } });
    const b = deriveCaseAssistBanner(c, [], { identityVerification: makeIv('in_review') });
    expect(b.tone).toBe('red');
    expect(b.context).toMatch(/South Carolina Medicaid/);
    expect(b.context).toMatch(/in review/);
  });

  it('finding with no flag row yet still counts as open', () => {
    const c = makeCase({ caseNumber: 'NEW-OOS-2' });
    expect(deriveCaseAssistBanner(c, [], { identityVerification: makeIv(null) }).tone).toBe('red');
  });

  it('resolved / dismissed flag → falls through to the status-derived banner', () => {
    const c = makeCase({ caseNumber: 'NEW-OOS-3', status: 'IN_REVIEW', intakeData: { applicantName: 'Jordan Rivera' } });
    expect(deriveCaseAssistBanner(c, [], { identityVerification: makeIv('resolved') }).tone).toBe('green');
    expect(deriveCaseAssistBanner(c, [], { identityVerification: makeIv('dismissed') }).tone).toBe('green');
  });

  it('clean verification (no duplicate enrollment) does not change the banner', () => {
    const c = makeCase({ caseNumber: 'NEW-OOS-4', status: 'IN_REVIEW' });
    expect(deriveCaseAssistBanner(c, [], { identityVerification: makeIv('open', false) }).tone).toBe('green');
  });

  it('terminal cases never show the red banner', () => {
    const c = makeCase({ caseNumber: 'NEW-OOS-5', status: 'APPROVED', intakeData: { applicantName: 'J R' } });
    expect(deriveCaseAssistBanner(c, [], { identityVerification: makeIv('open') }).tone).toBe('green');
  });
});
