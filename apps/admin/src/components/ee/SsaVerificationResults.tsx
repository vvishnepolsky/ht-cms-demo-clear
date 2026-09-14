/**
 * SsaVerificationResults — Non-MAGI Verify-phase panel showing the SSA
 * Federal Hub query results that the auto-processing pipeline ran. Mirrors
 * the storyboard's IncomePanel "SSA Verification Results" block:
 *
 *   - Header with source label ("FDSH · <date>") — dated from the case's
 *     createdAt, when the (simulated) verification pipeline ran (ENG-2039)
 *   - Row list: Title II Benefit, Benefit Type, Disability Case Status,
 *     Medicare Status, SSN Match — each with optional status badge.
 *
 * Values are demo-static; the SSA federation isn't wired to the EE service
 * yet. The Disability Case Status row stays amber/Pending to mirror the
 * storyboard's ddsPending state.
 */

import { currency, readSsaVerifiedSsdiIncome } from '../../lib/ee-utils';
import type { EECase } from '../../types/ee';

const PLACEHOLDER_LABEL = 'var(--civic-text-placeholder)';

interface SsaRow {
  label: string;
  value: string;
}

/**
 * Verification date shown in the panel header — the case's creation time, i.e.
 * when the auto-processing pipeline (simulated) ran the SSA query. Previously
 * the frozen storyboard anchor DEMO_TODAY_DISPLAY (03/15/2026), which read as
 * a stale verification on live demo cases (ENG-2039).
 */
function verificationDateDisplay(createdAt: string): string {
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

export interface SsaVerificationResultsProps {
  eeCase: EECase;
  /**
   * True once DDS has confirmed disability (simulated) — flips the
   * Disability Case Status value from "Pending" to "Confirmed".
   */
  ddsConfirmed?: boolean;
}

export function SsaVerificationResults({ eeCase, ddsConfirmed = false }: SsaVerificationResultsProps) {
  const income = readSsaVerifiedSsdiIncome(eeCase);

  // No status chips on this panel — the values carry the state (sentence
  // case). Disability Case Status flips Pending → Confirmed when the
  // (simulated) DDS response lands. Medicare Status renders last.
  const rows: SsaRow[] = [
    {
      label: 'Title II Benefit',
      value: `${currency(income)}/mo`,
    },
    { label: 'Benefit Type', value: 'Social Security Disability Insurance' },
    { label: 'Disability Case Status', value: ddsConfirmed ? 'Confirmed' : 'Pending' },
    { label: 'SSN Match', value: 'Confirmed' },
    { label: 'Medicare Status', value: 'Not yet enrolled (waiting period)' },
  ];

  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: PLACEHOLDER_LABEL }}>
        SSA Verification Results
      </p>
      <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <p className="text-xs font-semibold text-foreground">SSA Query Results</p>
          <p className="text-xs" style={{ color: PLACEHOLDER_LABEL }}>
            Source: FDSH · {verificationDateDisplay(eeCase.createdAt)}
          </p>
        </div>
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between px-4 py-2.5 gap-3">
              <p className="text-xs text-muted-foreground font-medium">{r.label}</p>
              <p className="text-xs font-semibold text-foreground truncate">{r.value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
