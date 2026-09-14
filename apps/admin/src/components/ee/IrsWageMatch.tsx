/**
 * IrsWageMatch — MAGI Verify-phase panel showing the IRS wage-match
 * comparison the auto-processing pipeline ran against stated income.
 * Mirrors the storyboard's DynamicIncomePanel "IRS Wage Match" section.
 *
 *   - Per-employer row: source name, optional detection-source pill, IRS
 *     amount, Matched / Not Stated badge.
 *   - Total row + discrepancy / agreement caption.
 *
 * Reads stated income from intakeData.monthlyHouseholdIncome and lists each
 * household member's employmentIncome / otherIncome as a separate IRS row.
 * For the demo the match is shown as "Matched" — the EE service doesn't yet
 * expose an IRS-vs-stated diff so we keep it consistent with the stated
 * total.
 */

import { cn } from '../../lib/utils';
import { currency } from '../../lib/ee-utils';
import type { EECase } from '../../types/ee';

const PLACEHOLDER_LABEL = 'var(--civic-text-placeholder)';

interface IrsRow {
  source: string;
  detectionSource?: string;
  note?: string;
  amount: number;
  matched: boolean;
}

interface HouseholdMemberIncome {
  firstName?: string;
  lastName?: string;
  income?: {
    employmentIncome?: number;
    otherIncome?: number;
  };
}

function buildRows(eeCase: EECase): IrsRow[] {
  const intake = (eeCase.intakeData ?? {}) as Record<string, unknown>;
  const members = Array.isArray(intake.householdMembers) ? (intake.householdMembers as HouseholdMemberIncome[]) : [];
  const rows: IrsRow[] = [];

  for (const m of members) {
    const name = [m.firstName, m.lastName].filter(Boolean).join(' ') || 'Household member';
    const inc = m.income ?? {};
    if (inc.employmentIncome && inc.employmentIncome > 0) {
      rows.push({
        source: `${name} — W-2 wages`,
        detectionSource: 'IRS W-2 (prior year)',
        note: 'Matches stated employment income',
        amount: inc.employmentIncome,
        matched: true,
      });
    }
    if (inc.otherIncome && inc.otherIncome > 0) {
      rows.push({
        source: `${name} — other income`,
        detectionSource: 'IRS 1099 (prior year)',
        note: 'Matches stated other income',
        amount: inc.otherIncome,
        matched: true,
      });
    }
  }

  if (rows.length === 0) {
    const total = typeof intake.monthlyHouseholdIncome === 'number' ? intake.monthlyHouseholdIncome : 0;
    rows.push({
      source: 'Household reported income',
      detectionSource: 'IRS prior-year aggregate',
      note: 'No discrepancy detected',
      amount: total,
      matched: true,
    });
  }

  return rows;
}

export interface IrsWageMatchProps {
  eeCase: EECase;
}

export function IrsWageMatch({ eeCase }: IrsWageMatchProps) {
  const rows = buildRows(eeCase);
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const intake = (eeCase.intakeData ?? {}) as Record<string, unknown>;
  const stated = typeof intake.monthlyHouseholdIncome === 'number' ? intake.monthlyHouseholdIncome : total;
  const matches = total === stated;

  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: PLACEHOLDER_LABEL }}>
        IRS Wage Match
      </p>
      <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        {rows.map((r, i) => (
          <div
            key={`${r.source}-${i}`}
            className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0 gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-semibold text-foreground">{r.source}</p>
                {r.detectionSource && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted/30 border border-border text-muted-foreground">
                    Source: {r.detectionSource}
                  </span>
                )}
              </div>
              {r.note && (
                <p className="text-xs mt-0.5" style={{ color: PLACEHOLDER_LABEL }}>
                  {r.note}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-xs font-semibold text-foreground">{currency(r.amount)}</span>
              <span
                className={cn(
                  'inline-flex items-center font-medium rounded-md text-[10px] px-1.5 py-0.5 border whitespace-nowrap',
                  r.matched
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200',
                )}
              >
                {r.matched ? 'Matched' : 'Not stated'}
              </span>
            </div>
          </div>
        ))}
        <div className="px-4 py-3 border-t border-border bg-muted/30">
          <div className="flex justify-between text-xs mb-1">
            <span className="font-semibold text-foreground">IRS Total</span>
            <span className="font-bold text-foreground">{currency(total)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {matches
              ? `No discrepancy — IRS total matches stated ${currency(stated)}`
              : `Discrepancy: IRS ${currency(total)} vs. stated ${currency(stated)}`}
          </p>
        </div>
      </div>
    </section>
  );
}
