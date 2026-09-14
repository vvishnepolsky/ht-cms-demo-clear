/**
 * Curated verification-narrative Activity Log rows for the live-submission
 * demo personas — Jasmine Carter (MAGI Pregnant Women) and Robert Mitchell
 * (Non-MAGI ABD) — ENG-2080.
 *
 * Why this exists
 * ---------------
 * These two personas are submitted live through the cms-demo resident app
 * during demo sessions (they are NOT seeded showcase cases, and every
 * `reset-statex-demo.sh` run wipes them). The backend emits only the organic
 * audit events for a submission (case CREATE, one BRE EVALUATE, determination
 * RECORD_CREATEs, STATUS_TRANSITIONs, RFI issue/resolve) — it never emits the
 * per-source verification handshake (SSA / IRS / AVS / Residency) or the DDS
 * referral narrative the demo script walks through. Previously an engineer
 * ran `emit-cms-demo-case-trace.ts` (ENG-2070 / PR #1819) against the real S3
 * audit store after each submission; this module replaces that demo-timing
 * dependency with the accepted ENG-2037 frontend-mock pattern, upgraded:
 *
 *   - MERGED with the real feed, not swapped: real events (submission,
 *     evaluation, approvals, live caseworker actions) render in their true
 *     timeline position alongside these rows.
 *   - Anchored to the case's REAL event timestamps: handshake rows are placed
 *     inside the actual [creation → evaluation] window, DDS rows after the
 *     evaluation (and before the approval when one exists) — so the merged
 *     timeline always reads in causal order no matter when the case was
 *     submitted or how fast the BRE ran.
 *   - Complementary by construction: row content covers ONLY actions the
 *     backend never emits (see CURATED_ACTIONS vs. organic action codes);
 *     nothing double-renders next to the real feed.
 *
 * Diane Caldwell's ex-parte narrative is separate (`exParteAuditLog.ts`,
 * ENG-2037): her rows sit on the frozen renewal arc (T-90 story) rather than
 * submission-relative offsets, because her dates must agree with the Verify
 * tab and the A-5170 form on the same screen.
 *
 * PHI policy: identical to the emit script — row copy carries verification
 * sources, types and result codes only; never dollar amounts, SSNs, or DOBs.
 */

import { formatCompact, formatFull, type ActivityRow, type AuditLogEntry } from '../lib/audit-operations';

/** Personas with curated verification narratives (Diane is handled by exParteAuditLog.ts). */
export type NarrativePersona = 'jasmine-carter' | 'robert-mitchell';

/**
 * True when this case belongs to a live-submission persona with a curated
 * verification narrative. Name-matched (not caseId) so it survives reseeds
 * and re-submissions — same convention as `isExParteAuditMockCase`.
 */
export function matchNarrativePersona(applicantName: string | null | undefined): NarrativePersona | null {
  if (!applicantName) return null;
  if (/jasmine/i.test(applicantName) && /carter/i.test(applicantName)) return 'jasmine-carter';
  if (/robert/i.test(applicantName) && /mitchell/i.test(applicantName)) return 'robert-mitchell';
  return null;
}

/** Where a curated row belongs relative to the case's real (organic) events. */
type Phase = 'pre-evaluate' | 'post-evaluate';

interface NarrativeSpecRow {
  /** Stable key suffix — also keeps React keys unique across personas. */
  slug: string;
  phase: Phase;
  /** Mirrors the audit action vocabulary so the in-tab search behaves naturally. */
  action: string;
  actor: 'system' | 'caseworker';
  summary: string;
  noteLines: readonly string[];
  outcome?: 'success' | 'failure';
}

/**
 * Curated action codes as named consts (C.1): `ActivityRow.action` is typed
 * `string`, so tests comparing against inline literals would get no
 * compile-time check against these definitions — importing the consts does.
 */
export const ACTION_REQUEST_VERIFICATION = 'REQUEST_VERIFICATION' as const;
export const ACTION_RECEIVE_VERIFICATION = 'RECEIVE_VERIFICATION' as const;
export const ACTION_ISSUE_RFI = 'ISSUE_RFI' as const;
export const ACTION_RESOLVE_RFI = 'RESOLVE_RFI' as const;
export const ACTION_REFER_DDS = 'REFER_DDS' as const;
export const ACTION_CONFIRM_DDS = 'CONFIRM_DDS' as const;

const SYSTEM_ACTOR_DISPLAY = 'System (Auto)';
/** Seeded State-X demo caseworker — the roster alias used across the demo data set. */
const CASEWORKER_ACTOR_DISPLAY = 'Sarah Mitchell';

const requestRow = (slug: string, source: string, kind: string, detail: string): NarrativeSpecRow => ({
  slug,
  phase: 'pre-evaluate',
  action: ACTION_REQUEST_VERIFICATION,
  actor: 'system',
  summary: `Verification requested from ${source} — ${kind}`,
  noteLines: [detail, 'Request submitted electronically via the federal/state data services hub'],
});

const receiveRow = (
  slug: string,
  source: string,
  kind: string,
  detail: string,
  outcome: 'success' | 'failure' = 'success',
): NarrativeSpecRow => ({
  slug,
  phase: 'pre-evaluate',
  action: ACTION_RECEIVE_VERIFICATION,
  actor: 'system',
  summary:
    outcome === 'success'
      ? `Verification received from ${source} — ${kind} verified`
      : `Verification received from ${source} — ${kind} requires follow-up`,
  noteLines: [detail],
  outcome,
});

/**
 * Jasmine Carter — MAGI Pregnant Women. Income-only (no asset test, no DDS).
 * The organic feed already carries her submission, single BRE evaluation and
 * auto-approval; these rows add only the source handshake between them.
 */
const JASMINE_ROWS: readonly NarrativeSpecRow[] = [
  requestRow('jasmine-req-ssa', 'SSA', 'SSN & identity', 'SSN match and identity proofing requested for the household'),
  requestRow(
    'jasmine-req-irs',
    'FDSH/IRS',
    'income',
    'MAGI household income verification requested (most recent tax year + quarterly wage data)',
  ),
  requestRow(
    'jasmine-req-res',
    'State Vital Records',
    'residency',
    'State residency confirmation requested against the address on file',
  ),
  receiveRow(
    'jasmine-rec-ssa',
    'SSA',
    'SSN & identity',
    'SSA: matched — citizenship and identity confirmed for all household members',
  ),
  receiveRow(
    'jasmine-rec-irs',
    'FDSH/IRS',
    'income',
    'Reported income reasonably compatible with electronic sources — no documentation required',
  ),
  receiveRow(
    'jasmine-rec-res',
    'State Vital Records',
    'residency',
    'Residency confirmed — address consistent with state records',
  ),
];

/**
 * Robert Mitchell — Non-MAGI ABD (disability path). Adds the SSDI/asset
 * handshake, the asset RFI cycle, and the caseworker DDS certification —
 * none of which the backend emits organically.
 */
const ROBERT_ROWS: readonly NarrativeSpecRow[] = [
  requestRow('robert-req-ssa-ssn', 'SSA', 'SSN & identity', 'SSN match and identity proofing requested'),
  requestRow(
    'robert-req-ssa-ssdi',
    'SSA',
    'SSDI income',
    'SSDI benefit income verification requested (Non-MAGI budgeting)',
  ),
  requestRow('robert-req-irs', 'FDSH/IRS', 'income', 'Unearned/earned income verification requested'),
  requestRow(
    'robert-req-avs',
    'AVS',
    'assets',
    'Asset Verification System sweep requested (financial institution records)',
  ),
  requestRow('robert-req-res', 'State Vital Records', 'residency', 'State residency confirmation requested'),
  receiveRow('robert-rec-ssa-ssn', 'SSA', 'SSN & identity', 'SSA: matched — citizenship and identity confirmed'),
  receiveRow('robert-rec-irs', 'FDSH/IRS', 'income', 'Income consistent with electronic sources'),
  receiveRow('robert-rec-ssa-ssdi', 'SSA', 'SSDI income', 'SSDI benefit amount verified against SSA records'),
  receiveRow(
    'robert-rec-res',
    'State Vital Records',
    'residency',
    'Residency confirmed — address consistent with state records',
  ),
  receiveRow(
    'robert-rec-avs',
    'AVS',
    'assets',
    'AVS sweep incomplete — reported accounts could not be fully matched; bank statements required to complete the resource test',
    'failure',
  ),
  {
    slug: 'robert-rfi-issued',
    phase: 'pre-evaluate',
    action: ACTION_ISSUE_RFI,
    actor: 'system',
    summary: 'Request for information issued — asset documentation',
    noteLines: [
      'Items requested: bank statements for accounts not matched by AVS (1 item)',
      'Resource test paused until documentation is received',
    ],
  },
  {
    slug: 'robert-rfi-resolved',
    phase: 'pre-evaluate',
    action: ACTION_RESOLVE_RFI,
    actor: 'caseworker',
    summary: 'Request for information resolved — asset documentation received',
    noteLines: ['Submitted bank statements reviewed; resource data now sufficient for the ABD resource test'],
  },
  {
    slug: 'robert-dds-referred',
    phase: 'post-evaluate',
    action: ACTION_REFER_DDS,
    actor: 'caseworker',
    summary: 'Referred to Disability Determination Services (DDS)',
    noteLines: [
      'Financial criteria met — disability certification required for the ABD category',
      'Referral packet transmitted; case held pending DDS determination',
    ],
  },
  {
    slug: 'robert-dds-confirmed',
    phase: 'post-evaluate',
    action: ACTION_CONFIRM_DDS,
    actor: 'caseworker',
    summary: 'DDS confirmed disability — ABD category assigned',
    noteLines: ['Disability certification received from DDS; aged/blind/disabled category criteria satisfied'],
  },
];

const SPEC_BY_PERSONA: Record<NarrativePersona, readonly NarrativeSpecRow[]> = {
  'jasmine-carter': JASMINE_ROWS,
  'robert-mitchell': ROBERT_ROWS,
};

/**
 * Curated action vocabulary. Kept exported so a test can assert it stays
 * DISJOINT from the organic backend action codes (CREATE, RECORD_CREATE,
 * EVALUATE, STATUS_TRANSITION) — the "complement, don't duplicate" invariant.
 */
export const CURATED_ACTIONS = [
  ACTION_REQUEST_VERIFICATION,
  ACTION_RECEIVE_VERIFICATION,
  ACTION_ISSUE_RFI,
  ACTION_RESOLVE_RFI,
  ACTION_REFER_DDS,
  ACTION_CONFIRM_DDS,
] as const;

/**
 * Organic action codes the backend emits for a live submission (ENG-1988
 * dev-data ground truth). Curated rows must never use these.
 */
export const ORGANIC_ACTIONS = ['CREATE', 'RECORD_CREATE', 'EVALUATE', 'STATUS_TRANSITION'] as const;

interface TimelineAnchors {
  /** Case creation moment (ms epoch). */
  createMs: number;
  /** BRE evaluation moment (ms epoch). */
  evaluateMs: number;
  /** First approval/transition after the evaluation, when one exists. */
  approveMs: number | null;
}

/**
 * Derive the real timeline anchors from the case's organic audit entries.
 * Falls back to synthetic anchors near `nowMs` when the S3-backed feed lags
 * a fresh submission (rows re-anchor automatically on the next poll once the
 * organic events land).
 */
function deriveAnchors(entries: ReadonlyArray<AuditLogEntry>, nowMs: number): TimelineAnchors {
  const ts = (e: AuditLogEntry) => new Date(e.timestamp).getTime();
  const valid = entries.filter((e) => !Number.isNaN(ts(e)));

  const oldest = valid.length > 0 ? Math.min(...valid.map(ts)) : null;
  const evaluate = valid
    .filter((e) => e.action === 'EVALUATE')
    .map(ts)
    .sort((a, b) => a - b)[0];

  const createMs = oldest ?? nowMs - 90_000;
  const evaluateMs = evaluate ?? createMs + 45_000;

  const approve = valid
    .filter((e) => e.action === 'STATUS_TRANSITION')
    .map(ts)
    .filter((t) => t >= evaluateMs)
    .sort((a, b) => a - b)[0];

  return { createMs, evaluateMs, approveMs: approve ?? null };
}

/** Evenly place `count` instants strictly inside the open interval (startMs, endMs). */
function spread(startMs: number, endMs: number, count: number): number[] {
  const span = Math.max(endMs - startMs, count + 1); // ≥1ms apart even in degenerate windows
  return Array.from({ length: count }, (_, i) => Math.round(startMs + (span * (i + 1)) / (count + 1)));
}

function toRow(spec: NarrativeSpecRow, ms: number): ActivityRow {
  const iso = new Date(ms).toISOString();
  const actorDisplay = spec.actor === 'system' ? SYSTEM_ACTOR_DISPLAY : CASEWORKER_ACTOR_DISPLAY;
  return {
    key: `persona-narrative-${spec.slug}`,
    sortTimestamp: iso,
    displayDate: formatFull(iso),
    compactDate: formatCompact(iso),
    actorDisplay,
    actorTooltip: actorDisplay,
    initials: spec.actor === 'system' ? 'SYS' : 'SM',
    summary: spec.summary,
    action: spec.action,
    // Empty resourceType/eventType suppress the identifier + event-type lines
    // in both views — narrative rows carry bullets instead (ENG-2037 pattern).
    resourceType: '',
    resourceIdDisplay: '',
    resourceIdTooltip: '',
    eventType: '',
    outcome: spec.outcome ?? 'success',
    // System rows get the "Auto" chip; caseworker rows keep the normal
    // Success/Failure outcome pill so they read like real caseworker events.
    ...(spec.actor === 'system' ? { badgeLabel: 'Auto' } : {}),
    noteLines: spec.noteLines,
  };
}

/**
 * Build the curated narrative rows for a persona, anchored to the case's real
 * event timeline.
 *
 * - `pre-evaluate` rows are spread inside the real (creation → evaluation)
 *   window, preserving spec order — requests, then receives, then the RFI
 *   cycle — so the merged log always reads causally even when the BRE ran
 *   within seconds of submission (sub-minute spacing is invisible at the
 *   minute-granularity display format, but the sort order is exact).
 * - `post-evaluate` rows land after the evaluation and, when the case already
 *   has an approval transition, before it (DDS certification precedes
 *   approval in the Non-MAGI story).
 *
 * Pure given (entries, nowMs) — `nowMs` is injected for determinism in tests
 * and only used when the feed has no entries yet.
 */
export function buildPersonaNarrativeRows(
  persona: NarrativePersona,
  entries: ReadonlyArray<AuditLogEntry>,
  nowMs: number,
): ActivityRow[] {
  const spec = SPEC_BY_PERSONA[persona];
  const { createMs, evaluateMs, approveMs } = deriveAnchors(entries, nowMs);

  const pre = spec.filter((r) => r.phase === 'pre-evaluate');
  const post = spec.filter((r) => r.phase === 'post-evaluate');

  const preTimes = spread(createMs, evaluateMs, pre.length);
  const postEnd = approveMs ?? evaluateMs + (post.length + 1) * 30_000;
  const postTimes = spread(evaluateMs, postEnd, post.length);

  return [...pre.map((r, i) => toRow(r, preTimes[i])), ...post.map((r, i) => toRow(r, postTimes[i]))];
}
