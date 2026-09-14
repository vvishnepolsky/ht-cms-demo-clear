/**
 * Unit tests for the audit-log sentence presenter. ENG-1925.
 *
 * Each test maps to a Verifiable Outcome on the ticket (AC-STATUS, AC-CREATE-CASE,
 * AC-RFI, AC-EVALUATE, AC-FAILURE, AC-FALLBACK, AC-PHI).
 */

import { describe, it, expect } from 'vitest';
import { buildAuditSummary, resolveActorName, resolveActorDisplay, type AuditSummaryInput } from './audit-presenter';
import { TEAM } from '../data/team';

// Seeded State-X login Person UUID (the shared "Demo Admin" account every demo
// caseworker signs in as) — aliased to Sarah Mitchell. See seed-statex.ts.
const SEEDED_ADMIN_UUID = 'b2c3d4e5-2001-4000-8000-000000000001';
// A non-roster opaque id (e.g. an applicant personId) used to exercise the
// action-aware heuristic and applicant framing.
const NON_ROSTER_UUID = 'a1b2c3d4-9999-4000-8000-000000000099';

const base: AuditSummaryInput = {
  action: 'STATUS_TRANSITION',
  resourceType: 'MedicaidEeCase',
  outcome: 'success',
  actorId: TEAM.sarah.id,
  metadata: {},
};

describe('resolveActorName', () => {
  it('resolves a roster id to the full name', () => {
    expect(resolveActorName(TEAM.sarah.id)).toBe('Sarah Mitchell');
  });

  it('resolves a roster email to the full name', () => {
    expect(resolveActorName(TEAM.david.email)).toBe('David Chen');
  });

  it('maps the system actor to "System"', () => {
    expect(resolveActorName('system')).toBe('System');
    expect(resolveActorName('')).toBe('System');
    expect(resolveActorName(null)).toBe('System');
  });

  it('falls back to a generic label for an unmatched opaque id (no id leak)', () => {
    const name = resolveActorName('user_abc123def456');
    expect(name).toBe('A caseworker');
    expect(name).not.toContain('abc123');
  });

  // ENG-1988 ST-2 — the seeded "Demo Admin" login UUID aliases to Sarah Mitchell.
  it('resolves the seeded login UUID to the storyboard caseworker', () => {
    expect(resolveActorName(SEEDED_ADMIN_UUID)).toBe('Sarah Mitchell');
    expect(resolveActorName('b2c3d4e5-2002-4000-8000-000000000002')).toBe('Sarah Mitchell');
  });
});

describe('buildAuditSummary', () => {
  // AC-STATUS
  it('renders STATUS_TRANSITION with title-cased before/after and the actor name', () => {
    const summary = buildAuditSummary({
      ...base,
      action: 'STATUS_TRANSITION',
      metadata: { fromStatus: 'PENDING_REVIEW', toStatus: 'APPROVED' },
    });
    expect(summary).toBe('Sarah Mitchell changed case status from Pending Review to Approved');
    expect(summary.startsWith('Sarah Mitchell')).toBe(true);
    expect(summary.endsWith('changed case status from Pending Review to Approved')).toBe(true);
  });

  // Verify Assist (CLEAR) flag worked from the Case Assist panel — must never
  // surface as the raw VERIFY_ASSIST_FLAG_UPDATED enum in the activity log.
  it('renders VERIFY_ASSIST_FLAG_UPDATED per target status, noting an added note', () => {
    expect(
      buildAuditSummary({
        ...base,
        action: 'VERIFY_ASSIST_FLAG_UPDATED',
        metadata: { fromStatus: 'open', toStatus: 'in_review', assignee: 'caseworker@state-x.gov' },
      }),
    ).toBe('Sarah Mitchell marked the Verify Assist flag in review');
    expect(
      buildAuditSummary({
        ...base,
        action: 'VERIFY_ASSIST_FLAG_UPDATED',
        metadata: { fromStatus: 'in_review', toStatus: 'resolved', noteAdded: true },
      }),
    ).toBe('Sarah Mitchell resolved the Verify Assist flag and added a note');
    expect(
      buildAuditSummary({ ...base, action: 'VERIFY_ASSIST_FLAG_UPDATED', metadata: { toStatus: 'dismissed' } }),
    ).toBe('Sarah Mitchell dismissed the Verify Assist flag');
    expect(buildAuditSummary({ ...base, action: 'VERIFY_ASSIST_FLAG_UPDATED', metadata: {} })).toBe(
      'Sarah Mitchell updated the Verify Assist flag',
    );
  });

  // AC-CREATE-CASE
  it('renders a case CREATE with the applicant name from context (no backend metadata)', () => {
    const summary = buildAuditSummary(
      { ...base, action: 'CREATE', resourceType: 'MedicaidEeCase', metadata: {} },
      { applicantName: 'Jasmine Carter' },
    );
    expect(summary).toBe('Sarah Mitchell created the case for Jasmine Carter');
  });

  it('renders a case CREATE without a name when none is in context', () => {
    const summary = buildAuditSummary({ ...base, action: 'CREATE', resourceType: 'MedicaidEeCase', metadata: {} });
    expect(summary).toBe('Sarah Mitchell created the case');
  });

  it('distinguishes determination CREATE from case CREATE by resourceType', () => {
    const summary = buildAuditSummary({
      ...base,
      action: 'CREATE',
      resourceType: 'MedicaidEeDetermination',
      metadata: { category: 'MAGI', determinationStatus: 'ELIGIBLE' },
    });
    expect(summary).toBe('Sarah Mitchell recorded a MAGI determination: Eligible');
  });

  // AC-RFI
  it('renders ISSUE_RFI with split item labels and a formatted deadline', () => {
    const summary = buildAuditSummary({
      ...base,
      action: 'ISSUE_RFI',
      metadata: {
        itemsRequested: 'Pay stub | Birth certificate',
        itemsRequestedCount: 2,
        deadline: '2026-03-20T00:00:00Z',
      },
    });
    expect(summary).toContain('issued an RFI: Pay stub, Birth certificate');
    expect(summary).toContain('Mar 20, 2026');
  });

  it('falls back to the item count when itemsRequested is absent', () => {
    const summary = buildAuditSummary({
      ...base,
      action: 'ISSUE_RFI',
      metadata: { itemsRequestedCount: 3, deadline: '2026-03-20T00:00:00Z' },
    });
    expect(summary).toContain('issued an RFI: 3 items');
  });

  // AC-EVALUATE
  it('renders EVALUATE with the BRE outcome and coverage type', () => {
    const summary = buildAuditSummary({
      ...base,
      action: 'EVALUATE',
      metadata: { breOutcome: 'ELIGIBLE', coverageType: 'MAGI', matchedRuleCount: 4 },
    });
    expect(summary).toContain('ran eligibility evaluation: Eligible (MAGI)');
  });

  // AC-FAILURE
  it('appends "(failed)" on a failure outcome and never renders the free-form reason', () => {
    const summary = buildAuditSummary({
      ...base,
      action: 'REEVALUATE',
      outcome: 'failure',
      metadata: { reason: 'boom' },
    });
    // Pinned exact string: failure is the uniform actor-prefixed "(failed)"
    // form, not the ticket draft's actor-less "Eligibility re-evaluation failed".
    expect(summary).toBe('Sarah Mitchell re-ran eligibility (failed)');
    expect(summary).not.toContain('boom');
  });

  // AC-FALLBACK
  it('falls back to the raw action code for an unmapped action without throwing', () => {
    const summary = buildAuditSummary({ ...base, action: 'SOME_NEW_ACTION', metadata: {} });
    expect(summary).toBe('SOME_NEW_ACTION');
  });

  // AC-PHI
  it('never renders free-form operator text from metadata (PHI allowlist)', () => {
    const summary = buildAuditSummary({
      ...base,
      action: 'STATUS_TRANSITION',
      metadata: { fromStatus: 'X', toStatus: 'Y', reason: 'patient disclosed Z', noteToApplicant: 'SSN 123-45-6789' },
    });
    expect(summary).toBe('Sarah Mitchell changed case status from X to Y');
    expect(summary).not.toContain('patient disclosed Z');
    expect(summary).not.toContain('123-45-6789');
  });

  it('resolves RFI and re-evaluation success sentences', () => {
    expect(buildAuditSummary({ ...base, action: 'RESOLVE_RFI', metadata: { priorFlagReason: 'rfi:pending' } })).toBe(
      'Sarah Mitchell resolved the RFI',
    );
    expect(buildAuditSummary({ ...base, action: 'REEVALUATE', metadata: { breOutcome: 'INELIGIBLE' } })).toBe(
      'Sarah Mitchell re-ran eligibility: Ineligible',
    );
  });

  // S1 (review) — coverage parity for the two metadata-free branches.
  it('renders UPDATE', () => {
    expect(buildAuditSummary({ ...base, action: 'UPDATE', metadata: {} })).toBe('Sarah Mitchell updated the case');
  });

  it('renders CREATE_LINKED_CASE', () => {
    expect(buildAuditSummary({ ...base, action: 'CREATE_LINKED_CASE', metadata: { linkedFromCaseId: 'case-9' } })).toBe(
      'Sarah Mitchell created a linked case',
    );
  });

  // S2 (review) — the two partial-metadata STATUS_TRANSITION branches.
  it('renders STATUS_TRANSITION with only toStatus present', () => {
    expect(buildAuditSummary({ ...base, action: 'STATUS_TRANSITION', metadata: { toStatus: 'APPROVED' } })).toBe(
      'Sarah Mitchell changed case status to Approved',
    );
  });

  it('renders STATUS_TRANSITION with no status metadata', () => {
    expect(buildAuditSummary({ ...base, action: 'STATUS_TRANSITION', metadata: {} })).toBe(
      'Sarah Mitchell changed case status',
    );
  });

  // Round-2 review S1 — remaining ISSUE_RFI / EVALUATE / category branches.
  it('falls back to "requested items" when ISSUE_RFI has neither items nor count', () => {
    expect(buildAuditSummary({ ...base, action: 'ISSUE_RFI', metadata: { deadline: '2026-03-20T00:00:00Z' } })).toBe(
      'Sarah Mitchell issued an RFI: requested items, due Mar 20, 2026',
    );
  });

  it('uses the singular "item" when itemsRequestedCount is 1', () => {
    expect(buildAuditSummary({ ...base, action: 'ISSUE_RFI', metadata: { itemsRequestedCount: 1 } })).toBe(
      'Sarah Mitchell issued an RFI: 1 item',
    );
  });

  it('renders EVALUATE with no breOutcome', () => {
    expect(buildAuditSummary({ ...base, action: 'EVALUATE', metadata: {} })).toBe(
      'Sarah Mitchell ran eligibility evaluation',
    );
  });

  it('formats a NON_MAGI determination category as "Non-MAGI"', () => {
    expect(
      buildAuditSummary({
        ...base,
        action: 'CREATE',
        resourceType: 'MedicaidEeDetermination',
        metadata: { category: 'NON_MAGI', determinationStatus: 'INELIGIBLE' },
      }),
    ).toBe('Sarah Mitchell recorded a Non-MAGI determination: Ineligible');
  });

  // Round-5 review S1 — prefix-only determination + breOutcome-less reeval success.
  it('renders a determination CREATE with a category but no status', () => {
    expect(
      buildAuditSummary({
        ...base,
        action: 'CREATE',
        resourceType: 'MedicaidEeDetermination',
        metadata: { category: 'MAGI' },
      }),
    ).toBe('Sarah Mitchell recorded a MAGI determination');
  });

  it('renders a determination CREATE with neither category nor status', () => {
    expect(
      buildAuditSummary({ ...base, action: 'CREATE', resourceType: 'MedicaidEeDetermination', metadata: {} }),
    ).toBe('Sarah Mitchell recorded a determination');
  });

  it('renders REEVALUATE success with no breOutcome', () => {
    expect(buildAuditSummary({ ...base, action: 'REEVALUATE', metadata: {}, outcome: 'success' })).toBe(
      'Sarah Mitchell re-ran eligibility',
    );
  });

  // ENG-1988 — verification-source handshake + DDS workflow events.
  it('renders REQUEST_VERIFICATION with service + type labels (acronyms preserved)', () => {
    expect(
      buildAuditSummary({
        ...base,
        action: 'REQUEST_VERIFICATION',
        actorId: 'system',
        metadata: { service: 'SSA', verificationType: 'SSN' },
      }),
    ).toBe('System requested SSA verification: SSN');
  });

  it('renders RECEIVE_VERIFICATION (verified) source-first, no actor prefix', () => {
    expect(
      buildAuditSummary({
        ...base,
        action: 'RECEIVE_VERIFICATION',
        actorId: 'system',
        metadata: { service: 'IRS', verificationType: 'INCOME', result: 'VERIFIED' },
      }),
    ).toBe('IRS verified income');
  });

  it('renders RECEIVE_VERIFICATION (RFI_REQUIRED) as a documentation request', () => {
    expect(
      buildAuditSummary({
        ...base,
        action: 'RECEIVE_VERIFICATION',
        actorId: 'system',
        metadata: { service: 'AVS', verificationType: 'ASSETS', result: 'RFI_REQUIRED' },
      }),
    ).toBe('AVS flagged assets — documentation requested');
  });

  // S1 fallback branches — events the script can emit with partial metadata.
  it('renders REQUEST_VERIFICATION without a verificationType', () => {
    expect(
      buildAuditSummary({ ...base, action: 'REQUEST_VERIFICATION', actorId: 'system', metadata: { service: 'SSA' } }),
    ).toBe('System requested SSA verification');
  });

  it('renders RECEIVE_VERIFICATION without a service (generic source label)', () => {
    expect(
      buildAuditSummary({
        ...base,
        action: 'RECEIVE_VERIFICATION',
        actorId: 'system',
        metadata: { verificationType: 'INCOME', result: 'VERIFIED' },
      }),
    ).toBe('A verification source verified income');
  });

  it('renders RECEIVE_VERIFICATION without a verificationType (generic item label)', () => {
    expect(
      buildAuditSummary({
        ...base,
        action: 'RECEIVE_VERIFICATION',
        actorId: 'system',
        metadata: { service: 'SSA', result: 'VERIFIED' },
      }),
    ).toBe('SSA verified the requested item');
  });

  it('expands the RESIDENCY service code to "Residency Service"', () => {
    expect(
      buildAuditSummary({
        ...base,
        action: 'RECEIVE_VERIFICATION',
        actorId: 'system',
        metadata: { service: 'RESIDENCY', verificationType: 'RESIDENCY', result: 'VERIFIED' },
      }),
    ).toBe('Residency Service verified residency');
  });

  // S1 (round 2) — RFI_REQUIRED fallback combinations.
  it('renders RECEIVE_VERIFICATION RFI_REQUIRED without a service', () => {
    expect(
      buildAuditSummary({
        ...base,
        action: 'RECEIVE_VERIFICATION',
        actorId: 'system',
        metadata: { verificationType: 'ASSETS', result: 'RFI_REQUIRED' },
      }),
    ).toBe('A verification source flagged assets — documentation requested');
  });

  it('renders RECEIVE_VERIFICATION RFI_REQUIRED without a verificationType', () => {
    expect(
      buildAuditSummary({
        ...base,
        action: 'RECEIVE_VERIFICATION',
        actorId: 'system',
        metadata: { service: 'AVS', result: 'RFI_REQUIRED' },
      }),
    ).toBe('AVS flagged the requested item — documentation requested');
  });

  // S2 (round 2) — unmapped verificationType code: lower-cased, underscores → spaces.
  it('renders an unmapped verificationType as lower-case de-underscored prose', () => {
    expect(
      buildAuditSummary({
        ...base,
        action: 'RECEIVE_VERIFICATION',
        actorId: 'system',
        metadata: { service: 'IRS', verificationType: 'UNEMPLOYMENT_INCOME', result: 'VERIFIED' },
      }),
    ).toBe('IRS verified unemployment income');
  });

  it('renders REFER_DDS and CONFIRM_DDS with the caseworker name', () => {
    expect(buildAuditSummary({ ...base, action: 'REFER_DDS', metadata: {} })).toBe(
      'Sarah Mitchell referred the case to Disability Determination Services',
    );
    expect(buildAuditSummary({ ...base, action: 'CONFIRM_DDS', metadata: {} })).toBe(
      'Sarah Mitchell recorded the DDS disability determination',
    );
  });

  // PHI guard — a stray financial value in metadata must never reach the sentence.
  it('never renders a non-allowlisted amount key on a verification event', () => {
    const summary = buildAuditSummary({
      ...base,
      action: 'RECEIVE_VERIFICATION',
      actorId: 'system',
      // ssdiAmount is NOT read by the presenter — proves the allowlist holds.
      metadata: { service: 'SSA', verificationType: 'SSDI_INCOME', result: 'VERIFIED', ssdiAmount: 1240 },
    });
    expect(summary).toBe('SSA verified SSDI income');
    expect(summary).not.toContain('1240');
  });

  // --- ENG-1988 ST-2: actor attribution (System / applicant / caseworker) ---

  it('renders actorType SYSTEM on EVALUATE with a non-roster UUID as "System …"', () => {
    const summary = buildAuditSummary({
      ...base,
      action: 'EVALUATE',
      actorId: NON_ROSTER_UUID,
      metadata: { actorType: 'SYSTEM', breOutcome: 'ELIGIBLE', coverageType: 'MAGI' },
    });
    expect(summary).toBe('System ran eligibility evaluation: Eligible (MAGI)');
  });

  it('legacy heuristic: EVALUATE with a non-roster UUID and no actorType → System', () => {
    expect(buildAuditSummary({ ...base, action: 'EVALUATE', actorId: NON_ROSTER_UUID, metadata: {} })).toBe(
      'System ran eligibility evaluation',
    );
  });

  it('legacy heuristic: determination CREATE with a non-roster UUID → System', () => {
    expect(
      buildAuditSummary({
        ...base,
        action: 'CREATE',
        resourceType: 'MedicaidEeDetermination',
        actorId: NON_ROSTER_UUID,
        metadata: { category: 'MAGI', determinationStatus: 'ELIGIBLE' },
      }),
    ).toBe('System recorded a MAGI determination: Eligible');
  });

  it('legacy heuristic: REEVALUATE / RECEIVE_VERIFICATION / REQUEST_VERIFICATION with a non-roster UUID → System', () => {
    expect(buildAuditSummary({ ...base, action: 'REEVALUATE', actorId: NON_ROSTER_UUID, metadata: {} })).toBe(
      'System re-ran eligibility',
    );
    // RECEIVE_VERIFICATION is source-framed (no actor prefix) but must still
    // classify as the system actor under the heuristic — see resolveActorDisplay test.
    expect(
      buildAuditSummary({
        ...base,
        action: 'REQUEST_VERIFICATION',
        actorId: NON_ROSTER_UUID,
        metadata: { service: 'SSA', verificationType: 'SSN' },
      }),
    ).toBe('System requested SSA verification: SSN');
  });

  it('case CREATE with a non-roster UUID + applicantName → applicant framing (never "caseworker")', () => {
    const summary = buildAuditSummary(
      { ...base, action: 'CREATE', resourceType: 'MedicaidEeCase', actorId: NON_ROSTER_UUID, metadata: {} },
      { applicantName: 'Jasmine Carter' },
    );
    expect(summary).toBe('Application submitted by Jasmine Carter — case created');
    expect(summary.toLowerCase()).not.toContain('caseworker');
  });

  it('case CREATE applicant framing without an applicant name', () => {
    expect(
      buildAuditSummary({
        ...base,
        action: 'CREATE',
        resourceType: 'MedicaidEeCase',
        actorId: NON_ROSTER_UUID,
        metadata: {},
      }),
    ).toBe('Application submitted — case created');
  });

  it('precedence: a roster id on EVALUATE is never downgraded to System', () => {
    expect(
      buildAuditSummary({ ...base, action: 'EVALUATE', actorId: TEAM.sarah.id, metadata: { breOutcome: 'ELIGIBLE' } }),
    ).toBe('Sarah Mitchell ran eligibility evaluation: Eligible');
    // Even an explicit actorType SYSTEM cannot override a roster identity.
    expect(
      buildAuditSummary({
        ...base,
        action: 'EVALUATE',
        actorId: TEAM.sarah.id,
        metadata: { actorType: 'SYSTEM', breOutcome: 'ELIGIBLE' },
      }),
    ).toBe('Sarah Mitchell ran eligibility evaluation: Eligible');
  });

  it('precedence: actorId "system" always wins, even over a machine action with metadata', () => {
    expect(buildAuditSummary({ ...base, action: 'EVALUATE', actorId: 'system', metadata: {} })).toBe(
      'System ran eligibility evaluation',
    );
  });

  it('seeded alias: the Demo Admin login UUID on STATUS_TRANSITION renders as Sarah Mitchell', () => {
    expect(
      buildAuditSummary({
        ...base,
        action: 'STATUS_TRANSITION',
        actorId: SEEDED_ADMIN_UUID,
        metadata: { fromStatus: 'PENDING_REVIEW', toStatus: 'APPROVED' },
      }),
    ).toBe('Sarah Mitchell changed case status from Pending Review to Approved');
  });

  it('actorType CASEWORKER (no roster match) renders the generic "A caseworker"', () => {
    expect(
      buildAuditSummary({
        ...base,
        action: 'STATUS_TRANSITION',
        actorId: NON_ROSTER_UUID,
        metadata: { actorType: 'CASEWORKER', toStatus: 'APPROVED' },
      }),
    ).toBe('A caseworker changed case status to Approved');
  });

  it('an invalid actorType falls through to the heuristic and never throws', () => {
    let summary = '';
    expect(() => {
      summary = buildAuditSummary({
        ...base,
        action: 'EVALUATE',
        actorId: NON_ROSTER_UUID,
        metadata: { actorType: 'GREMLIN' },
      });
    }).not.toThrow();
    // GREMLIN is ignored → heuristic → EVALUATE is a machine action → System.
    expect(summary).toBe('System ran eligibility evaluation');
  });

  it('never renders metadata.triggeredBy for any mapped action (PHI allowlist)', () => {
    const SECRET = 'SECRET-REF-123';
    const actions: ReadonlyArray<Partial<AuditSummaryInput>> = [
      { action: 'CREATE', resourceType: 'MedicaidEeCase' },
      { action: 'CREATE', resourceType: 'MedicaidEeDetermination' },
      { action: 'UPDATE' },
      { action: 'STATUS_TRANSITION' },
      { action: 'CREATE_LINKED_CASE' },
      { action: 'ISSUE_RFI' },
      { action: 'RESOLVE_RFI' },
      { action: 'EVALUATE' },
      { action: 'REEVALUATE' },
      { action: 'REQUEST_VERIFICATION' },
      { action: 'RECEIVE_VERIFICATION' },
      { action: 'REFER_DDS' },
      { action: 'CONFIRM_DDS' },
    ];
    for (const partial of actions) {
      const summary = buildAuditSummary(
        { ...base, ...partial, metadata: { actorType: 'SYSTEM', triggeredBy: SECRET } },
        { applicantName: 'Jasmine Carter' },
      );
      expect(summary).not.toContain(SECRET);
    }
  });
});

describe('resolveActorDisplay (ENG-1988 ST-2)', () => {
  const evalBase: AuditSummaryInput = {
    action: 'EVALUATE',
    resourceType: 'MedicaidEeCase',
    outcome: 'success',
    actorId: NON_ROSTER_UUID,
    metadata: {},
  };

  it('classifies the explicit system actor', () => {
    expect(resolveActorDisplay({ ...evalBase, actorId: 'system' })).toEqual({
      name: 'System',
      isSystem: true,
      isApplicant: false,
    });
  });

  it('classifies a roster identity and never downgrades it', () => {
    expect(resolveActorDisplay({ ...evalBase, actorId: TEAM.sarah.id, metadata: { actorType: 'SYSTEM' } })).toEqual({
      name: 'Sarah Mitchell',
      isSystem: false,
      isApplicant: false,
    });
  });

  it('classifies actorType SYSTEM, CASEWORKER, and APPLICANT', () => {
    expect(resolveActorDisplay({ ...evalBase, metadata: { actorType: 'SYSTEM' } }).isSystem).toBe(true);
    expect(resolveActorDisplay({ ...evalBase, metadata: { actorType: 'CASEWORKER' } })).toEqual({
      name: 'A caseworker',
      isSystem: false,
      isApplicant: false,
    });
    expect(
      resolveActorDisplay({ ...evalBase, metadata: { actorType: 'APPLICANT' } }, { applicantName: 'Jasmine Carter' }),
    ).toEqual({ name: 'Jasmine Carter', isSystem: false, isApplicant: true });
  });

  it('classifies a heuristic RECEIVE_VERIFICATION as the system actor', () => {
    expect(resolveActorDisplay({ ...evalBase, action: 'RECEIVE_VERIFICATION' }).isSystem).toBe(true);
  });

  it('classifies case CREATE as the applicant, falling back to "Applicant" without a name', () => {
    expect(resolveActorDisplay({ ...evalBase, action: 'CREATE', resourceType: 'MedicaidEeCase' })).toEqual({
      name: 'Applicant',
      isSystem: false,
      isApplicant: true,
    });
  });

  it('falls back to the generic caseworker for an unclassifiable action', () => {
    expect(resolveActorDisplay({ ...evalBase, action: 'STATUS_TRANSITION' })).toEqual({
      name: 'A caseworker',
      isSystem: false,
      isApplicant: false,
    });
  });
});
