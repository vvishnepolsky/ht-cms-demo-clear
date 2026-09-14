/**
 * MagiRulesEngine -- displays the rule evaluation results for a case.
 *
 * Accepts two persisted shapes (transparent to the caller):
 *
 *   1. Flat array (Selam's seed shape — ENG-1754):
 *        [{ ruleId, ruleName, status, description }, ...]
 *      This is what's stored on the 5 hand-seeded showcase cases.
 *
 *   2. Sectioned trace (rules engine output — ENG-1669):
 *        { outcome, sections: [{ name, rows: [{ ruleId, ruleName, displayCode,
 *          status, leftLabel, rightValue, note? }, ...] }, ...],
 *          matchedRules, failedRules, ... }
 *      This is what `evaluateRuleset` returns and what `handleBreEvaluation`
 *      writes to `case.ruleEvaluations` on submission / re-evaluation.
 *
 * Both shapes are flattened to the same `RuleEvaluation[]` the existing
 * table renders, so a case re-evaluated through the live rules engine
 * renders alongside hand-seeded cases without any visual jolt. The
 * sectioned-shape branch additionally maps:
 *   - status PASS  → PASSED
 *   - status FAIL  → FAILED
 *   - status PENDING → INFO  (closest existing visual signal)
 *   - row.leftLabel + " — " + row.rightValue → description
 */

import { CheckCircle, XCircle, Info } from 'lucide-react';
import { Card, CardContent } from '../ui';
import { cn } from '../../lib/utils';

export interface RuleEvaluation {
  ruleId: string;
  ruleName: string;
  status: 'PASSED' | 'FAILED' | 'INFO';
  description: string;
  /** Trace section the rule belongs to (e.g. "Residency", "Coverage Group").
   *  Only populated when parsing the sectioned (ENG-1669) shape — the flat
   *  seed shape carries no section metadata. ENG-1983 uses this to separate
   *  verification rows from eligibility rows on the Verify step. */
  section?: string;
}

export interface MagiRulesEngineProps {
  // `unknown`-like coverage of both shapes — see header. Callers don't need
  // to know which one came back; the parser below normalizes.
  ruleEvaluations: Record<string, unknown>[] | RuleEvaluation[] | Record<string, unknown> | null;
  pathway?: 'MAGI' | 'NON_MAGI';
}

function toRuleEvaluation(raw: Record<string, unknown>): RuleEvaluation | null {
  // Guard against null / non-object entries in the flat array (e.g.,
  // malformed seed data) — previously crashed the workspace.
  if (!raw || typeof raw !== 'object') return null;
  if (
    typeof raw.ruleId === 'string' &&
    typeof raw.ruleName === 'string' &&
    typeof raw.description === 'string' &&
    (raw.status === 'PASSED' || raw.status === 'FAILED' || raw.status === 'INFO')
  ) {
    return {
      ruleId: raw.ruleId,
      ruleName: raw.ruleName,
      status: raw.status,
      description: raw.description,
    };
  }
  return null;
}

// ENG-1669 trace row → flat RuleEvaluation. Returns null on shape mismatch
// or for rule rows that aren't user-facing (no DISPLAY action contribution).
//
// User-facing = the rule was explicitly tagged with a `displayCode` and a
// DISPLAY action that produced a `leftLabel`. Untagged rules in the engine
// fall through to a placeholder displayCode equal to the rule name; those
// rows are evaluator bookkeeping (e.g., "IA-MAGI-WR-007" — Caregiver of
// Incapacitated Adult work-requirement exemption) that don't belong in
// the caseworker's trace UI for a typical applicant.
//
// Vadim's demo feedback: "the rules engine is checking things that are
// not necessary" — same root cause. Filtering to displayCode-tagged rows
// only is the small, controlled fix.
function traceRowToEvaluation(row: Record<string, unknown>, section?: string): RuleEvaluation | null {
  if (typeof row.ruleId !== 'string' || typeof row.ruleName !== 'string') return null;

  const leftLabel = typeof row.leftLabel === 'string' ? row.leftLabel : '';
  const rightValue = typeof row.rightValue === 'string' ? row.rightValue : '';
  const note = typeof row.note === 'string' ? row.note : '';
  const displayCode = typeof row.displayCode === 'string' ? row.displayCode : '';

  // Drop rows that don't have an explicit DISPLAY contribution. The engine's
  // fallback path sets displayCode = ruleName and leaves leftLabel empty,
  // so the test below catches both untagged rows and explicitly-empty ones.
  if (!displayCode || displayCode === row.ruleName || !leftLabel) return null;

  const status: RuleEvaluation['status'] = row.status === 'PASS' ? 'PASSED' : row.status === 'FAIL' ? 'FAILED' : 'INFO';

  // Prefer leftLabel — rightValue (matches the design's two-column criterion);
  // fall back to whichever is non-empty, then the note.
  const description = leftLabel && rightValue ? `${leftLabel} — ${rightValue}` : leftLabel || rightValue || note || '';
  return { ruleId: row.ruleId, ruleName: row.ruleName, status, description, section };
}

// Detect the sectioned (ENG-1669) shape: an object with a `sections` array.
function isSectionedTrace(raw: unknown): raw is { sections: unknown[] } {
  return (
    !!raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray((raw as { sections?: unknown }).sections)
  );
}

export function parseRuleEvaluations(
  raw: Record<string, unknown>[] | RuleEvaluation[] | Record<string, unknown> | null,
): RuleEvaluation[] {
  if (!raw) return [];

  // Branch 1: ENG-1669 sectioned trace. Flatten sections.rows to evaluations.
  if (isSectionedTrace(raw)) {
    const rows: RuleEvaluation[] = [];
    for (const section of raw.sections) {
      if (!section || typeof section !== 'object') continue;
      const sectionRows = (section as { rows?: unknown }).rows;
      if (!Array.isArray(sectionRows)) continue;
      const sectionName = (section as { name?: unknown }).name;
      for (const row of sectionRows) {
        if (!row || typeof row !== 'object') continue;
        const evaluation = traceRowToEvaluation(
          row as Record<string, unknown>,
          typeof sectionName === 'string' ? sectionName : undefined,
        );
        if (evaluation) rows.push(evaluation);
      }
    }
    return rows;
  }

  // Branch 2: flat array (Selam's seed shape). Original behavior preserved.
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map(toRuleEvaluation).filter((r): r is RuleEvaluation => r !== null);
}

const STATUS_CONFIG = {
  PASSED: { icon: CheckCircle, label: 'Passed', className: 'text-emerald-600' },
  FAILED: { icon: XCircle, label: 'Failed', className: 'text-destructive' },
  INFO: { icon: Info, label: 'Info', className: 'text-blue-500' },
} as const;

export function MagiRulesEngine({ ruleEvaluations, pathway }: MagiRulesEngineProps) {
  const rules = parseRuleEvaluations(ruleEvaluations);
  const engineTitle = pathway === 'NON_MAGI' ? 'Non-MAGI ABD Rules v3.1' : 'MAGI Rules v4.2';

  if (rules.length === 0) {
    return (
      <Card>
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">{engineTitle}</h3>
          <p className="text-sm text-muted-foreground">No rule evaluations available for this case.</p>
        </CardContent>
      </Card>
    );
  }

  const passedCount = rules.filter((r) => r.status === 'PASSED').length;
  const failedCount = rules.filter((r) => r.status === 'FAILED').length;
  const infoCount = rules.filter((r) => r.status === 'INFO').length;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">{engineTitle}</h3>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
              {passedCount} passed
            </span>
            {failedCount > 0 && (
              <span className="flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5 text-destructive" />
                {failedCount} failed
              </span>
            )}
            {infoCount > 0 && (
              <span className="flex items-center gap-1">
                <Info className="h-3.5 w-3.5 text-blue-500" />
                {infoCount} info
              </span>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <caption className="sr-only">MAGI Rule Evaluation Results</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-[100px]">
                  Status
                </th>
                <th scope="col" className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-[200px]">
                  Rule
                </th>
                <th scope="col" className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rules.map((rule) => {
                const config = STATUS_CONFIG[rule.status];
                const Icon = config.icon;
                return (
                  <tr key={rule.ruleId} className={cn(rule.status === 'FAILED' && 'bg-destructive/5')}>
                    <td className="px-3 py-2">
                      <span className={cn('flex items-center gap-1.5 text-xs font-medium', config.className)}>
                        <Icon className="h-4 w-4 shrink-0" />
                        {config.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium">{rule.ruleName}</td>
                    <td className="px-3 py-2 text-muted-foreground">{rule.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
