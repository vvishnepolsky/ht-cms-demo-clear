export const PAY_FREQUENCY = {
  HOURLY: 'hourly',
  WEEKLY: 'weekly',
  BIWEEKLY: 'biweekly',
  SEMIMONTHLY: 'semimonthly',
  MONTHLY: 'monthly',
  ANNUALLY: 'annually',
  VARIES: 'varies',
} as const;

export type PayFrequency = (typeof PAY_FREQUENCY)[keyof typeof PAY_FREQUENCY];

export interface JobIncomeInput {
  selfEmployed?: boolean;
  grossRevenue?: string | number;
  businessExpenses?: string | number;
  payRate?: string | number;
  payFrequency?: PayFrequency | string;
  hoursPerWeek?: string | number;
  hasExtras?: boolean;
  extrasMonthly?: string | number;
}

// hoursPerWeek applies only to hourly/varies — non-hourly rates are a flat periodic amount.
export function computeMonthlyIncome(job: JobIncomeInput): number {
  if (job.selfEmployed) {
    return Math.round(Math.max(0, Number(job.grossRevenue || 0) - Number(job.businessExpenses || 0)));
  }
  const rate = Number(job.payRate || 0);
  const hpw = Number(job.hoursPerWeek || 0);
  let monthly: number;
  switch (job.payFrequency) {
    case PAY_FREQUENCY.WEEKLY:
      monthly = (rate * 52) / 12;
      break;
    case PAY_FREQUENCY.BIWEEKLY:
      monthly = (rate * 26) / 12;
      break;
    case PAY_FREQUENCY.SEMIMONTHLY:
      monthly = rate * 2;
      break;
    case PAY_FREQUENCY.MONTHLY:
      monthly = rate;
      break;
    case PAY_FREQUENCY.ANNUALLY:
      monthly = rate / 12;
      break;
    default:
      monthly = (rate * hpw * 52) / 12;
  }
  if (job.hasExtras) {
    monthly += Number(job.extrasMonthly || 0);
  }
  return Math.round(monthly);
}
