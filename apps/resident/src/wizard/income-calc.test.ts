import { describe, it, expect } from 'vitest';
import { PAY_FREQUENCY, computeMonthlyIncome } from './income-calc';

describe('computeMonthlyIncome', () => {
  describe('self-employment', () => {
    it('returns gross revenue minus business expenses', () => {
      expect(computeMonthlyIncome({ selfEmployed: true, grossRevenue: '5000', businessExpenses: '1200' })).toBe(3800);
    });

    it('clamps to 0 when expenses exceed revenue', () => {
      expect(computeMonthlyIncome({ selfEmployed: true, grossRevenue: '500', businessExpenses: '1000' })).toBe(0);
    });

    it('handles blank expenses as 0', () => {
      expect(computeMonthlyIncome({ selfEmployed: true, grossRevenue: '3000', businessExpenses: '' })).toBe(3000);
    });

    it('rounds non-integer revenue to nearest integer', () => {
      expect(computeMonthlyIncome({ selfEmployed: true, grossRevenue: '5000.75', businessExpenses: '0' })).toBe(5001);
    });
  });

  describe('hourly pay (default)', () => {
    it('computes rate × hpw × (52/12)', () => {
      // $15/hr × 40hr/wk × (52/12) = 2600
      expect(computeMonthlyIncome({ payFrequency: PAY_FREQUENCY.HOURLY, payRate: '15', hoursPerWeek: '40' })).toBe(
        2600,
      );
    });

    it('falls through to hourly formula for unknown frequency', () => {
      expect(computeMonthlyIncome({ payFrequency: 'unknown', payRate: '15', hoursPerWeek: '40' })).toBe(2600);
    });
  });

  describe('weekly pay (ENG-1700 — must NOT multiply by hoursPerWeek)', () => {
    it('computes rate × 52/12 regardless of hoursPerWeek', () => {
      // $1200/wk × 52/12 = 5200
      expect(computeMonthlyIncome({ payFrequency: PAY_FREQUENCY.WEEKLY, payRate: '1200', hoursPerWeek: '40' })).toBe(
        5200,
      );
    });

    it('produces same result whether hoursPerWeek is set or not', () => {
      const withHpw = computeMonthlyIncome({ payFrequency: PAY_FREQUENCY.WEEKLY, payRate: '1200', hoursPerWeek: '40' });
      const withoutHpw = computeMonthlyIncome({ payFrequency: PAY_FREQUENCY.WEEKLY, payRate: '1200' });
      expect(withHpw).toBe(withoutHpw);
    });
  });

  describe('biweekly pay (ENG-1700)', () => {
    it('computes rate × 26/12 regardless of hoursPerWeek', () => {
      // $2400 every 2 wks × 26/12 = 5200
      expect(computeMonthlyIncome({ payFrequency: PAY_FREQUENCY.BIWEEKLY, payRate: '2400', hoursPerWeek: '40' })).toBe(
        5200,
      );
    });
  });

  describe('semimonthly pay (ENG-1700)', () => {
    it('computes rate × 2 regardless of hoursPerWeek', () => {
      // $500 twice a month = $1000/mo
      expect(
        computeMonthlyIncome({ payFrequency: PAY_FREQUENCY.SEMIMONTHLY, payRate: '500', hoursPerWeek: '40' }),
      ).toBe(1000);
    });

    it('matches the example from the ticket: $500 twice monthly = $1000', () => {
      expect(computeMonthlyIncome({ payFrequency: PAY_FREQUENCY.SEMIMONTHLY, payRate: '500' })).toBe(1000);
    });
  });

  describe('monthly pay', () => {
    it('returns rate directly', () => {
      expect(computeMonthlyIncome({ payFrequency: PAY_FREQUENCY.MONTHLY, payRate: '4000' })).toBe(4000);
    });
  });

  describe('annually pay', () => {
    it('divides rate by 12', () => {
      expect(computeMonthlyIncome({ payFrequency: PAY_FREQUENCY.ANNUALLY, payRate: '60000' })).toBe(5000);
    });
  });

  describe('extrasMonthly (ENG-1730 — tips/commissions/bonuses)', () => {
    it('adds extrasMonthly to the base when hasExtras is true', () => {
      // $2000/mo base + $300 tips = $2300
      expect(
        computeMonthlyIncome({
          payFrequency: PAY_FREQUENCY.MONTHLY,
          payRate: '2000',
          hasExtras: true,
          extrasMonthly: '300',
        }),
      ).toBe(2300);
    });

    it('ignores extrasMonthly when hasExtras is false', () => {
      expect(
        computeMonthlyIncome({
          payFrequency: PAY_FREQUENCY.MONTHLY,
          payRate: '2000',
          hasExtras: false,
          extrasMonthly: '300',
        }),
      ).toBe(2000);
    });

    it('treats blank extrasMonthly as 0 when hasExtras is true', () => {
      expect(
        computeMonthlyIncome({
          payFrequency: PAY_FREQUENCY.MONTHLY,
          payRate: '2000',
          hasExtras: true,
          extrasMonthly: '',
        }),
      ).toBe(2000);
    });

    it('works with hourly base pay plus extras', () => {
      // $15/hr × 40hr/wk × (52/12) + $200 tips = 2800
      expect(
        computeMonthlyIncome({
          payFrequency: PAY_FREQUENCY.HOURLY,
          payRate: '15',
          hoursPerWeek: '40',
          hasExtras: true,
          extrasMonthly: '200',
        }),
      ).toBe(2800);
    });
  });

  describe('edge cases', () => {
    it('returns 0 for all-blank fields', () => {
      expect(computeMonthlyIncome({})).toBe(0);
    });

    it('handles string numbers correctly', () => {
      expect(computeMonthlyIncome({ payFrequency: PAY_FREQUENCY.MONTHLY, payRate: '3500' })).toBe(3500);
    });

    it('rounds to nearest integer', () => {
      // $1000/wk × 52/12 = 4333.33... → 4333
      expect(computeMonthlyIncome({ payFrequency: PAY_FREQUENCY.WEEKLY, payRate: '1000' })).toBe(4333);
    });
  });
});
