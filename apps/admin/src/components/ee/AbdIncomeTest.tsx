/**
 * AbdIncomeTest — Non-MAGI Verify-phase income test card. Mirrors the
 * storyboard's IncomePanel "ABD Income Test" section: a horizontal progress
 * bar comparing the applicant's gross monthly income to the federal ABD
 * income standard (100% FPL HH 1 = $1,330/mo), with PASS / FAIL line and
 * an "ABD Eligible" badge.
 *
 * Income is read via the shared readSsaVerifiedSsdiIncome selector: the
 * per-case SSA override when present, the citizen-reported figure otherwise.
 * No benefit is fabricated — a $0-report case with no SSDI determination yet
 * (Robert) runs the test at $0 and passes at 0% FPL (ENG-2040).
 */

import { cn } from '../../lib/utils';
import { currency, readSsaVerifiedSsdiIncome } from '../../lib/ee-utils';
import type { EECase } from '../../types/ee';

// Exported for NonMagiDeterminePanel's DecisionHero (≈% FPL derivation).
export const ABD_INCOME_LIMIT = 1_330; // 100% FPL HH 1 (2026 HHS Poverty Guidelines)
const PLACEHOLDER_LABEL = 'var(--civic-text-placeholder)';
const ACCENT_TEXT = 'var(--civic-accent-text)';
const ACCENT_SOLID = 'var(--civic-accent-solid)';

export interface AbdIncomeTestProps {
  eeCase: EECase;
}

export function AbdIncomeTest({ eeCase }: AbdIncomeTestProps) {
  const income = readSsaVerifiedSsdiIncome(eeCase);
  const fplPercent = Math.round((income / ABD_INCOME_LIMIT) * 100);
  const passed = income < ABD_INCOME_LIMIT;
  const fillWidth = Math.min(100, Math.max(0, fplPercent));

  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: PLACEHOLDER_LABEL }}>
        ABD Income Test
      </p>
      <div className="bg-card rounded-lg border border-border shadow-sm p-4">
        <div className="flex justify-between text-xs text-muted-foreground mb-2">
          <span className="font-semibold text-foreground">Gross income: {currency(income)}/mo</span>
          <span>100% FPL (HH of 1): {currency(ABD_INCOME_LIMIT)}/mo</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${fillWidth}%`,
              backgroundColor: passed ? ACCENT_SOLID : 'var(--civic-destructive-solid)',
            }}
          />
        </div>
        <div className="flex justify-between items-center mt-2">
          <p className="text-xs font-bold" style={{ color: passed ? ACCENT_TEXT : 'var(--civic-destructive-text)' }}>
            {passed ? `PASSED — income at ≈${fplPercent}% FPL` : `FAILED — income at ≈${fplPercent}% FPL`}
          </p>
          <span
            className={cn(
              'inline-flex items-center font-semibold rounded-md text-[10px] px-1.5 py-0.5 border whitespace-nowrap',
              passed ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200',
            )}
          >
            {passed ? 'ABD Eligible' : 'Over income'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          ABD income standard: 100% FPL per state ABD configuration. 2026 HHS Poverty Guidelines, HH of 1.
        </p>
      </div>
    </section>
  );
}
