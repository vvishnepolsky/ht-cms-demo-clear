/**
 * AutoProcessingPipeline — collapsible summary of the automated verification
 * steps that ran on this case before reaching the caseworker. Mirrors the
 * storyboard's DynamicWhyPanel pipeline summary (PipelineSummaryRow +
 * expandable detail rows).
 *
 * ENG-1983: the pipeline shows DATA VERIFICATIONS only (identity, citizenship,
 * residency, household, income) — never eligibility results. The storyboard's
 * pipeline is processing stages (Application Received → Data Validation →
 * Federal Hub Verification → Income Reconciliation); pathway routing, coverage
 * groups, and ABD checks belong to the Evaluate step's SectionedRuleTrace.
 * Callers derive steps via {@link buildVerificationSteps}, which merges the
 * curated verification sources with any real verification-section rows from
 * the BRE trace (so a genuine residency/citizenship denial still shows
 * blocked). The panel collapses by default and expands on click.
 */

import { useState } from 'react';
import { AlertCircle, Check, ChevronDown, Circle, Info, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { IdentityVerification } from '../../types/ee';
import type { RuleEvaluation } from './MagiRulesEngine';

/**
 * `info` is an informational row (e.g. the CLEAR identity verification) —
 * it is shown in the detail list but excluded from the pass/total tally so
 * "N of M verification sources passed" keeps counting data sources only.
 */
export type StepStatus = 'pass' | 'warn' | 'block' | 'pend' | 'info';

export interface PipelineStep {
  label: string;
  status: StepStatus;
  note: string;
}

function statusBg(status: StepStatus): string {
  if (status === 'pass') return 'var(--civic-accent-bg)';
  if (status === 'warn') return 'var(--civic-warning-bg)';
  if (status === 'block') return 'var(--civic-destructive-bg)';
  if (status === 'info') return 'var(--civic-info-bg, rgb(239 246 255))';
  return 'var(--civic-bg-component)';
}

function statusText(status: StepStatus): string {
  if (status === 'pass') return 'var(--civic-accent-text)';
  if (status === 'warn') return 'var(--civic-warning-text)';
  if (status === 'block') return 'var(--civic-destructive-text)';
  if (status === 'info') return 'var(--civic-info-text, #1e3a8a)';
  return 'var(--civic-text-placeholder)';
}

function StatusIcon({ status }: { status: StepStatus }) {
  // Decorative — the adjacent step label/summary text conveys the status, so
  // hide the glyphs from the accessibility tree (a11y-frontend.md Rule 3).
  if (status === 'pass') return <Check className="w-3 h-3" aria-hidden="true" />;
  if (status === 'warn') return <AlertCircle className="w-3 h-3" aria-hidden="true" />;
  if (status === 'block') return <XCircle className="w-3 h-3" aria-hidden="true" />;
  if (status === 'info') return <Info className="w-3 h-3" aria-hidden="true" />;
  return <Circle className="w-3 h-3" aria-hidden="true" />;
}

export const STEP_LABEL_IDENTITY_CLEAR = 'Identity verification (CLEAR)' as const;

/**
 * Pipeline row for the CLEAR / Verify Assist identity verification linked to
 * the case. Informational (`info`) when CLEAR verified the identity cleanly;
 * `warn` when the verification also surfaced active out-of-state Medicaid
 * coverage; `block` when CLEAR failed/expired; `pend` while in progress.
 * Returns null when no verification is linked — callers append the result to
 * {@link buildVerificationSteps} output.
 */
export function identityVerificationStep(iv: IdentityVerification | null | undefined): PipelineStep | null {
  if (!iv) return null;
  const checks = iv.checks ?? [];
  const passed = checks.filter((c) => c.status === 'success').length;
  const checksNote = checks.length > 0 ? ` ${passed} of ${checks.length} checks passed.` : '';
  if (iv.status === 'success') {
    const det = iv.determination;
    if (det?.duplicate_enrollment) {
      const payer = det.coverage?.payer_name ?? `${det.payer_state_name ?? det.payer_state ?? 'out-of-state'} Medicaid`;
      return {
        label: STEP_LABEL_IDENTITY_CLEAR,
        status: 'warn',
        note: `Identity verified by CLEAR.${checksNote} Coverage check found active ${payer} — see Case Assist.`,
      };
    }
    return {
      label: STEP_LABEL_IDENTITY_CLEAR,
      status: 'info',
      note: `Identity verified by CLEAR (selfie + government ID).${checksNote} No manual ID review needed.`,
    };
  }
  if (iv.status === 'failed' || iv.status === 'expired') {
    return {
      label: STEP_LABEL_IDENTITY_CLEAR,
      status: 'block',
      note: `CLEAR verification ${iv.status} — request identity documents from the applicant.`,
    };
  }
  return {
    label: STEP_LABEL_IDENTITY_CLEAR,
    status: 'pend',
    note: 'CLEAR verification not yet completed by the applicant.',
  };
}

const PLACEHOLDER_LABEL = 'var(--civic-text-placeholder)';

export interface AutoProcessingPipelineProps {
  /** Optional caller-supplied steps (use {@link buildVerificationSteps}).
   *  If omitted, falls back to the pathway's curated passing pipeline. */
  steps?: ReadonlyArray<PipelineStep>;
  /** Eligibility pathway — controls the default-fallback step labels.
   *  Defaults to MAGI for backwards compatibility. */
  pathway?: 'MAGI' | 'NON_MAGI';
}

// Step labels shared between the curated steps and the section→step map —
// they MUST stay identical or buildVerificationSteps' label match silently
// appends a duplicate step instead of replacing the curated default.
export const STEP_LABEL_CITIZENSHIP = 'Citizenship / Immigration' as const;
export const STEP_LABEL_RESIDENCY = 'Residency' as const;

// Verification sources shared by both pathways. These are the "key pieces"
// (identity, citizenship, residency, household) the caseworker can assume are
// verified before reaching the queue.
const COMMON_VERIFY_STEPS: ReadonlyArray<PipelineStep> = [
  { label: 'Identity & SSA Match', status: 'pass', note: 'SSA-3 verification confirmed — name, DOB, SSN match.' },
  { label: STEP_LABEL_CITIZENSHIP, status: 'pass', note: 'Citizenship verified via SAVE.' },
  { label: STEP_LABEL_RESIDENCY, status: 'pass', note: 'State residency confirmed via address verification.' },
  { label: 'Household Composition', status: 'pass', note: 'Household members and relationships verified.' },
];

// MAGI-only: stated income reconciled against IRS wage data. ENG-1874 — this
// step does not apply to Non-MAGI ABD (income is SSA-verified, not IRS-matched),
// so it is excluded from the curated Non-MAGI pipeline.
const MAGI_INCOME_STEP: PipelineStep = {
  label: 'Income — Stated vs. IRS',
  status: 'pass',
  note: 'Stated income within reasonable-compatibility tolerance.',
};

function defaultStepsForPathway(pathway: 'MAGI' | 'NON_MAGI'): ReadonlyArray<PipelineStep> {
  // ENG-1874: the Non-MAGI pipeline omits MAGI-specific rules entirely; it shows
  // the assumed-verified key sources only.
  // ENG-1891: "Coverage Group Routing" removed from both pathways — it is a
  // routing decision, not a verification source, so it no longer appears in the
  // pipeline (and is no longer tallied in the "verification sources passed" count).
  return pathway === 'NON_MAGI' ? [...COMMON_VERIFY_STEPS] : [...COMMON_VERIFY_STEPS, MAGI_INCOME_STEP];
}

// BRE trace sections that ARE data verifications, mapped to the curated step
// they replace. Everything else in the trace (Pathway, MAGI Gates, Coverage
// Group, ABD *, Final Determination, …) is an eligibility result and never
// renders on the Verify step — it belongs to Evaluate's SectionedRuleTrace.
// Section names mirror services/rules-engine/prisma/seed-data/cms-medicaid-rules.ts.
const VERIFICATION_SECTION_TO_STEP: Record<string, string> = {
  Residency: STEP_LABEL_RESIDENCY,
  'Citizenship & Immigration': STEP_LABEL_CITIZENSHIP,
};

/**
 * Builds the Verify-step pipeline: the pathway's curated verification sources,
 * with real BRE trace rows substituted in where the trace carries a
 * verification-section row (the engine only emits Residency / Citizenship rows
 * when the gate actually fired, i.e. a denial — so a real out-of-state denial
 * surfaces as a blocked step instead of an assumed-verified pass).
 *
 * Eligibility rows — anything outside VERIFICATION_SECTION_TO_STEP, including
 * every row of the flat seed shape (which carries no section metadata) — are
 * dropped: the Verify step shows data verifications only (ENG-1983).
 */
export function buildVerificationSteps(
  rules: ReadonlyArray<RuleEvaluation>,
  pathway: 'MAGI' | 'NON_MAGI',
): PipelineStep[] {
  const steps: PipelineStep[] = defaultStepsForPathway(pathway).map((s) => ({ ...s }));
  for (const rule of rules) {
    const label = rule.section ? VERIFICATION_SECTION_TO_STEP[rule.section] : undefined;
    if (!label) continue;
    const status: StepStatus = rule.status === 'PASSED' ? 'pass' : rule.status === 'FAILED' ? 'block' : 'warn';
    const step: PipelineStep = { label, status, note: rule.description };
    const idx = steps.findIndex((s) => s.label === label);
    if (idx >= 0) steps[idx] = step;
    else steps.push(step);
  }
  return steps;
}

export function AutoProcessingPipeline({ steps, pathway = 'MAGI' }: AutoProcessingPipelineProps) {
  const [open, setOpen] = useState(false);
  const resolvedSteps: ReadonlyArray<PipelineStep> =
    steps && steps.length > 0 ? steps : defaultStepsForPathway(pathway);

  const passCount = resolvedSteps.filter((s) => s.status === 'pass').length;
  // Informational rows (CLEAR identity) are listed but not tallied.
  const total = resolvedSteps.filter((s) => s.status !== 'info').length;
  const blocked = resolvedSteps.filter((s) => s.status === 'block').length;
  const warned = resolvedSteps.filter((s) => s.status === 'warn').length;
  const allPass = blocked === 0 && warned === 0;
  const summaryStatus: StepStatus = blocked > 0 ? 'block' : warned > 0 ? 'warn' : 'pass';

  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: PLACEHOLDER_LABEL }}>
        Auto-Processing Pipeline
      </p>

      {/* Summary row — collapsed by default, click to expand */}
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        aria-controls="auto-pipeline-detail"
        className="w-full flex items-center gap-3 px-4 py-3 bg-card rounded-lg border border-border shadow-sm text-left hover:bg-muted/30 transition-colors"
      >
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: statusBg(summaryStatus), color: statusText(summaryStatus) }}
        >
          <StatusIcon status={summaryStatus} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-foreground leading-relaxed">
            {allPass ? (
              <>
                <span className="font-semibold">All verification sources passed</span>{' '}
                <span style={{ color: 'var(--civic-accent-text)' }}>✓</span>{' '}
                <span className="text-muted-foreground">
                  ({passCount} of {total})
                </span>
              </>
            ) : (
              <>
                <span className="font-semibold">
                  {passCount} of {total} verification sources passed
                </span>
                {(blocked > 0 || warned > 0) && (
                  <span className="text-muted-foreground">
                    {' '}
                    — {blocked} blocked, {warned} flagged
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <ChevronDown
          className={cn('w-4 h-4 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {/* Expanded detail rows */}
      {open && (
        <div
          id="auto-pipeline-detail"
          className="bg-card rounded-lg border border-border shadow-sm overflow-hidden mt-2"
        >
          {resolvedSteps.map((step, i) => (
            <div
              key={`${step.label}-${i}`}
              className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0"
            >
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ backgroundColor: statusBg(step.status), color: statusText(step.status) }}
              >
                <StatusIcon status={step.status} />
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className="text-xs font-semibold"
                  style={{
                    color: step.status === 'block' || step.status === 'warn' ? statusText(step.status) : undefined,
                  }}
                >
                  {step.label}
                </p>
                {step.note && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.note}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
