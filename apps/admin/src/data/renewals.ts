/**
 * Mocked renewals data for the cms-demo template.
 *
 * Sourced from the CMS Demo Storyboard / RenewalWorkspace.jsx + RenewalForm.jsx.
 * Drives the design-only renewals stub at /ee/cases/:id/renewal.
 *
 * Conventions:
 * - Caseworker names come from the canonical roster in `./team.ts`.
 * - Dates are anchored to DEMO_TODAY (`./demoToday.ts`) so timeline math
 *   (form sent / response due / days remaining) stays self-consistent.
 *
 * The renewal flow is keyed to a single archetype member (Diane M. Caldwell)
 * since this is a hackathon stub — the route accepts any :id and renders the
 * same workspace.
 */

import { DEMO_TODAY, daysAgo, daysFromNow, formatMDY } from './demoToday';
import { TEAM } from './team';

export type SourceTone = 'pass' | 'warn' | 'fail';

export interface DataSource {
  src: string;
  full: string;
  query: string;
  result: string;
  tone: SourceTone;
  detail: string;
  /** When 'argyle', the source renders the Argyle brand mark instead of `src`. */
  brand?: 'argyle';
}

export type DeliveryChannelKind = 'mail' | 'portal' | 'sms' | 'email';

export interface DeliveryRow {
  channel: string;
  kind: DeliveryChannelKind;
  status: string;
  timestamp: string;
}

export interface ReasonableCompatibilityRow {
  label: string;
  value: string;
  note?: string;
  tone?: 'fg' | 'warn';
  /** When 'argyle', the row label renders the Argyle brand mark instead of `label`. */
  brand?: 'argyle';
}

/** Days before DEMO_TODAY when the renewal form was generated/sent. */
const FORM_SENT_DAYS_AGO = 12;
/** Total response window in days (CMS standard: 30). */
export const RESPONSE_WINDOW_DAYS = 30;

/**
 * Machine-readable form-sent date — exported for the ex-parte Activity Log
 * rows' merge-sort timestamps (ENG-2080), which must share this anchor so the
 * log keeps agreeing with the Verify tab and the A-5170 form dates.
 */
export const formSentDate = daysAgo(FORM_SENT_DAYS_AGO);
const responseDueDate = daysFromNow(RESPONSE_WINDOW_DAYS - FORM_SENT_DAYS_AGO);
/** Coverage cert end date — when termination would take effect if no response. */
const coverageEndsDate = daysFromNow(RESPONSE_WINDOW_DAYS - FORM_SENT_DAYS_AGO + 28);

export const FORM_SENT_DISPLAY = formatMDY(formSentDate);
export const RESPONSE_DUE_DISPLAY = formatMDY(responseDueDate);
export const COVERAGE_ENDS_DISPLAY = formatMDY(coverageEndsDate);
export const DAYS_REMAINING = RESPONSE_WINDOW_DAYS - FORM_SENT_DAYS_AGO;

/**
 * Diane's last-reported monthly wage figure. Shared across the reasonable-
 * compatibility comparison, her member record, and the renewal form's income
 * section so a change stays consistent at all three sites (C.1).
 */
const DIANE_MONTHLY_WAGES = '$1,800/mo';

/** Hour-anchored timestamp for delivery events (CT). */
function deliveryTimestamp(hour: number, minute: number): string {
  return `${FORM_SENT_DISPLAY} ${String(hour).padStart(1)}:${String(minute).padStart(2, '0')} AM CT`;
}

export const DATA_SOURCES: DataSource[] = [
  {
    src: 'SSA',
    full: 'Social Security Administration',
    query: 'Citizenship & Identity',
    result: 'MATCHED',
    tone: 'pass',
    detail: 'SSN, name, DOB confirmed. U.S. Citizen status unchanged.',
  },
  {
    src: 'FDSH — IRS',
    full: 'Federal Data Services Hub · IRS',
    query: 'Federal tax data (most recent)',
    result: 'STALE',
    tone: 'warn',
    detail: 'Tax year 2024 wages: $19,500. Outside reasonable compatibility window — not current.',
  },
  {
    src: 'State SWICA',
    full: 'State Wage Information Collection Agency',
    query: 'Quarterly wage records',
    result: 'INCOMPLETE',
    tone: 'warn',
    detail: 'Q4 2025: $5,400 from ABC Manufacturing. Q1 2026: No wage record returned.',
  },
  {
    src: 'Argyle',
    full: 'Member-permissioned payroll & employment',
    query: 'Employment verification',
    result: 'NO MATCH',
    tone: 'fail',
    detail:
      'No Argyle connection on file for this member. Unable to confirm current employment from real-time payroll data.',
    brand: 'argyle',
  },
];

export const REASONABLE_COMPATIBILITY: ReasonableCompatibilityRow[] = [
  { label: 'Last attested income (ABC Manufacturing)', value: DIANE_MONTHLY_WAGES },
  { label: 'IRS (tax year 2024)', value: '$19,500/yr ≈ $1,625/mo', note: 'stale', tone: 'warn' },
  { label: 'SWICA (Q4 2025)', value: '$5,400/qtr ≈ $1,800/mo', note: 'not current' },
  { label: 'SWICA (Q1 2026)', value: 'No record', tone: 'warn' },
  { label: 'Argyle', value: 'No employer match', tone: 'warn', brand: 'argyle' },
];

export const DELIVERY_ROWS: DeliveryRow[] = [
  {
    channel: 'USPS First-Class Mail',
    kind: 'mail',
    status: 'Queued in nightly batch',
    timestamp: FORM_SENT_DISPLAY,
  },
  {
    channel: 'Citizen Portal Inbox',
    kind: 'portal',
    status: 'Posted',
    timestamp: deliveryTimestamp(9, 0),
  },
  {
    channel: 'SMS Alert',
    kind: 'sms',
    status: 'Delivered',
    timestamp: deliveryTimestamp(9, 1),
  },
  {
    channel: 'Email Alert',
    kind: 'email',
    status: 'Delivered to diane.caldwell@email.com',
    timestamp: deliveryTimestamp(9, 2),
  },
];

export interface RenewalMember {
  name: string;
  dateOfBirth: string;
  ssnMasked: string;
  medicaidId: string;
  address: string;
  /** Mailing address if different from the home address; "Same as home address" otherwise. */
  mailingAddress: string;
  phone: string;
  email: string;
  /** Preferred language for written notices (CMS contact-information section). */
  preferredWrittenLanguage: string;
  /** Preferred language for spoken contact (CMS contact-information section). */
  preferredSpokenLanguage: string;
  householdSize: number;
  category: string;
  lastReportedIncome: string;
  lastEmployer: string;
}

export const RENEWAL_MEMBER: RenewalMember = {
  name: 'Diane M. Caldwell',
  dateOfBirth: '06/15/1984',
  ssnMasked: '•••-••-1247',
  medicaidId: 'MC334567891',
  address: '1847 University Ave, Capital City SX 00100',
  mailingAddress: 'Same as home address',
  phone: '(515) 555-0184',
  email: 'diane.caldwell@email.com',
  preferredWrittenLanguage: 'English',
  preferredSpokenLanguage: 'English',
  householdSize: 1,
  category: 'Adult Group MAGI',
  lastReportedIncome: DIANE_MONTHLY_WAGES,
  lastEmployer: 'ABC Manufacturing Co.',
};

/**
 * People-in-your-household section of the CMS model renewal form. Pre-filled
 * from the current case file; the member confirms or corrects each person.
 * Diane is a single-person household, so this is one "Self" row.
 */
export interface HouseholdMember {
  name: string;
  relationship: string;
  dateOfBirth: string;
  ssnMasked: string;
  sex: string;
  /** Whether this person is seeking/keeping coverage this renewal. */
  seekingCoverage: boolean;
}

export const RENEWAL_HOUSEHOLD: HouseholdMember[] = [
  {
    name: RENEWAL_MEMBER.name,
    relationship: 'Self',
    dateOfBirth: '06/15/1984',
    ssnMasked: '•••-••-1247',
    sex: 'Female',
    seekingCoverage: true,
  },
];

/**
 * Income-from-jobs section of the CMS model renewal form. Pre-filled with the
 * last employment on file (ABC Manufacturing) because current wages could not
 * be verified from electronic sources — the member confirms or updates it.
 */
export interface JobIncome {
  memberName: string;
  employer: string;
  employerPhone: string;
  employerAddress: string;
  monthlyWages: string;
  payFrequency: string;
  hoursPerWeek: string;
}

export const RENEWAL_JOB_INCOME: JobIncome = {
  memberName: RENEWAL_MEMBER.name,
  employer: 'ABC Manufacturing Co.',
  employerPhone: '(515) 555-0100',
  employerAddress: '2200 Industrial Pkwy, Capital City SX 00100',
  monthlyWages: DIANE_MONTHLY_WAGES,
  payFrequency: 'Bi-weekly',
  hoursPerWeek: '32',
};

export interface RenewalCaseworker {
  name: string;
  workerId: string;
}

/** Default assigned caseworker — Sarah Mitchell per storyboard convention. */
export const RENEWAL_CASEWORKER: RenewalCaseworker = {
  name: TEAM.sarah.name,
  workerId: TEAM.sarah.id.toUpperCase(),
};

export interface FormSection {
  id: string;
  num: number;
  title: string;
  tag: string;
  required: boolean;
}

export const FORM_SECTIONS: FormSection[] = [
  { id: 'identification', num: 1, title: 'Member Identification', tag: 'Pre-filled · Read-only', required: false },
  { id: 'household', num: 2, title: 'Household', tag: 'Pre-filled · Read-only', required: false },
  { id: 'income', num: 3, title: 'Income & Employment', tag: 'Member action required', required: true },
  { id: 'other-income', num: 4, title: 'Other Income', tag: 'Pre-filled', required: false },
  { id: 'certification', num: 5, title: 'Signature & Certification', tag: 'Member action required', required: true },
];

/** Sanity-check: DEMO_TODAY anchor is referenced (used by the page header). */
export const RENEWAL_TODAY_DATE = DEMO_TODAY;
