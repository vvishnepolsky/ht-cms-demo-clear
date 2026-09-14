/**
 * ActivityLogTab — ENG-1667 ST-1.
 *
 * Renders the Case Details drawer's Activity Log tab against the real
 * medicaid-ee `auditLog(filter, pagination)` GraphQL query. Replaces the
 * fixture-backed scaffold from ENG-1708.
 *
 * Layout:
 *   - Controls row: search (client-side substring) + outcome filter
 *     (All / Success / Failure → tri-state, server-supported) + view toggle
 *     (Cards / Timeline)
 *   - Disclaimer + event count
 *   - Cards or Timeline view
 *
 * Pagination is page-based (prev/next), 25 per page, matching the Missouri
 * AuditLogPage reference (apps/missouri/admin/src/pages/AuditLogPage.tsx).
 * Page-based avoids cross-page id-collision dedup and needs no Apollo
 * typePolicy.
 *
 * Security (see ENG-1667 security brief):
 *   - No `console.log` / `console.error` of response or error data.
 *   - No URL state for identifier filters (this tab adds no URL state).
 *   - Error UI uses static strings only — `error.message` is never rendered.
 *   - Raw `metadata` is never rendered; only the allowlist-derived `summary`
 *     sentence from audit-presenter.ts reaches the UI (ENG-1925).
 *   - Identifiers are truncated for display; full value is in `title` only.
 *
 * No `useEffect` — Apollo's `useQuery` handles the data side, pagination is
 * handler-driven.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import {
  GET_CASE_AUDIT_LOG,
  buildDefaultAuditFilter,
  auditEntryToActivityRow,
  sortRowsByTimestampDesc,
  matchesSearch,
  type ActivityRow,
  type AuditOutcome,
} from '../../../../lib/audit-operations';
import { EX_PARTE_AUDIT_ROWS, isExParteAuditMockCase } from '../../../../data/exParteAuditLog';
import { buildPersonaNarrativeRows, matchNarrativePersona } from '../../../../data/personaAuditNarratives';
import { noteSplitLabel } from '../../../ui/note-bullets';
import type { DrawerTabProps } from '../types';

type OutcomeFilter = 'all' | AuditOutcome;
type ViewMode = 'cards' | 'timeline';

const PAGE_SIZE = 25;

const OUTCOME_FILTERS: ReadonlyArray<{ value: OutcomeFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'success', label: 'Success' },
  { value: 'failure', label: 'Failure' },
];

const VIEW_MODES: ReadonlyArray<{ value: ViewMode; label: string }> = [
  { value: 'cards', label: 'Cards' },
  { value: 'timeline', label: 'Timeline' },
];

export function ActivityLogTab({ caseRow }: DrawerTabProps) {
  const [search, setSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [view, setView] = useState<ViewMode>('cards');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [page, setPage] = useState(1);

  // Memoized so the Apollo `variables` object identity is stable across
  // renders that don't change `caseRow.id`. Apollo's variable equality check
  // already absorbs new object refs, but this matches the Missouri reference
  // (AuditLogPage.tsx) and avoids any future refetch-on-rerender surprises.
  const baseFilter = useMemo(() => buildDefaultAuditFilter(caseRow.id), [caseRow.id]);

  const { data, loading, error, refetch } = useQuery(GET_CASE_AUDIT_LOG, {
    variables: {
      filter: {
        ...baseFilter,
        outcome: outcomeFilter === 'all' ? null : outcomeFilter,
      },
      pagination: { page, limit: PAGE_SIZE },
    },
    // errorPolicy 'all' lets us show partial results alongside any
    // GraphQL-level errors. We do NOT render the error itself — only a
    // static "failed to load" string — but partial data on a federated
    // field failure is still useful in the demo.
    errorPolicy: 'all',
    fetchPolicy: 'cache-and-network',
  });

  const entries = useMemo(() => data?.medicaidAuditLog.entries ?? [], [data]);

  // ENG-2037 / ENG-2080: demo-archetype cases interleave a curated narrative
  // with the real audit feed (merged, not swapped — live caseworker actions
  // keep rendering in their true timeline position):
  //   - Diane Caldwell (ex-parte renewal): fixed rows on the frozen renewal
  //     arc, agreeing with the Verify tab + A-5170 dates on the same screen.
  //   - Jasmine Carter / Robert Mitchell (live submissions): verification
  //     handshake rows anchored to the case's real event timestamps.
  // Curated rows are only merged on page 1 — demo cases never paginate.
  const curatedRows = useMemo<ReadonlyArray<ActivityRow>>(() => {
    if (page !== 1) return [];
    if (isExParteAuditMockCase(caseRow.applicantName)) return EX_PARTE_AUDIT_ROWS;
    const persona = matchNarrativePersona(caseRow.applicantName);
    if (persona) {
      // eslint-disable-next-line ht/no-wallclock-in-demo -- live-submission personas are real-time, not storyboard data: this is only the fallback anchor while the S3 feed lags a fresh submission; rows re-anchor to real event timestamps once the feed lands. Frozen DEMO_TODAY (March) would be actively wrong here.
      return buildPersonaNarrativeRows(persona, entries, Date.now());
    }
    return [];
  }, [page, caseRow.applicantName, entries]);

  // The server applies the outcome filter to real entries; curated rows are
  // filtered client-side to match.
  const visibleCurated = curatedRows.filter((row) => outcomeFilter === 'all' || row.outcome === outcomeFilter);

  const totalCount = (data?.medicaidAuditLog.totalCount ?? 0) + visibleCurated.length;
  const hasNextPage = data?.medicaidAuditLog.hasNextPage ?? false;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const rows = sortRowsByTimestampDesc([
    ...entries.map((entry) => auditEntryToActivityRow(entry, { applicantName: caseRow.applicantName })),
    ...visibleCurated,
  ]).filter((row) => matchesSearch(row, search));

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Handler-driven page reset on outcome-filter change (no useEffect).
  const handleOutcomeChange = (value: OutcomeFilter) => {
    setOutcomeFilter(value);
    setPage(1);
  };

  const canPrev = page > 1;
  // Trust the server's hasNextPage as the single source of truth — totalCount
  // could become an estimate in the future. Match the Missouri reference.
  const canNext = hasNextPage;

  return (
    <>
      {/* Controls row: search + outcome filter + view toggle */}
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search this page…"
            aria-label="Search activity entries on this page"
            className="text-sm border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 w-48"
            style={{
              backgroundColor: 'var(--civic-bg-card)',
              borderColor: 'var(--civic-border-subtle)',
              color: 'var(--civic-text-primary)',
            }}
          />
          <div role="group" aria-label="Filter by outcome" className="flex gap-1.5">
            {OUTCOME_FILTERS.map(({ value, label }) => {
              const isActive = outcomeFilter === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => handleOutcomeChange(value)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors"
                  style={
                    isActive
                      ? {
                          color: 'var(--civic-accent-on-solid)',
                          backgroundColor: 'var(--civic-accent-solid)',
                          borderColor: 'transparent',
                        }
                      : {
                          backgroundColor: 'var(--civic-bg-card)',
                          borderColor: 'var(--civic-border-subtle)',
                          color: 'var(--civic-text-secondary)',
                        }
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
          <div
            role="group"
            aria-label="View mode"
            className="flex items-center border rounded-md p-0.5"
            style={{
              backgroundColor: 'var(--civic-bg-component)',
              borderColor: 'var(--civic-border-subtle)',
            }}
          >
            {VIEW_MODES.map(({ value, label }) => {
              const isActive = view === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setView(value)}
                  className="px-3 py-1 rounded text-xs font-medium transition-colors"
                  style={
                    isActive
                      ? {
                          backgroundColor: 'var(--civic-bg-card)',
                          color: 'var(--civic-text-primary)',
                        }
                      : { color: 'var(--civic-text-secondary)' }
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Disclaimer + event count */}
      <p className="text-xs mb-4" style={{ color: 'var(--civic-text-placeholder)' }}>
        Showing last 31 days of activity for this case. {totalCount} {totalCount === 1 ? 'event' : 'events'}
        {loading ? ' (loading…)' : ''}.
      </p>

      {/* Curated narrative rows render even when the feed errors (rows.length
          check) — an audit-feed hiccup must not blank a demo-archetype tab. */}
      {error && !data && rows.length === 0 ? (
        <ErrorState onRetry={() => refetch()} />
      ) : loading && rows.length === 0 ? (
        <LoadingSkeleton />
      ) : view === 'cards' ? (
        <CardsView rows={rows} />
      ) : (
        <TimelineView rows={rows} expanded={expanded} onToggle={toggleExpanded} />
      )}

      {/* Pagination — only shown when there's more than one page. */}
      {totalPages > 1 && (
        <div
          className="flex items-center justify-between mt-4 text-xs"
          style={{ color: 'var(--civic-text-secondary)' }}
        >
          <span>
            Page {page} of {totalPages} ({totalCount} total)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!canPrev}
              className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors"
              style={{
                backgroundColor: 'var(--civic-bg-card)',
                borderColor: 'var(--civic-border-subtle)',
                color: 'var(--civic-text-secondary)',
                opacity: canPrev ? 1 : 0.5,
                cursor: canPrev ? 'pointer' : 'not-allowed',
              }}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!canNext}
              className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors"
              style={{
                backgroundColor: 'var(--civic-bg-card)',
                borderColor: 'var(--civic-border-subtle)',
                color: 'var(--civic-text-secondary)',
                opacity: canNext ? 1 : 0.5,
                cursor: canNext ? 'pointer' : 'not-allowed',
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
}

interface CardsViewProps {
  rows: ReadonlyArray<ActivityRow>;
}

function CardsView({ rows }: CardsViewProps) {
  if (rows.length === 0) {
    return <EmptyState />;
  }
  return (
    <ul className="space-y-4 list-none p-0 m-0">
      {rows.map((row) => (
        <li
          key={row.key}
          className="rounded-md border p-5"
          style={{
            backgroundColor: 'var(--civic-bg-card)',
            borderColor: 'var(--civic-border-subtle)',
          }}
        >
          <div className="flex items-start gap-4">
            <div
              aria-hidden="true"
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
              style={{
                backgroundColor: 'var(--civic-bg-component)',
                color: 'var(--civic-text-secondary)',
              }}
            >
              {row.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-0.5">
                <p className="text-sm font-semibold" style={{ color: 'var(--civic-text-primary)' }}>
                  {row.summary}
                </p>
                {row.badgeLabel ? <CustomBadge label={row.badgeLabel} /> : <OutcomeBadge outcome={row.outcome} />}
              </div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs" style={{ color: 'var(--civic-text-placeholder)' }}>
                  {row.displayDate}
                </span>
                <span style={{ color: 'var(--civic-text-placeholder)' }} aria-hidden="true">
                  ·
                </span>
                <span className="text-xs" style={{ color: 'var(--civic-text-secondary)' }} title={row.actorTooltip}>
                  {row.actorDisplay}
                </span>
                {row.eventType && (
                  <>
                    <span style={{ color: 'var(--civic-text-placeholder)' }} aria-hidden="true">
                      ·
                    </span>
                    <span className="text-xs" style={{ color: 'var(--civic-text-placeholder)' }}>
                      {row.eventType}
                    </span>
                  </>
                )}
              </div>
              {row.noteLines ? (
                <NoteBullets lines={row.noteLines} />
              ) : (
                <p className="text-sm leading-relaxed" style={{ color: 'var(--civic-text-secondary)' }}>
                  <span style={{ color: 'var(--civic-text-placeholder)' }}>{row.resourceType}: </span>
                  <span title={row.resourceIdTooltip} className="font-mono">
                    {row.resourceIdDisplay}
                  </span>
                </p>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

interface TimelineViewProps {
  rows: ReadonlyArray<ActivityRow>;
  expanded: ReadonlySet<string>;
  onToggle: (key: string) => void;
}

function TimelineView({ rows, expanded, onToggle }: TimelineViewProps) {
  if (rows.length === 0) {
    return <EmptyState />;
  }
  return (
    <div
      className="rounded-md border overflow-hidden"
      style={{
        backgroundColor: 'var(--civic-bg-card)',
        borderColor: 'var(--civic-border-subtle)',
      }}
    >
      {rows.map((row) => {
        const isExpanded = expanded.has(row.key);
        const panelId = `timeline-panel-${row.key}`;
        return (
          <div key={row.key} className="border-b last:border-0" style={{ borderColor: 'var(--civic-border-subtle)' }}>
            <button
              type="button"
              onClick={() => onToggle(row.key)}
              aria-expanded={isExpanded}
              aria-controls={panelId}
              className="w-full text-left px-4 py-2 flex items-center gap-3 transition-colors text-xs"
              style={{ color: 'var(--civic-text-primary)' }}
            >
              <span className="font-mono w-28 flex-shrink-0" style={{ color: 'var(--civic-text-placeholder)' }}>
                {row.compactDate}
              </span>
              {row.badgeLabel ? (
                <CustomBadge label={row.badgeLabel} compact />
              ) : (
                <OutcomeBadge outcome={row.outcome} compact />
              )}
              <span className="font-medium flex-1 truncate">{row.summary}</span>
              <span aria-hidden="true" style={{ color: 'var(--civic-text-placeholder)' }} className="flex-shrink-0">
                {isExpanded ? '▾' : '▸'}
              </span>
            </button>
            {/* Panel stays mounted and is toggled with `hidden` so the button's
                aria-controls always resolves to an existing element (APG
                disclosure pattern). */}
            <div
              id={panelId}
              hidden={!isExpanded}
              className="px-4 pb-3"
              style={{ paddingLeft: 'calc(1rem + 7rem + 6rem + 0.75rem)' }}
            >
              <p className="text-xs mb-1" style={{ color: 'var(--civic-text-placeholder)' }} title={row.actorTooltip}>
                Actor: {row.actorDisplay}
              </p>
              {row.noteLines ? (
                <NoteBullets lines={row.noteLines} size="xs" />
              ) : (
                <>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--civic-text-secondary)' }}>
                    <span style={{ color: 'var(--civic-text-placeholder)' }}>{row.resourceType}: </span>
                    <span title={row.resourceIdTooltip} className="font-mono">
                      {row.resourceIdDisplay}
                    </span>
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--civic-text-placeholder)' }}>
                    Event type: {row.eventType}
                  </p>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface OutcomeBadgeProps {
  outcome: AuditOutcome;
  /** Use a denser variant suitable for the timeline row. */
  compact?: boolean;
}

/**
 * Outcome pill. Success uses the Civic success (green) token family and
 * failure uses the destructive (red) family, for true success/failure
 * semantics (ENG-1739).
 */
function OutcomeBadge({ outcome, compact }: OutcomeBadgeProps) {
  const label = outcome === 'success' ? 'Success' : 'Failure';
  const baseClass = compact
    ? 'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border flex-shrink-0 w-20 justify-center'
    : 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 border';
  return (
    <span
      className={baseClass}
      style={
        outcome === 'success'
          ? {
              backgroundColor: 'var(--civic-success-bg)',
              color: 'var(--civic-success-text)',
              borderColor: 'var(--civic-success-border)',
            }
          : {
              backgroundColor: 'var(--civic-destructive-bg)',
              color: 'var(--civic-destructive-text)',
              borderColor: 'var(--civic-destructive-border)',
            }
      }
    >
      {label}
    </span>
  );
}

interface CustomBadgeProps {
  label: string;
  /** Use a denser variant suitable for the timeline row. */
  compact?: boolean;
}

/**
 * Neutral badge for rows whose pill text isn't a Success/Failure outcome —
 * the hardcoded ex-parte narrative rows render "Auto" here (ENG-2037),
 * mirroring the design reference's system-actor chip.
 */
function CustomBadge({ label, compact }: CustomBadgeProps) {
  const baseClass = compact
    ? 'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border flex-shrink-0 w-20 justify-center'
    : 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 border';
  return (
    <span
      className={baseClass}
      style={{
        backgroundColor: 'var(--civic-bg-card)',
        color: 'var(--civic-accent-text)',
        borderColor: 'var(--civic-accent-bg-hover)',
      }}
    >
      {label}
    </span>
  );
}

interface NoteBulletsProps {
  lines: readonly string[];
  size?: 'sm' | 'xs';
}

/**
 * Bullet-list body for the hardcoded narrative rows (ENG-2037). Each line is
 * one pre-authored fact — no sentence-splitting heuristics (unlike the shared
 * ui/note-bullets component, whose splitter would fragment lines like
 * "Q4 2025 $5,400; Q1 2026 missing"). Short "Label:" prefixes are bolded via
 * the shared `noteSplitLabel` helper to match the design reference.
 */
function NoteBullets({ lines, size = 'sm' }: NoteBulletsProps) {
  const textCls = size === 'xs' ? 'text-xs' : 'text-sm';
  return (
    <ul className={`${textCls} leading-relaxed space-y-1 list-none m-0 p-0`}>
      {lines.map((line) => {
        const kv = noteSplitLabel(line);
        return (
          <li key={line} className="flex gap-2" style={{ color: 'var(--civic-text-secondary)' }}>
            <span
              aria-hidden="true"
              className="flex-shrink-0 select-none"
              style={{ color: 'var(--civic-text-placeholder)' }}
            >
              •
            </span>
            <span className="min-w-0">
              {kv ? (
                <>
                  <span className="font-semibold" style={{ color: 'var(--civic-text-primary)' }}>
                    {kv.label}:
                  </span>{' '}
                  {kv.value}
                </>
              ) : (
                line
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-10 text-sm" style={{ color: 'var(--civic-text-placeholder)' }}>
      No activity found for this case in the selected date range.
    </div>
  );
}

/** 3 skeleton rows mirroring the Cards layout. Static — no animation deps. */
function LoadingSkeleton() {
  return (
    <ul className="space-y-4 list-none p-0 m-0" role="status" aria-live="polite" aria-label="Loading activity log">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="rounded-md border p-5"
          style={{
            backgroundColor: 'var(--civic-bg-card)',
            borderColor: 'var(--civic-border-subtle)',
          }}
        >
          <div className="flex items-start gap-4">
            <div
              className="w-9 h-9 rounded-full flex-shrink-0"
              style={{ backgroundColor: 'var(--civic-bg-component)' }}
            />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 rounded w-1/3" style={{ backgroundColor: 'var(--civic-bg-component)' }} />
              <div className="h-3 rounded w-1/2" style={{ backgroundColor: 'var(--civic-bg-component)' }} />
              <div className="h-3 rounded w-2/3" style={{ backgroundColor: 'var(--civic-bg-component)' }} />
            </div>
          </div>
        </li>
      ))}
      <span className="sr-only">Loading activity log…</span>
    </ul>
  );
}

interface ErrorStateProps {
  onRetry: () => void;
}

/**
 * Static error string. Per ENG-1667 security brief, we MUST NOT interpolate
 * `error.message` / `error.graphQLErrors[i].message` into the UI — any of
 * those may carry server detail that the audit boundary considers
 * sensitive. Retry calls Apollo's `refetch()` with the same variables.
 */
function ErrorState({ onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-md border p-5 text-center"
      style={{
        backgroundColor: 'var(--civic-bg-card)',
        borderColor: 'var(--civic-border-subtle)',
      }}
    >
      <p className="text-sm mb-3" style={{ color: 'var(--civic-text-primary)' }}>
        Failed to load activity log. Try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="text-sm font-semibold px-4 py-2 rounded-md"
        style={{
          backgroundColor: 'var(--civic-accent-solid)',
          color: 'var(--civic-accent-on-solid)',
        }}
      >
        Retry
      </button>
    </div>
  );
}
