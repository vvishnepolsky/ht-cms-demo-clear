/**
 * Hardcoded Activity Log rows for the ex-parte renewal fallout archetype
 * (Diane M. Caldwell) — ENG-2037.
 *
 * The live audit feed for this case only carries generic CRUD events, which
 * undersells the demo narrative: the renewal was system-initiated, electronic
 * verification ran and failed, and a pre-populated form went out across four
 * channels — all before a caseworker ever touched the case. For the CMS demo,
 * the Activity Log tab MERGES these curated rows (matched by applicant name,
 * see `isExParteAuditMockCase`) chronologically into the real
 * `medicaidAuditLog` feed (ENG-2080) — live caseworker actions during a demo
 * stay visible, sorted against the frozen arc via each row's `sortTimestamp`.
 *
 * Dates and dollar figures are derived from `./renewals.ts` so this log tells
 * the same story as the Verify tab's ExParteVerifyPanel on the same screen
 * (same form-sent day, same 9:0x AM delivery timestamps, same IRS/SWICA/
 * Argyle results, same response-window due date).
 */

import type { ActivityRow } from '../lib/audit-operations';
import {
  COVERAGE_ENDS_DISPLAY,
  FORM_SENT_DISPLAY,
  formSentDate,
  RENEWAL_MEMBER,
  RESPONSE_DUE_DISPLAY,
  RESPONSE_WINDOW_DAYS,
} from './renewals';

/**
 * True when this case is the Diane Caldwell ex-parte renewal archetype.
 * Matched on applicant name (not case id) so the mock survives dev reseeds
 * and works on any environment's copy of the showcase case.
 */
export function isExParteAuditMockCase(applicantName: string | null | undefined): boolean {
  if (!applicantName) return false;
  return /diane/i.test(applicantName) && /caldwell/i.test(applicantName);
}

/** "MM/DD" slice of the form-sent day for the Timeline view's compact column. */
const FORM_SENT_COMPACT = FORM_SENT_DISPLAY.slice(0, 5);

/**
 * ISO timestamp on the form-sent day at the given UTC time — feeds the rows'
 * `sortTimestamp` so they merge-sort correctly against real audit events
 * (ENG-2080). Display strings stay hand-authored; only ordering uses this.
 */
function formSentTimestamp(hourUtc: number, minuteUtc: number): string {
  const d = new Date(formSentDate);
  d.setUTCHours(hourUtc, minuteUtc, 0, 0);
  return d.toISOString();
}

/** Build the shared row fields for a system-authored event on form-sent day. */
function systemRow(
  key: string,
  time: string,
  sortTimestamp: string,
  actor: string,
  summary: string,
  noteLines: readonly string[],
  outcome: ActivityRow['outcome'] = 'success',
): ActivityRow {
  return {
    key,
    sortTimestamp,
    displayDate: `${FORM_SENT_DISPLAY} ${time}`,
    compactDate: `${FORM_SENT_COMPACT} ${time}`,
    actorDisplay: actor,
    actorTooltip: actor,
    initials: 'SYS',
    summary,
    action: summary,
    // Empty resourceType/eventType suppress the identifier + event-type
    // lines in both views — these narrative rows carry bullets instead.
    resourceType: '',
    resourceIdDisplay: '',
    resourceIdTooltip: '',
    eventType: '',
    outcome,
    badgeLabel: 'Auto',
    noteLines,
  };
}

const SYSTEM_ACTOR = 'System (Auto)';
const RULES_ENGINE_ACTOR = 'Rules Engine v4.2';

/**
 * The five curated events, newest first (the tab renders in array order).
 * Copy mirrors the ENG-2037 design reference.
 */
export const EX_PARTE_AUDIT_ROWS: readonly ActivityRow[] = [
  systemRow(
    'exparte-audit-delivery',
    '9:02 AM',
    formSentTimestamp(9, 2),
    SYSTEM_ACTOR,
    'Multi-channel delivery — Portal posted · Mail queued · SMS sent · Email sent',
    [
      'Pre-populated renewal form delivered to citizen portal inbox, queued for USPS first-class mail (nightly batch), and member notified via SMS and email',
      `Response window opens — ${RESPONSE_WINDOW_DAYS} days, due ${RESPONSE_DUE_DISPLAY}`,
    ],
  ),
  systemRow(
    'exparte-audit-form-generated',
    '8:30 AM',
    formSentTimestamp(8, 30),
    SYSTEM_ACTOR,
    'Pre-Populated Renewal Form Generated (Form A-5170)',
    [
      `Form auto-populated from verified case data: name, SSN, address, category (${RENEWAL_MEMBER.category}), HH of ${RENEWAL_MEMBER.householdSize}, last attested income ${RENEWAL_MEMBER.lastReportedIncome} (${RENEWAL_MEMBER.lastEmployer})`,
      'Member action requested: confirm or update current employer and income',
    ],
  ),
  systemRow(
    'exparte-audit-failed',
    '3:45 AM',
    formSentTimestamp(3, 45),
    RULES_ENGINE_ACTOR,
    'EX-PARTE RENEWAL FAILED — Income Unable to Verify',
    [
      'Reasonable compatibility test failed',
      'Available data is missing or inconsistent with current income: IRS tax-year-2024 data stale, SWICA Q1 2026 wage record missing, Argyle returned no match (no member-permissioned payroll connection on file)',
      'Case routed to pre-populated form workflow',
    ],
    'failure',
  ),
  systemRow(
    'exparte-audit-queries',
    '3:30 AM',
    formSentTimestamp(3, 30),
    SYSTEM_ACTOR,
    'FDSH + State Source Queries Complete',
    [
      'SSA: matched (citizenship & identity)',
      'FDSH/IRS: stale (2024 wages $19,500)',
      'SWICA: incomplete (Q4 2025 $5,400; Q1 2026 missing)',
      'Argyle: no match (no member-permissioned payroll connection on file)',
      'State Vital Records: address unchanged',
      'CMS/TPL: no other coverage',
    ],
  ),
  systemRow(
    'exparte-audit-initiated',
    '3:00 AM',
    formSentTimestamp(3, 0),
    SYSTEM_ACTOR,
    'Renewal Cycle Initiated (T-90)',
    [
      `Annual Medicaid renewal cycle auto-initiated for case ${RENEWAL_MEMBER.medicaidId} (${RENEWAL_MEMBER.name}, HH of ${RENEWAL_MEMBER.householdSize})`,
      `Current certification expires ${COVERAGE_ENDS_DISPLAY}`,
      'Case routed to Ex-Parte renewal queue',
    ],
  ),
];
