/**
 * audit-operations — ENG-1667 ST-1
 *
 * GraphQL query document + display adapters for the medicaid-ee
 * `auditLog(filter, pagination)` feed. Used by the Case Details drawer's
 * Activity Log tab to render real audit events for a single case, scoped
 * via `filter.resourceId = caseId` (ENG-1666: determination events also
 * carry `resourceId = caseId` so one filter surfaces both).
 *
 * Security:
 *   - `resourceId` is truncated for display; full value is exposed only via
 *     `title` tooltip. No clipboard copy in v1.
 *   - `actorId` is NEVER shown directly. The display chip uses the resolved
 *     actor name ("Sarah Mitchell" / "System" / the applicant / "A caseworker")
 *     from `resolveActorDisplay` (audit-presenter.ts) — the same resolution the
 *     summary sentence uses, so chip and sentence cannot drift (ENG-1988 ST-2).
 *     The raw `actorId` survives only in the `actorTooltip` for audit fidelity.
 *   - `metadata` IS now selected (ENG-1925) so rows can render human-readable
 *     sentences, but it is NEVER projected raw onto the row shape. It is read
 *     transiently by `buildAuditSummary` (audit-presenter.ts), which enforces a
 *     structured-key allowlist and never emits free-form operator text
 *     (`reason`, `noteToApplicant`, `resolution`). Only the formatted `summary`
 *     string persists on `ActivityRow`.
 *   - No error-object fields ever flow into UI text; the tab uses static
 *     copy on failure.
 */

import { gql } from '@apollo/client';
import type { TypedDocumentNode } from '@apollo/client';
import { buildAuditSummary, resolveActorDisplay, type AuditMetadata } from './audit-presenter';

export type AuditOutcome = 'success' | 'failure';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  serviceId: string;
  eventType: string;
  actorId: string;
  customerId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: AuditOutcome;
  traceId: string | null;
  // `metadata` is the JSON scalar from the server. As of ENG-1925 it IS
  // selected, but only so the sentence presenter (audit-presenter.ts) can read
  // a structured-key allowlist. It is never projected raw onto ActivityRow and
  // free-form keys (reason / noteToApplicant / resolution) are never rendered —
  // the presenter is the enforcement point.
  metadata?: AuditMetadata;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  totalCount: number;
  hasNextPage: boolean;
}

export interface AuditLogFilter {
  startDate: string;
  endDate: string;
  eventType?: string | null;
  actorId?: string | null;
  action?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  outcome?: AuditOutcome | null;
}

export const GET_CASE_AUDIT_LOG: TypedDocumentNode<
  { medicaidAuditLog: AuditLogPage },
  { filter: AuditLogFilter; pagination?: { page?: number; limit?: number } }
> = gql`
  query GetCaseAuditLog($filter: AuditLogFilter!, $pagination: PaginationInput) {
    medicaidAuditLog(filter: $filter, pagination: $pagination) {
      entries {
        id
        timestamp
        serviceId
        eventType
        actorId
        customerId
        action
        resourceType
        resourceId
        outcome
        traceId
        # metadata selected for the sentence presenter only (ENG-1925); the
        # presenter enforces a structured-key allowlist — see AuditLogEntry doc.
        metadata
      }
      totalCount
      hasNextPage
    }
  }
`;

/**
 * Default 31-day window for a case timeline.
 *
 * Server requires `startDate` inclusive and `endDate` exclusive, with span
 * ≤ 31 days. We use tomorrow's 00:00:00 UTC as the exclusive end so today's
 * events are included, and (today − 30 days) at 00:00:00 UTC as the start.
 * Total span is 31 days, the server cap.
 */
export function buildDefaultAuditFilter(caseId: string): AuditLogFilter {
  const now = new Date();
  const startUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 30));
  const endUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return {
    startDate: startUtc.toISOString(),
    endDate: endUtc.toISOString(),
    resourceId: caseId,
  };
}

/**
 * Row shape consumed by the Cards / Timeline views in ActivityLogTab.
 * Pre-formatted strings only; the UI never sees raw API fields.
 */
export interface ActivityRow {
  /** Stable React key (= entry.id from the API). */
  key: string;
  /**
   * ISO-8601 timestamp used ONLY for chronological merge-sorting (ENG-2080:
   * curated persona narrative rows are interleaved with API rows, so ordering
   * happens at the row level after both sources are mapped). Display always
   * goes through `displayDate` / `compactDate` — never render this directly.
   */
  sortTimestamp: string;
  /** "05/19/2026 11:02 AM" — used in Cards view. */
  displayDate: string;
  /** "05/19 11:02 AM" — compact form for Timeline column. */
  compactDate: string;
  /**
   * Resolved actor name for display (ENG-1988 ST-2): a roster name ("Sarah
   * Mitchell"), "System", the applicant's name, or generic "A caseworker" —
   * never the raw actorId. Mirrors the summary sentence's actor.
   */
  actorDisplay: string;
  /** Full actorId — used only in `title="…"` tooltip (audit fidelity). */
  actorTooltip: string;
  /** Two-char avatar text derived from the resolved actor name. */
  initials: string;
  /**
   * Human-readable sentence describing the event (ENG-1925), e.g. "Sarah
   * Mitchell changed case status from Pending Review to Approved". Built from a
   * structured-key allowlist of `metadata`; falls back to the raw `action` code
   * for unmapped actions.
   */
  summary: string;
  action: string;
  resourceType: string;
  /** Truncated resourceId (≤ 12 chars + ellipsis). */
  resourceIdDisplay: string;
  /** Full resourceId — used only in `title="…"` tooltip. */
  resourceIdTooltip: string;
  eventType: string;
  outcome: AuditOutcome;
  /**
   * Optional badge text that replaces the Success/Failure outcome pill
   * (e.g. "Auto" for the hardcoded ex-parte narrative rows — ENG-2037).
   * `outcome` still drives the outcome filter.
   */
  badgeLabel?: string;
  /**
   * Optional bullet-list body rendered in place of the resourceType /
   * resourceId line. Used by the hardcoded ex-parte rows (ENG-2037);
   * API-derived rows never set this.
   */
  noteLines?: readonly string[];
}

// Intl formatters — built once. Both pinned to UTC so the demo is
// deterministic regardless of where the browser thinks it is.
const FULL_DATE_FMT = new Intl.DateTimeFormat('en-US', {
  month: '2-digit',
  day: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'UTC',
});

const COMPACT_DATE_FMT = new Intl.DateTimeFormat('en-US', {
  month: '2-digit',
  day: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'UTC',
});

/**
 * Shared by the curated persona-narrative fixtures (ENG-2080) so merged rows
 * format identically to API-derived rows.
 */
export function formatFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Intl on en-US renders "05/19/2026, 11:02 AM" — drop the comma to
  // match the existing fixture-era format ("05/19/2026 11:02 AM").
  return FULL_DATE_FMT.format(d).replace(', ', ' ');
}

/** See formatFull — exported for the curated persona-narrative fixtures. */
export function formatCompact(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return COMPACT_DATE_FMT.format(d).replace(', ', ' ');
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

/**
 * Two-char avatar initials from a resolved actor *name* (not the raw id). Uses
 * the first letter of the first two words ("Sarah Mitchell" → "SM", "A
 * caseworker" → "AC", "System" → "SY", "Applicant" → "AP"). Falls back to the
 * first two characters for a single short token.
 */
function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return '??';
}

/**
 * Optional display context for a row. `applicantName` comes from the drawer's
 * `caseRow` and is used to name the subject of case-level CREATE events (which
 * carry no metadata of their own).
 */
export interface ActivityRowContext {
  applicantName?: string | null;
}

/**
 * Adapt a single API entry to its display row. All formatting / truncation
 * lives here so the view stays pure mapping. `metadata` is read transiently to
 * build the human-readable `summary` (allowlist enforced in audit-presenter.ts)
 * but is never copied onto the row.
 */
export function auditEntryToActivityRow(entry: AuditLogEntry, ctx: ActivityRowContext = {}): ActivityRow {
  // Both the chip (actorDisplay/initials) and the sentence (buildAuditSummary,
  // which calls resolveActorDisplay internally) resolve the actor from this
  // identical input, so they cannot disagree — function purity is the
  // guarantee, not a single shared resolved value (ENG-1988 ST-2).
  const summaryInput = {
    action: entry.action,
    resourceType: entry.resourceType,
    outcome: entry.outcome,
    actorId: entry.actorId,
    metadata: entry.metadata,
  };
  const actor = resolveActorDisplay(summaryInput, { applicantName: ctx.applicantName });
  return {
    key: entry.id,
    sortTimestamp: entry.timestamp,
    displayDate: formatFull(entry.timestamp),
    compactDate: formatCompact(entry.timestamp),
    actorDisplay: actor.name,
    // Raw actorId survives only in the tooltip — full audit fidelity, never
    // surfaced in the visible chip or the sentence text.
    actorTooltip: entry.actorId,
    initials: initialsFromName(actor.name),
    summary: buildAuditSummary(summaryInput, { applicantName: ctx.applicantName }),
    action: entry.action,
    resourceType: entry.resourceType,
    resourceIdDisplay: truncate(entry.resourceId, 12),
    resourceIdTooltip: entry.resourceId,
    eventType: entry.eventType,
    outcome: entry.outcome,
  };
}

/**
 * Reverse-chronological sort. The S3-backed reader does not guarantee
 * order across partitions, so we sort client-side. Lexicographic ISO-8601
 * compare is equivalent to a chronological compare and avoids `Date`
 * allocation in the hot path.
 *
 * Sort is stable (Array.prototype.sort is spec-stable since ES2019), so
 * entries with identical timestamps preserve API order.
 */
export function sortByTimestampDesc(entries: AuditLogEntry[]): AuditLogEntry[] {
  return [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Reverse-chronological sort at the ROW level (ENG-2080). Used when curated
 * persona-narrative rows are merged with API-derived rows — both carry an
 * ISO-8601 `sortTimestamp`, so the lexicographic compare is chronological.
 * Stable, so equal-timestamp rows keep their relative insertion order.
 */
export function sortRowsByTimestampDesc(rows: ReadonlyArray<ActivityRow>): ActivityRow[] {
  return [...rows].sort((a, b) => b.sortTimestamp.localeCompare(a.sortTimestamp));
}

/**
 * Case-insensitive substring match for the in-tab search input. Scans the
 * human-readable `summary`, plus `action`, `resourceType`, `actorTooltip`
 * (full actorId), and `eventType` — the fields a caseworker is most likely to
 * recognize from a transcript. Empty query matches everything. Search is
 * scoped to the current page only; the consuming UI sets expectations via its
 * placeholder copy.
 */
export function matchesSearch(row: ActivityRow, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return (
    row.summary.toLowerCase().includes(needle) ||
    row.action.toLowerCase().includes(needle) ||
    row.resourceType.toLowerCase().includes(needle) ||
    row.actorTooltip.toLowerCase().includes(needle) ||
    row.eventType.toLowerCase().includes(needle) ||
    (row.noteLines ?? []).some((line) => line.toLowerCase().includes(needle))
  );
}
