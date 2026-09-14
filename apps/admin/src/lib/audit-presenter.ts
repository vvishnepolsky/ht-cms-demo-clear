/**
 * audit-presenter — ENG-1925
 *
 * Maps a raw audit event (action, resourceType, metadata, outcome, actor) to a
 * human-readable sentence for the Activity Log tab, replacing the previous
 * behavior of rendering the raw SCREAMING_SNAKE `action` code.
 *
 * Why this exists: medicaid-ee audit `action` values are codes
 * (`STATUS_TRANSITION`, `EVALUATE`, …) and the informative payload lives in
 * `metadata`. The tab used to show only the code and dropped the metadata, so
 * a row read "STATUS_TRANSITION" instead of "… changed case status from
 * Pending Review to Approved".
 *
 * PHI policy (ENG-1925 decision — minimum necessary): this presenter is the
 * allowlist enforcement point. It reads ONLY the structured metadata keys named
 * below — statuses, counts, enums, dates, and the document-type labels in
 * `itemsRequested`. ENG-1988 adds three more enum-code keys, all safe:
 * `service` (agency code, e.g. `'SSA'`), `verificationType` (e.g. `'SSDI_INCOME'`),
 * and `result` (`'VERIFIED'` / `'RFI_REQUIRED'`). ENG-1988 ST-2 adds one more:
 * `actorType` — a closed enum (`'SYSTEM' | 'CASEWORKER' | 'APPLICANT'`) used only
 * to classify the actor (System vs caseworker vs applicant), never rendered raw.
 * Its sibling `triggeredBy` (an opaque internal ref) is deliberately NOT
 * allowlisted and must NEVER be read or rendered. The Verify Assist flag rows
 * (`VERIFY_ASSIST_FLAG_UPDATED`) add `noteAdded` (boolean) next to the existing
 * `fromStatus`/`toStatus` enums; their `assignee` (an email) and `flagId` are
 * NOT rendered. Free-form, operator-entered
 * values (`reason`, `noteToApplicant`, `resolution`) are NEVER read or rendered
 * either, even though `metadata` now flows to the client. Adding a new key to a
 * handler is a deliberate, reviewable act — keep free-form prose out.
 *
 * Pure module: no React, no I/O. Fully unit-tested in audit-presenter.test.ts.
 */

import { TEAM_ROSTER, DEFAULT_CASEWORKER } from '../data/team';

/** Audit metadata is primitives-only on the write side (`@ht/audit-logger`). */
export type AuditMetadata = Record<string, string | number | boolean> | null | undefined;

export interface AuditSummaryInput {
  action: string;
  resourceType: string;
  outcome: 'success' | 'failure';
  actorId: string;
  metadata?: AuditMetadata;
}

export interface AuditSummaryContext {
  /**
   * Applicant name from the drawer's `caseRow`, used for case-level CREATE rows
   * (the CREATE event itself carries no metadata). Already on-screen in the
   * drawer header, so rendering it here adds no new exposure surface.
   */
  applicantName?: string | null;
}

// --- Actor resolution (ENG-1925 decision: resolve names from the team roster) ---

/**
 * Seeded-identity aliases (ENG-1988 ST-2). These are the two synthetic State-X
 * login Person UUIDs from `services/identity-service/scripts/seed-statex.ts`
 * (the seeded `admin@state-x.gov` "Demo Admin" and `caseworker@state-x.gov`
 * accounts). Every demo caseworker signs in as one of these, so real audit
 * events (STATUS_TRANSITION, RESOLVE_RFI, …) carry these ids rather than a
 * roster id. We alias both to the storyboard signed-in caseworker, Sarah
 * Mitchell (DEFAULT_CASEWORKER), so those events render as a named caseworker
 * instead of the generic "A caseworker". These are synthetic seed UUIDs, not
 * PII — they identify a shared demo login, not a real person.
 */
const SEEDED_IDENTITY_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ['b2c3d4e5-2001-4000-8000-000000000001', DEFAULT_CASEWORKER.name],
  ['b2c3d4e5-2002-4000-8000-000000000002', DEFAULT_CASEWORKER.name],
];

const ROSTER_BY_KEY: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const m of TEAM_ROSTER) {
    map.set(m.id.toLowerCase(), m.name);
    map.set(m.email.toLowerCase(), m.name);
    map.set(m.name.toLowerCase(), m.name);
  }
  for (const [uuid, name] of SEEDED_IDENTITY_ALIASES) {
    map.set(uuid.toLowerCase(), name);
  }
  return map;
})();

function isSystemActorId(actorId: string | null | undefined): boolean {
  return !actorId || actorId.trim().toLowerCase() === 'system';
}

function rosterNameFor(actorId: string | null | undefined): string | undefined {
  if (!actorId) return undefined;
  return ROSTER_BY_KEY.get(actorId.trim().toLowerCase());
}

/**
 * Resolve an opaque `actorId` to a human-readable actor name. Matches the team
 * roster (and the seeded-login UUID aliases) by id, email, or full name. Falls
 * back to "System" for the system actor and a generic, non-identifying label
 * for unmatched ids — the raw id is still available in the row's actor tooltip,
 * so we never need to leak it into sentence text.
 *
 * This stays a pure actorId-only resolver for backward compatibility (it is
 * tested directly and used wherever only the id is in hand). The action-aware
 * classification — System-vs-applicant heuristics, `actorType` — lives in
 * `resolveActorDisplay`, which builds on top of this.
 */
export function resolveActorName(actorId: string | null | undefined): string {
  if (isSystemActorId(actorId)) return SYSTEM_ACTOR;
  return rosterNameFor(actorId) ?? GENERIC_CASEWORKER;
}

/**
 * Closed `metadata.actorType` enum (ENG-1988 ST-2). Anything else is ignored.
 * Keep in sync with the backend source of truth — `AuditActorType` in
 * services/medicaid-ee-service/src/services/case.service.ts. A new backend
 * member missing here silently falls through to the legacy heuristic.
 */
const VALID_ACTOR_TYPES: ReadonlySet<string> = new Set(['SYSTEM', 'CASEWORKER', 'APPLICANT']);

/**
 * Actions that are inherently machine-driven in the demo pipeline, used by the
 * legacy heuristic when no (or an invalid) `actorType` is present. The BRE runs
 * these at submission/handshake time even though the carried `actorId` is the
 * applicant's personId. `CREATE` is conditionally machine-driven — only for a
 * `MedicaidEeDetermination` resource — so it is handled separately, not here.
 */
const MACHINE_ACTIONS: ReadonlySet<string> = new Set([
  'EVALUATE',
  'REEVALUATE',
  'RECEIVE_VERIFICATION',
  'REQUEST_VERIFICATION',
]);

const SYSTEM_ACTOR = 'System';
const GENERIC_CASEWORKER = 'A caseworker';
const GENERIC_APPLICANT = 'Applicant';

/**
 * Resolved actor for both the sentence presenter and the activity-row chip, so
 * the two layers cannot drift (C.2 duplicate-derivation guard).
 */
export interface ActorDisplay {
  /** Human-readable actor name: a real name, "System", "A caseworker", or the applicant. */
  name: string;
  /** True when the actor is the platform/system rather than a person. */
  isSystem: boolean;
  /** True when the actor is the applicant who submitted the case (case-level CREATE). */
  isApplicant: boolean;
}

/**
 * Action-aware actor resolution with a STRICT precedence (ENG-1988 ST-2). Each
 * step short-circuits; a higher step can never be downgraded by a lower one:
 *
 *   a. `actorId === 'system'` (case-insensitive, trimmed) → "System".
 *   b. roster / seeded-alias match → the real name (a roster hit is final).
 *   c. valid `metadata.actorType`: SYSTEM → "System"; APPLICANT → applicant
 *      framing; CASEWORKER → generic "A caseworker" (no roster identity matched).
 *   d. legacy heuristic (no / invalid actorType): inherently-machine actions
 *      (EVALUATE, REEVALUATE, RECEIVE/REQUEST_VERIFICATION, and a determination
 *      CREATE) → "System".
 *   e. case-level CREATE (`MedicaidEeCase`) with a non-roster actor → applicant.
 *   f. everything else → generic "A caseworker".
 *
 * Invalid / unknown `actorType` values are ignored (fall through to the
 * heuristic) and never throw.
 */
export function resolveActorDisplay(input: AuditSummaryInput, ctx: AuditSummaryContext = {}): ActorDisplay {
  const { actorId, action, resourceType, metadata } = input;

  // a. Explicit system actor — highest precedence.
  if (isSystemActorId(actorId)) return { name: SYSTEM_ACTOR, isSystem: true, isApplicant: false };

  // b. Roster / seeded-alias identity — a named person always wins from here down.
  const rosterName = rosterNameFor(actorId);
  if (rosterName) return { name: rosterName, isSystem: false, isApplicant: false };

  // c. Structured actorType, when present and valid.
  const actorType = str(metadata, 'actorType');
  if (actorType && VALID_ACTOR_TYPES.has(actorType)) {
    if (actorType === 'SYSTEM') return { name: SYSTEM_ACTOR, isSystem: true, isApplicant: false };
    if (actorType === 'APPLICANT') return applicantDisplay(ctx);
    // CASEWORKER: a caseworker acted but no roster identity matched the id.
    return { name: GENERIC_CASEWORKER, isSystem: false, isApplicant: false };
  }

  // d. Legacy heuristic — inherently-machine actions render as the system.
  const isDeterminationCreate = action === 'CREATE' && resourceType === 'MedicaidEeDetermination';
  if (MACHINE_ACTIONS.has(action) || isDeterminationCreate) {
    return { name: SYSTEM_ACTOR, isSystem: true, isApplicant: false };
  }

  // e. Case-level CREATE is the applicant's submission.
  if (action === 'CREATE' && resourceType === 'MedicaidEeCase') return applicantDisplay(ctx);

  // f. Fallback.
  return { name: GENERIC_CASEWORKER, isSystem: false, isApplicant: false };
}

function applicantDisplay(ctx: AuditSummaryContext): ActorDisplay {
  const name = ctx.applicantName?.trim();
  return { name: name && name.length > 0 ? name : GENERIC_APPLICANT, isSystem: false, isApplicant: true };
}

// --- Formatting helpers ---

/** Title-case a SCREAMING_SNAKE or spaced value: `PENDING_REVIEW` → `Pending Review`. */
function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Program/coverage labels keep their canonical casing (acronyms, MAGI). */
function formatProgramLabel(value: string): string {
  const upper = value.toUpperCase();
  if (upper === 'MAGI') return 'MAGI';
  if (upper === 'NON_MAGI' || upper === 'NON-MAGI') return 'Non-MAGI';
  if (upper === 'UNKNOWN') return '';
  return titleCase(value);
}

/**
 * Verification-source label (ENG-1988). Keeps agency acronyms uppercase and
 * expands the residency stub to a readable name. Unknown codes title-case.
 */
function formatServiceLabel(value: string): string {
  const upper = value.toUpperCase();
  if (upper === 'SSA' || upper === 'IRS' || upper === 'AVS') return upper;
  if (upper === 'RESIDENCY') return 'Residency Service';
  return titleCase(value);
}

/**
 * Verification-type label (ENG-1988). Preserves SSN/SSDI acronyms; everything
 * else reads as lower-case prose ("income", "assets", "residency").
 */
function formatVerificationType(value: string): string {
  const upper = value.toUpperCase();
  if (upper === 'SSN') return 'SSN';
  if (upper === 'SSDI_INCOME') return 'SSDI income';
  if (upper === 'INCOME') return 'income';
  if (upper === 'ASSETS') return 'assets';
  if (upper === 'RESIDENCY') return 'residency';
  // Fallback for unmapped codes: lower-case prose with underscores → spaces, so
  // it reads cleanly mid-sentence ("verified unemployment income"). Title-casing
  // here would capitalize mid-sentence; service labels title-case because they
  // are standalone agency nouns, not embedded prose.
  return value.toLowerCase().replace(/_/g, ' ');
}

const DEADLINE_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatDeadline(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return DEADLINE_FMT.format(d);
}

/** `itemsRequested` is emitted as a single pipe-delimited string. */
function splitItems(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Read a string metadata value only if present and non-empty. */
function str(metadata: AuditMetadata, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Read a numeric metadata value only if it is actually a number. */
function num(metadata: AuditMetadata, key: string): number | undefined {
  const value = metadata?.[key];
  return typeof value === 'number' ? value : undefined;
}

/**
 * Build the action-specific sentence, or return `null` for an unmapped action
 * so the caller can fall back to the raw action code. Reads only allowlisted
 * metadata keys (see PHI policy in the file header).
 */
function coreSentence(input: AuditSummaryInput, ctx: AuditSummaryContext): string | null {
  const { action, resourceType, metadata } = input;
  const display = resolveActorDisplay(input, ctx);
  const actor = display.name;

  switch (action) {
    case 'CREATE': {
      if (resourceType === 'MedicaidEeDetermination') {
        const category = str(metadata, 'category');
        const detStatus = str(metadata, 'determinationStatus');
        const categoryLabel = category ? formatProgramLabel(category) : '';
        const prefix = categoryLabel
          ? `${actor} recorded a ${categoryLabel} determination`
          : `${actor} recorded a determination`;
        return detStatus ? `${prefix}: ${titleCase(detStatus)}` : prefix;
      }
      // Case-level CREATE: when the actor is the applicant (their submission
      // spawned the case), frame it as the application being submitted rather
      // than a caseworker "creating" it. A roster caseworker who manually
      // created the case keeps the caseworker-actor phrasing.
      if (display.isApplicant) {
        return ctx.applicantName
          ? `Application submitted by ${actor} — case created`
          : 'Application submitted — case created';
      }
      return ctx.applicantName ? `${actor} created the case for ${ctx.applicantName}` : `${actor} created the case`;
    }

    case 'UPDATE':
      return `${actor} updated the case`;

    case 'STATUS_TRANSITION': {
      const from = str(metadata, 'fromStatus');
      const to = str(metadata, 'toStatus');
      if (from && to) return `${actor} changed case status from ${titleCase(from)} to ${titleCase(to)}`;
      if (to) return `${actor} changed case status to ${titleCase(to)}`;
      return `${actor} changed case status`;
    }

    case 'CREATE_LINKED_CASE':
      return `${actor} created a linked case`;

    // Verify Assist (CLEAR) out-of-state coverage flag worked from Case Assist.
    // Metadata: fromStatus/toStatus (open | in_review | resolved | dismissed),
    // assignee, noteAdded — no PHI.
    case 'VERIFY_ASSIST_FLAG_UPDATED': {
      const to = str(metadata, 'toStatus');
      const from = str(metadata, 'fromStatus');
      const noteAdded = metadata?.noteAdded === true;
      let sentence: string;
      if (to === 'in_review') sentence = `${actor} marked the Verify Assist flag in review`;
      else if (to === 'resolved') sentence = `${actor} resolved the Verify Assist flag`;
      else if (to === 'dismissed') sentence = `${actor} dismissed the Verify Assist flag`;
      else if (to && from) sentence = `${actor} changed the Verify Assist flag from ${titleCase(from)} to ${titleCase(to)}`;
      else sentence = `${actor} updated the Verify Assist flag`;
      return noteAdded ? `${sentence} and added a note` : sentence;
    }

    case 'ISSUE_RFI': {
      const items = splitItems(str(metadata, 'itemsRequested'));
      const count = num(metadata, 'itemsRequestedCount');
      const deadline = formatDeadline(str(metadata, 'deadline'));
      const itemsPhrase =
        items.length > 0
          ? items.join(', ')
          : count !== undefined
            ? `${count} item${count === 1 ? '' : 's'}`
            : 'requested items';
      return deadline
        ? `${actor} issued an RFI: ${itemsPhrase}, due ${deadline}`
        : `${actor} issued an RFI: ${itemsPhrase}`;
    }

    case 'RESOLVE_RFI':
      return `${actor} resolved the RFI`;

    case 'EVALUATE': {
      const outcome = str(metadata, 'breOutcome');
      const coverage = str(metadata, 'coverageType');
      const coverageLabel = coverage ? formatProgramLabel(coverage) : '';
      const base = outcome
        ? `${actor} ran eligibility evaluation: ${titleCase(outcome)}`
        : `${actor} ran eligibility evaluation`;
      return coverageLabel ? `${base} (${coverageLabel})` : base;
    }

    case 'REEVALUATE': {
      // Intentional deviation from the ticket's draft table ("Eligibility
      // re-evaluation failed"): failure is rendered uniformly via
      // buildAuditSummary's " (failed)" suffix, so this stays actor-prefixed
      // and consistent with every other action rather than dropping the actor.
      const outcome = str(metadata, 'breOutcome');
      return outcome ? `${actor} re-ran eligibility: ${titleCase(outcome)}` : `${actor} re-ran eligibility`;
    }

    // --- ENG-1988: verification-source handshake + DDS workflow events ---

    case 'REQUEST_VERIFICATION': {
      const service = str(metadata, 'service');
      const type = str(metadata, 'verificationType');
      const serviceLabel = service ? formatServiceLabel(service) : 'a verification source';
      return type
        ? `${actor} requested ${serviceLabel} verification: ${formatVerificationType(type)}`
        : `${actor} requested ${serviceLabel} verification`;
    }

    case 'RECEIVE_VERIFICATION': {
      // Source-framed by design — the sentence names the verification source
      // ("IRS verified income"), not the actor. `actor` is deliberately unused
      // here; the chip layer still attributes the row via resolveActorDisplay.
      const service = str(metadata, 'service');
      const type = str(metadata, 'verificationType');
      const result = str(metadata, 'result');
      const serviceLabel = service ? formatServiceLabel(service) : 'A verification source';
      const typeLabel = type ? formatVerificationType(type) : 'the requested item';
      if (result === 'RFI_REQUIRED') {
        return `${serviceLabel} flagged ${typeLabel} — documentation requested`;
      }
      return `${serviceLabel} verified ${typeLabel}`;
    }

    case 'REFER_DDS':
      return `${actor} referred the case to Disability Determination Services`;

    case 'CONFIRM_DDS':
      return `${actor} recorded the DDS disability determination`;

    default:
      // Unmapped action — fall back to the raw code (prior behavior). MUST NOT throw.
      return null;
  }
}

/**
 * Top-level entry point: produce the human-readable activity sentence for an
 * audit event. Unmapped actions fall through to the raw `action` string
 * unchanged. Failure outcomes get a " (failed)" suffix on mapped sentences.
 */
export function buildAuditSummary(input: AuditSummaryInput, ctx: AuditSummaryContext = {}): string {
  const core = coreSentence(input, ctx);
  if (core === null) return input.action;
  return input.outcome === 'failure' ? `${core} (failed)` : core;
}
