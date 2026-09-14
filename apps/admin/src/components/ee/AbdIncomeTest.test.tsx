/**
 * AbdIncomeTest tests (ENG-1947, ENG-2040)
 *
 * The income test reads through readSsaVerifiedSsdiIncome:
 *   - Non-MAGI/ABD $0-report case runs $0 vs $1,330 (100% FPL HH1) ⇒ PASS —
 *     no fabricated benefit (the old $950 stub is gone, ENG-2040).
 *   - A case reporting over the $1,330 standard ⇒ FAIL (value preserved).
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AbdIncomeTest } from './AbdIncomeTest';
import type { EECase } from '../../types/ee';

describe('AbdIncomeTest — SSA-verified income basis (ENG-1947, ENG-2040)', () => {
  it('passes the income test at $0 for a Non-MAGI $0-report case (Robert — no SSDI determination yet)', () => {
    const eeCase = {
      intakeData: { applicant: { receivingSSDI: true }, monthlyHouseholdIncome: 0 },
      determinations: [],
    } as unknown as EECase;

    render(<AbdIncomeTest eeCase={eeCase} />);

    expect(screen.getByText('Gross income: $0/mo')).toBeInTheDocument();
    expect(screen.queryByText('Gross income: $950/mo')).not.toBeInTheDocument();
    expect(screen.getByText(/PASSED/)).toBeInTheDocument();
    expect(screen.getByText('ABD Eligible')).toBeInTheDocument();
  });

  it('fails the income test when reported income exceeds the $1,330 standard (value preserved)', () => {
    const eeCase = {
      intakeData: { monthlyHouseholdIncome: 1_400 },
      determinations: [{ category: 'NON_MAGI' }],
    } as unknown as EECase;

    render(<AbdIncomeTest eeCase={eeCase} />);

    expect(screen.getByText('Gross income: $1,400/mo')).toBeInTheDocument();
    expect(screen.getByText(/FAILED/)).toBeInTheDocument();
    expect(screen.getByText('Over income')).toBeInTheDocument();
  });
});
