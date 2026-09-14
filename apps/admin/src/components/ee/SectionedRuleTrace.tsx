/**
 * SectionedRuleTrace — caseworker-facing display of the engine's sectioned
 * trace (ENG-1669 data model) on the case workspace.
 *
 * Closes the four remaining unmet ACs on ENG-1670:
 *   - R-001  outcome badge (ELIGIBLE / INELIGIBLE / NEEDS_REVIEW)
 *   - R-006  `evaluatedAt` timestamp ("Last evaluated …")
 *   - R-007  case-aware empty state
 *   - AC-008 storyboard-shaped sectioned layout
 *
 * Storyboard parity: `/tmp/cms-storyboard/src/components/shared.jsx` L489
 * (`RuleTrace`) and `screenshots/01-james-verify.png`. The visual treatment
 * (collapsible card, section headers, two-column rows) follows Selam's
 * `RuleTraceSection` on `AutoEnrollmentWorkspacePage`; the data shape is
 * generalized to consume the engine's generic `TraceSection[]` rather than
 * her storyboard-named slots (`household / disregard / hierarchy`), so the
 * same component renders both MAGI and Non-MAGI ABD cases without lossy
 * mapping. Each section's heading comes from the engine's `section.name`
 * (driven by the seed-data tags landed in #1549).
 *
 * Future: when Selam's `AutoEnrollmentWorkspacePage` is ready to migrate
 * off its hardcoded `RuleTraceData` fixtures, this component is the
 * intended replacement — write an adapter from the hardcoded shape to
 * `SectionedTrace` and reuse here. Tracked as a follow-up; not blocking.
 */

import { useState } from 'react';
import { CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight, Info } from 'lucide-react';

export type TraceRowStatus = 'PASS' | 'FAIL' | 'PENDING';

/**
 * Slot discriminator routing a section to the bespoke Coverage-Group-Hierarchy
 * renderer. Mirrors `SLOT_HIERARCHY` in the rules-engine seed data — kept as a
 * local const (rather than a cross-package import) since the two packages don't
 * share a module. A divergence would surface as a section silently falling back
 * to generic rendering. See `services/rules-engine/prisma/seed-data/cms-medicaid-rules.ts`.
 */
export const SLOT_HIERARCHY = 'hierarchy' as const;

export interface SectionedTraceRow {
  ruleId: string;
  ruleName: string;
  displayCode: string;
  status: TraceRowStatus;
  leftLabel: string;
  rightValue: string;
  note?: string;
  // ENG-1670 (AC-008): bespoke-rendering hints. `slot` discriminates which
  // section-level renderer applies ('hierarchy', 'disregard'); `threshold`
  // is the human-readable limit string shown alongside the row.
  slot?: string;
  threshold?: string;
}

export interface SectionedTraceSection {
  name: string;
  ordering: number;
  summary?: string;
  note?: string;
  rows: SectionedTraceRow[];
}

export type EvaluationOutcome = 'ELIGIBLE' | 'INELIGIBLE' | 'NEEDS_REVIEW';

export interface SectionedTrace {
  outcome: EvaluationOutcome | null;
  evaluatedAt: string | null;
  engineVersion: string | null;
  sections: SectionedTraceSection[];
}

/**
 * Parse the raw `eeCase.ruleEvaluations` JSON column into a typed sectioned
 * trace. Returns null for any shape that isn't recognizably the ENG-1669
 * sectioned output (e.g., the older flat-array seed shape, missing data,
 * or a partial write mid-evaluation).
 *
 * Defensive: every field is checked individually. A malformed section
 * or row is dropped, not propagated as an exception — the demo workspace
 * must stay renderable even when the engine emits something unexpected.
 */
export function parseSectionedTrace(raw: unknown): SectionedTrace | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.sections)) return null;

  const sections: SectionedTraceSection[] = [];
  for (const s of obj.sections) {
    if (!s || typeof s !== 'object') continue;
    const sec = s as Record<string, unknown>;
    if (typeof sec.name !== 'string' || !Array.isArray(sec.rows)) continue;

    const rows: SectionedTraceRow[] = [];
    for (const r of sec.rows) {
      if (!r || typeof r !== 'object') continue;
      const row = r as Record<string, unknown>;
      if (typeof row.ruleId !== 'string' || typeof row.ruleName !== 'string') continue;
      const status = row.status === 'PASS' || row.status === 'FAIL' || row.status === 'PENDING' ? row.status : null;
      if (!status) continue;
      rows.push({
        ruleId: row.ruleId,
        ruleName: row.ruleName,
        displayCode: typeof row.displayCode === 'string' ? row.displayCode : row.ruleName,
        status,
        leftLabel: typeof row.leftLabel === 'string' ? row.leftLabel : '',
        rightValue: typeof row.rightValue === 'string' ? row.rightValue : '',
        note: typeof row.note === 'string' ? row.note : undefined,
        slot: typeof row.slot === 'string' ? row.slot : undefined,
        threshold: typeof row.threshold === 'string' ? row.threshold : undefined,
      });
    }

    sections.push({
      name: sec.name,
      ordering: typeof sec.ordering === 'number' ? sec.ordering : 0,
      summary: typeof sec.summary === 'string' ? sec.summary : undefined,
      note: typeof sec.note === 'string' ? sec.note : undefined,
      rows,
    });
  }

  const outcome =
    obj.outcome === 'ELIGIBLE' || obj.outcome === 'INELIGIBLE' || obj.outcome === 'NEEDS_REVIEW' ? obj.outcome : null;

  return {
    outcome,
    evaluatedAt: typeof obj.evaluatedAt === 'string' ? obj.evaluatedAt : null,
    engineVersion: typeof obj.engineVersion === 'string' ? obj.engineVersion : null,
    sections,
  };
}

/** Section names produced by the rules-engine that this presentation transform
 *  keys off (kept in sync with services/rules-engine cms-medicaid-rules.ts).
 *  Exported so test fixtures couple to the same literals rather than
 *  re-declaring them (mirrors the exported SLOT_HIERARCHY discriminator). */
export const SECTION_SSI_STATUS = 'SSI Status';
export const SECTION_ABD_CATEGORY = 'ABD Category';

export interface NonMagiTracePresentation {
  /** When false, the SSI Status section is dropped — an applicant who does not
   *  receive SSI should read as "not included", not a missing/failed check. */
  receivingSSI?: boolean;
  /** When true, ABD Category rows are presented as pending (awaiting a DDS
   *  disability determination) rather than passed checks. */
  abdPending?: boolean;
  /** When true (alongside abdPending), the pending note reads as "referral
   *  sent — awaiting determination" instead of "referral required". */
  ddsReferralSent?: boolean;
}

// ABD Category pending notes by DDS referral state — the storyboard's rules
// trace narrows from "referral required" to "awaiting determination" once
// the caseworker sends the packet.
export const ABD_PENDING_NOTE = 'Pending DDS disability determination' as const;
export const ABD_REFERRAL_SENT_NOTE = 'DDS referral sent — awaiting disability determination' as const;

/**
 * ENG-1874: reconcile the SSI Status / ABD Category sections for the Non-MAGI
 * pathway so they aren't contradictory. SSI and ABD are mutually exclusive
 * bases for ABD eligibility — showing "SSI missing" alongside "ABD Category
 * passed" reads as a conflict. For a non-SSI applicant we suppress the SSI
 * section and mark the ABD Category as pending DDS.
 *
 * Pure function over a parsed trace (tested in SectionedRuleTrace.test.tsx).
 */
export function presentNonMagiTrace(trace: SectionedTrace, opts: NonMagiTracePresentation): SectionedTrace {
  let sections = trace.sections;
  if (opts.receivingSSI === false) {
    sections = sections.filter((s) => s.name !== SECTION_SSI_STATUS);
  }
  if (opts.abdPending) {
    sections = sections.map((s) =>
      s.name === SECTION_ABD_CATEGORY
        ? {
            ...s,
            rows: s.rows.map((r) => ({
              ...r,
              status: 'PENDING' as const,
              note: opts.ddsReferralSent ? ABD_REFERRAL_SENT_NOTE : ABD_PENDING_NOTE,
            })),
          }
        : s,
    );
  }
  return { ...trace, sections };
}

interface OutcomeBadgeProps {
  outcome: EvaluationOutcome | null;
}

/**
 * R-001: outcome badge. Color-coded by determination, but with a textual
 * label so colorblind users get the same information (AC-007 carryover).
 */
function OutcomeBadge({ outcome }: OutcomeBadgeProps) {
  if (!outcome) return null;
  const config: Record<
    EvaluationOutcome,
    { label: string; bg: string; fg: string; border: string; Icon: typeof CheckCircle2 }
  > = {
    ELIGIBLE: {
      label: 'Eligible',
      bg: 'var(--civic-success-bg, var(--civic-jade-3, #e6f6ee))',
      fg: 'var(--civic-success-text)',
      border: 'var(--civic-jade-6, transparent)',
      Icon: CheckCircle2,
    },
    INELIGIBLE: {
      label: 'Ineligible',
      bg: 'var(--civic-destructive-bg, var(--civic-tomato-3, #fff0ee))',
      fg: 'var(--civic-destructive-text)',
      border: 'var(--civic-tomato-6, transparent)',
      Icon: XCircle,
    },
    NEEDS_REVIEW: {
      label: 'Needs review',
      bg: 'var(--civic-warning-bg)',
      fg: 'var(--civic-warning-text)',
      border: 'var(--civic-amber-6, transparent)',
      Icon: Clock,
    },
  };
  const { label, bg, fg, border, Icon } = config[outcome];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border flex-shrink-0 whitespace-nowrap"
      style={{ backgroundColor: bg, color: fg, borderColor: border }}
    >
      <Icon className="w-3 h-3" strokeWidth={2.25} aria-hidden="true" />
      {label}
    </span>
  );
}

const STATUS_STYLES: Record<TraceRowStatus, { Icon: typeof CheckCircle2; color: string; label: string }> = {
  PASS: { Icon: CheckCircle2, color: 'var(--civic-success-text)', label: 'Pass' },
  FAIL: { Icon: XCircle, color: 'var(--civic-destructive-text)', label: 'Fail' },
  PENDING: { Icon: Clock, color: 'var(--civic-warning-text)', label: 'Pending' },
};

function StatusIcon({ status }: { status: TraceRowStatus }) {
  const { Icon, color, label } = STATUS_STYLES[status];
  // role="img" + aria-label: the icon is the only PASS/FAIL/PENDING indicator
  // (opacity dimming is purely visual), so the label is load-bearing. role="img"
  // ensures the aria-label is announced across browsers/AT (a11y review S-3).
  return (
    <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} strokeWidth={2.25} role="img" aria-label={label} />
  );
}

/**
 * Format an ISO timestamp as "May 26, 2026 at 12:14 PM" for R-006. Returns
 * an empty string for null / unparseable input so callers can omit the
 * timestamp row without branching.
 */
function formatEvaluatedAt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

interface SectionedRuleTraceProps {
  /** The raw `eeCase.ruleEvaluations` JSON column (passed straight through). */
  ruleEvaluations: unknown;
  /** Optional title override; defaults to "Eligibility Determination Rule Trace". */
  title?: string;
  /** If true, the trace card starts expanded. Default closed (matches storyboard). */
  defaultOpen?: boolean;
  /** ENG-1874: when false, suppress the SSI Status section (applicant has no SSI). */
  receivingSSI?: boolean;
  /** ENG-1874: when true, render ABD Category rows as pending (awaiting DDS). */
  abdPending?: boolean;
  /** When true, the ABD pending note reads "referral sent — awaiting determination". */
  ddsReferralSent?: boolean;
  /** When true, the outcome badge (e.g. "Needs review") is suppressed — the
   *  caseworker has validated the determination, so the stale engine outcome
   *  no longer reflects the case state. */
  hideOutcomeBadge?: boolean;
}

const DEFAULT_TITLE = 'Eligibility Determination Rule Trace';

export function SectionedRuleTrace({
  ruleEvaluations,
  title = DEFAULT_TITLE,
  defaultOpen = false,
  receivingSSI,
  abdPending,
  ddsReferralSent,
  hideOutcomeBadge = false,
}: SectionedRuleTraceProps) {
  const parsed = parseSectionedTrace(ruleEvaluations);
  const trace = parsed ? presentNonMagiTrace(parsed, { receivingSSI, abdPending, ddsReferralSent }) : null;
  const [open, setOpen] = useState(defaultOpen);

  // R-007: case-aware empty state. Distinguishes "no evaluation yet" (no
  // trace at all) from "evaluation ran but produced no sections" (rare —
  // would indicate the rule set has no tagged rules); both render the
  // same placeholder for now because the caseworker action is identical.
  if (!trace || trace.sections.length === 0) {
    return (
      <div
        className="rounded-md border p-5 text-center"
        style={{ backgroundColor: 'var(--civic-bg-card)', borderColor: 'var(--civic-border-subtle)' }}
      >
        <Info
          aria-hidden="true"
          className="w-6 h-6 mx-auto mb-2"
          style={{ color: 'var(--civic-text-placeholder)' }}
          strokeWidth={1.75}
        />
        <p className="text-sm font-medium" style={{ color: 'var(--civic-text-primary)' }}>
          {title}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--civic-text-secondary)' }}>
          This case has not been evaluated yet. The trace will appear here after submission.
        </p>
      </div>
    );
  }

  const evaluatedAt = formatEvaluatedAt(trace.evaluatedAt);
  const totalRows = trace.sections.reduce((acc, s) => acc + s.rows.length, 0);

  return (
    <div
      className="rounded-md border overflow-hidden"
      style={{ backgroundColor: 'var(--civic-bg-card)', borderColor: 'var(--civic-border-subtle)' }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="sectioned-rule-trace-body"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors"
        style={{ backgroundColor: open ? 'var(--civic-bg-app)' : undefined }}
      >
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {open ? (
            <ChevronDown
              className="w-3.5 h-3.5 flex-shrink-0 mt-1"
              aria-hidden="true"
              style={{ color: 'var(--civic-text-secondary)' }}
            />
          ) : (
            <ChevronRight
              className="w-3.5 h-3.5 flex-shrink-0 mt-1"
              aria-hidden="true"
              style={{ color: 'var(--civic-text-secondary)' }}
            />
          )}
          {/* Stacked header: title (line 1), last-evaluated (line 2),
              outcome chip (line 3). No truncation — the title always
              renders in full. */}
          <div className="min-w-0 flex flex-col items-start gap-1">
            <span className="text-sm font-semibold break-words" style={{ color: 'var(--civic-text-primary)' }}>
              {title}
            </span>
            {evaluatedAt && (
              <span className="text-xs" style={{ color: 'var(--civic-text-placeholder)' }}>
                Last evaluated {evaluatedAt}
              </span>
            )}
            {!hideOutcomeBadge && <OutcomeBadge outcome={trace.outcome} />}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs hidden sm:inline" style={{ color: 'var(--civic-text-placeholder)' }}>
            {trace.sections.length} {trace.sections.length === 1 ? 'section' : 'sections'} · {totalRows} rules
          </span>
          {/* Storyboard parity: explicit "▼ View / ▲ Hide" affordance text
              alongside the chevron icon — more discoverable than icon-only. */}
          <span className="text-xs font-medium" style={{ color: 'var(--civic-accent-text)' }}>
            {open ? 'Hide rule trace' : 'View rule trace'}
          </span>
        </div>
      </button>

      {open && (
        <div
          id="sectioned-rule-trace-body"
          className="border-t divide-y"
          style={{ borderColor: 'var(--civic-border-subtle)' }}
        >
          {trace.sections.map((section, idx) => (
            <SectionBlock key={`${section.ordering}-${section.name}`} section={section} index={idx} />
          ))}
          {/* Footer with engine debug info — visible only when expanded.
              Mirrors the storyboard's run-ID / engine display, but moved
              into the expanded footer rather than the collapsed header
              (which now carries the more caseworker-relevant outcome +
              evaluatedAt). */}
          {trace.engineVersion && (
            <div
              className="px-4 py-2 text-xs flex items-center gap-3 flex-wrap"
              style={{ color: 'var(--civic-text-placeholder)' }}
            >
              <span>Engine v{trace.engineVersion}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Per-section dispatch. Sections whose rows are tagged with a `slot` value
 * get bespoke storyboard renderers (storyboard parity for the slots the
 * design specifies); everything else renders generically.
 *
 * The `slot` lives on rows (not sections) because the engine emits it
 * per-rule; a section's slot is the slot shared by its rows (the engine
 * groups rules by `section`, and a section is bespoke when all its rules
 * are tagged with the same slot).
 */
function SectionBlock({ section, index }: { section: SectionedTraceSection; index: number }) {
  const sectionSlot = section.rows.find((r) => r.slot)?.slot;
  // Composite id (ordering + index): the defensive parser defaults missing
  // `ordering` to 0, so two un-ordered sections would otherwise collide on
  // `trace-section-0` and break the aria-labelledby link (review S-2).
  const sectionId = `trace-section-${section.ordering}-${index}`;
  return (
    <section className="px-4 py-3" aria-labelledby={sectionId}>
      <header className="mb-2">
        <h4
          id={sectionId}
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--civic-text-secondary)' }}
        >
          {section.name}
        </h4>
        {section.summary && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--civic-text-placeholder)' }}>
            {section.summary}
          </p>
        )}
      </header>
      {section.rows.length === 0 ? (
        <p className="text-xs italic" style={{ color: 'var(--civic-text-placeholder)' }}>
          No rules in this section.
        </p>
      ) : sectionSlot === SLOT_HIERARCHY ? (
        <HierarchySectionBody rows={section.rows} />
      ) : (
        <ul className="space-y-1 list-none p-0 m-0">
          {section.rows.map((row) => (
            <TraceRow key={row.ruleId} row={row} />
          ))}
        </ul>
      )}
      {section.note && (
        <p className="text-xs mt-2 italic" style={{ color: 'var(--civic-text-placeholder)' }}>
          {section.note}
        </p>
      )}
    </section>
  );
}

/**
 * Bespoke renderer for `slot === 'hierarchy'` sections — the Coverage Group
 * Hierarchy (MAGI) per the CMS Demo Storyboard's `RuleTrace`. Renders rows
 * as `group | threshold | result` with the PASS row(s) highlighted as
 * "ASSIGNED" — the visual signal the storyboard uses to communicate which
 * coverage group the case landed in.
 */
const HIERARCHY_RESULT_LABEL: Record<TraceRowStatus, string> = {
  PASS: 'ASSIGNED',
  FAIL: 'SKIP',
  PENDING: 'PENDING',
};

function HierarchySectionBody({ rows }: { rows: SectionedTraceRow[] }) {
  return (
    <div
      className="rounded-md border overflow-hidden"
      style={{ backgroundColor: 'var(--civic-bg-app)', borderColor: 'var(--civic-border-subtle)' }}
    >
      <div
        className="grid text-[11px] uppercase tracking-wider font-semibold px-3 py-1.5 border-b"
        style={{
          gridTemplateColumns: '1fr 1fr auto',
          color: 'var(--civic-text-placeholder)',
          borderColor: 'var(--civic-border-subtle)',
        }}
      >
        <span>Coverage group</span>
        <span>Threshold</span>
        <span>Result</span>
      </div>
      <ul className="divide-y list-none p-0 m-0" style={{ borderColor: 'var(--civic-border-subtle)' }}>
        {rows.map((row) => {
          const isAssigned = row.status === 'PASS';
          const resultStyle = STATUS_STYLES[row.status];
          const ResultIcon = resultStyle.Icon;
          return (
            <li
              key={row.ruleId}
              className="grid items-center text-xs px-3 py-1.5"
              style={{
                gridTemplateColumns: '1fr 1fr auto',
                opacity: row.status === 'FAIL' ? 0.65 : 1,
                // ASSIGNED row gets a subtle highlight; mirrors the storyboard's
                // visual emphasis on which group the case actually landed in.
                backgroundColor: isAssigned ? 'var(--civic-success-bg, transparent)' : 'transparent',
                fontWeight: isAssigned ? 600 : 400,
              }}
            >
              <span style={{ color: 'var(--civic-text-primary)' }}>{row.rightValue || row.ruleName}</span>
              <span className="font-mono text-[11px]" style={{ color: 'var(--civic-text-secondary)' }}>
                {row.threshold ?? '—'}
              </span>
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold"
                style={{ color: resultStyle.color }}
              >
                <ResultIcon className="w-3 h-3" strokeWidth={2.5} aria-hidden="true" />
                {HIERARCHY_RESULT_LABEL[row.status]}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TraceRow({ row }: { row: SectionedTraceRow }) {
  const displayLabel = row.leftLabel || row.ruleName;
  const displayValue = row.rightValue;
  return (
    <li
      className="flex items-start gap-2 text-xs py-0.5"
      style={{
        // FAIL rows: dimmer so PASS/PENDING reads as primary. PENDING + PASS
        // get full opacity so the matched outcome is visually obvious.
        opacity: row.status === 'FAIL' ? 0.7 : 1,
      }}
    >
      <StatusIcon status={row.status} />
      <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2">
        <span style={{ color: 'var(--civic-text-primary)' }}>{displayLabel}</span>
        {displayValue && (
          <span className="font-medium" style={{ color: 'var(--civic-text-secondary)' }}>
            {displayValue}
          </span>
        )}
        {row.note && (
          <span className="text-[11px] italic w-full" style={{ color: 'var(--civic-text-placeholder)' }}>
            {row.note}
          </span>
        )}
      </div>
    </li>
  );
}
