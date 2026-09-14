/**
 * CASE_DETAILS — rich case-detail fixtures consumed by CaseDetailsDrawer.
 *
 * Storyboard-ported demo data, keyed by case identifier. Real cases come
 * from the medicaidEeCases GraphQL query (chrome only); the deep detail
 * shape lives here as a mock fixture for the four-tab drawer experience
 * until the platform exposes equivalent reads.
 *
 * Layer 1 (ENG-1708): ships the types and a single default fixture so
 * the drawer renders meaningfully even for unknown case IDs. Layers 2-5
 * grow this file with additional fixtures and tab-specific slices as
 * each tab implementation lands.
 *
 * On unknown caseId, getCaseDetail() returns the DEFAULT_CASE_ID fixture.
 * This mirrors the storyboard's fallback pattern and keeps the demo
 * resilient when the GraphQL feed returns a case the fixtures don't
 * cover yet.
 */

import { ARGYLE_BRAND } from '../components/ee/renewal/ArgyleMark';

export interface IdentitySection {
  fullName: string;
  dob: string;
  ssn: string;
  gender: string;
  maritalStatus: string;
  citizenship: string;
  immigration: string;
  raceEthnicity: string;
}

export interface ContactSection {
  homeAddress: string;
  mailingAddress: string;
  phone: string;
  email: string;
  preferredContact: string;
  primaryLanguage: string;
  interpreterNeeded: string;
  accessibilityNeeds: string;
}

export interface HouseholdMember {
  name: string;
  relation: string;
  age: number;
  dob: string;
}

export interface HouseholdSection {
  count: number;
  members: HouseholdMember[];
  note: string;
}

export interface ProgramRow {
  prog: string;
  checked: boolean;
  note: string;
}

export interface IncomeRow {
  source: string;
  sub: string;
  type: string;
  freq: string;
  amount: string;
  monthly: string;
  /** When ARGYLE_BRAND, the income row renders an inline ArgyleMark glyph after the source name. */
  brand?: typeof ARGYLE_BRAND;
}

export interface IncomeSection {
  rows: IncomeRow[];
  total: string;
  note?: string;
}

export interface AssetRow {
  asset: string;
  inst: string;
  value: string;
  countable: 'Yes' | 'No' | 'Exempt';
}

export interface AssetsSection {
  rows: AssetRow[];
  note?: string;
}

export interface DisabilitySection {
  claimed: string;
  type: string;
  ssdiStart: string;
  physician: string;
  certStatus: string;
  ltc: string;
  nursingHome: string;
  medicare: string;
  ddsReferralSent: boolean;
  // TODO(ENG-1748): 'confirmed' will be produced by the EE service once
  // PENDING_DDS status is exposed. Today derive-case-detail.ts hardcodes
  // 'pending'; the component state (ddsConfirmed) drives the display instead.
  ddsStatus: 'pending' | 'confirmed';
}

export interface CoverageSection {
  hasInsurance: string;
  planName: string;
  policyId: string;
  coverageType: string;
  premium: string;
  effectiveDate: string;
  employerSponsored: string;
  spouseParentCoverage: string;
}

export interface EmploymentSection {
  currentlyEmployed: string;
  employer: string;
  employmentType: string;
  startDate: string;
  workExemption: string;
  exemptionBasis: string;
  ihawpThreshold: string;
  volunteerTraining: string;
}

export interface SignatureSection {
  applicationId: string;
  submissionMethod: string;
  submitted: string;
  ipAddress: string;
  electronicSignature: string;
  rrAcknowledged: string;
  penaltyClause: string;
  authorizedRep: string;
}

/**
 * Status of a CaseMessage. Open-ended (`| string`) on the L1 type to keep the
 * fixture loose; L4 conventions:
 *   - outbound delivered: 'sent' | 'delivered' | 'read' | 'failed'
 *   - outbound future:    'scheduled' | 'draft'
 *   - inbound:            'received'
 */
export interface CaseMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  channel: string;
  subject: string;
  content: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read' | 'received' | 'failed' | 'scheduled' | 'draft' | string;
  sender: string;
  author?: string;
  rfiDeadline?: string;
  attachments?: Array<{ name: string; size: string }>;
  deliveryTracking?: {
    sent: string;
    delivered: string;
    read: string;
    response: string;
    deadline: string;
  };
  /**
   * True for the original "Application submitted" entry — the inbound row
   * every case starts with. Used by NoticesMessagesTab to distinguish "the
   * applicant has replied to an RFI" from "the application itself is on
   * file", without coupling to a specific fixture id.
   */
  isInitialSubmission?: boolean;
}

export interface NarrativeEntry {
  date: string;
  author: string;
  initials: string;
  type: 'system' | 'worker';
  action: string;
  note: string;
}

export interface NarrativeSection {
  assignedTo: string;
  entries: NarrativeEntry[];
}

/**
 * Full case-detail fixture shape. All tabs source from this. Sections
 * that don't apply to a given case (e.g. assets for an income-only
 * applicant) are nullable.
 */
export interface CaseDetailFixture {
  applied: string;
  identity: IdentitySection;
  contact: ContactSection;
  household: HouseholdSection;
  programs: ProgramRow[];
  income: IncomeSection;
  assets: AssetsSection | null;
  disability: DisabilitySection | null;
  coverage: CoverageSection;
  employment: EmploymentSection;
  signature: SignatureSection;
  messages: CaseMessage[];
  narrative: NarrativeSection;
}

/**
 * Default case used when CaseDetailsDrawer is opened on a caseId we
 * don't have fixture data for. Matches the storyboard's fallback (Non-MAGI ABD).
 */
export const DEFAULT_CASE_ID = 'IA-2026-045866';

/**
 * Fallback fixture for live-submitted MAGI cases that have no hand-authored fixture.
 * Uses the Jasmine Carter entry (MAGI, no asset-verification messages) so the
 * Messages tab doesn't show Non-MAGI ABD RFI requests for a MAGI approval.
 */
export const MAGI_DEFAULT_CASE_ID = 'IA-2026-047318';

const CASE_DETAILS: Record<string, CaseDetailFixture> = {
  // Robert Mitchell — Non-MAGI ABD applicant. Default fallback fixture.
  // Storyboard parity: src/data/case-details.jsx :: "IA-2026-045866".
  'IA-2026-045866': {
    applied: '02/26/2026',
    identity: {
      fullName: 'Robert Dale Mitchell',
      dob: '09/22/1967 (Age 58)',
      ssn: '900-12-3456',
      gender: 'Male',
      maritalStatus: 'Single',
      citizenship: 'U.S. Citizen',
      immigration: 'N/A — U.S. Citizen',
      raceEthnicity: 'Not disclosed',
    },
    contact: {
      homeAddress: '412 Oak Street, University City, SX 00200',
      mailingAddress: 'Same as home',
      phone: '(319) 555-0773',
      email: 'r.mitchell@email.com',
      preferredContact: 'Phone',
      primaryLanguage: 'English',
      interpreterNeeded: 'No',
      accessibilityNeeds: 'None reported',
    },
    household: {
      count: 1,
      members: [{ name: 'Robert Dale Mitchell', relation: 'Self', age: 58, dob: '09/22/1967' }],
      note: 'Single-person household · No dependents · No tax filers in household',
    },
    programs: [
      { prog: 'Medicaid', checked: true, note: 'Primary — Non-MAGI ABD (disability indicated at application)' },
      { prog: 'SNAP', checked: false, note: 'Not requested' },
      { prog: 'TANF/FIP', checked: false, note: 'Not requested' },
      { prog: 'WIC', checked: false, note: 'Not requested' },
    ],
    income: {
      rows: [
        {
          source: 'SSDI (Social Security Disability Insurance)',
          sub: 'Federal hub match — confirmed',
          type: 'Unearned',
          freq: 'Monthly',
          amount: '$950',
          monthly: '$950',
        },
      ],
      total: '$950/mo ($11,400/yr) — ABD income standard',
      note: 'Income below Medicaid ABD threshold for HH of 1.',
    },
    assets: {
      rows: [
        { asset: 'Checking account', inst: 'University Credit Union', value: '$1,840', countable: 'Yes' },
        { asset: 'Savings account', inst: 'University Credit Union', value: '$1,200', countable: 'Yes' },
        { asset: 'Vehicle (primary)', inst: '2014 Honda Civic', value: '$6,500', countable: 'Exempt' },
      ],
      note: 'Combined liquid assets $3,040 — below $2,000 single-person ABD limit? No — flagged for caseworker review.',
    },
    disability: {
      claimed: 'Yes — chronic back injury, lumbar fusion 2019',
      type: 'Physical',
      ssdiStart: '06/01/2020',
      physician: 'Dr. Kenneth Whitfield, MD — University Health Spine Center',
      certStatus: 'On file — Form A-5821 (10/14/2024)',
      ltc: 'No',
      nursingHome: 'No',
      medicare: 'Pending — 24-month SSDI waiting period ends 06/01/2022 (active Medicare A/B)',
      ddsReferralSent: false,
      ddsStatus: 'pending',
    },
    coverage: {
      hasInsurance: 'Medicare (Parts A & B)',
      planName: 'Original Medicare',
      policyId: '900-12-3456-A',
      coverageType: 'Federal — Medicare',
      premium: '$0 (Part A) · $174.70 (Part B)',
      effectiveDate: '06/01/2022',
      employerSponsored: 'No',
      spouseParentCoverage: 'N/A — single, no dependents',
    },
    employment: {
      currentlyEmployed: 'No',
      employer: 'N/A — disabled, not working',
      employmentType: 'N/A',
      startDate: 'N/A',
      workExemption: 'Yes — SSDI recipient',
      exemptionBasis: 'Disability (SSDI active since 06/2020)',
      ihawpThreshold: 'N/A — exempt',
      volunteerTraining: 'None',
    },
    signature: {
      applicationId: 'APP-2026-045866',
      submissionMethod: 'Self-Service Portal (online)',
      submitted: '02/26/2026 at 1:42 PM',
      ipAddress: '198.51.100.42',
      electronicSignature: 'Accepted — checkbox attestation',
      rrAcknowledged: 'Yes — Rights & Responsibilities (English)',
      penaltyClause: 'Acknowledged — perjury warning',
      authorizedRep: 'None — self-applied',
    },
    messages: [
      {
        id: 'msg-rm-005',
        direction: 'outbound',
        channel: 'SMS',
        subject: 'Reminder — Asset verification due in 3 days',
        content:
          'Reminder: Please upload your bank statements by 03/13/2026 to complete your Medicaid application. Reply STOP to opt out.',
        timestamp: '03/10/2026 8:00 AM',
        status: 'scheduled',
        sender: 'State HHS — Automated',
        author: 'System (Rules Engine)',
      },
      {
        id: 'msg-rm-004',
        direction: 'inbound',
        channel: 'Portal',
        subject: 'Re: Verification request — asset documentation',
        content:
          'I will upload the requested bank statements by Friday. Could you confirm whether the savings account at University Credit Union is the only liquid asset that counts against the limit, or should I also include my Roth IRA?',
        timestamp: '03/02/2026 4:12 PM',
        status: 'received',
        sender: 'Robert D. Mitchell',
      },
      {
        id: 'msg-rm-001',
        direction: 'outbound',
        channel: 'Portal',
        subject: 'Verification request — asset documentation',
        content:
          'Please upload your most recent two months of bank statements (checking and savings) so we can verify your liquid asset totals against the Non-MAGI ABD asset standard. Form A-5170 (Asset Verification) is enclosed for your reference.\n\nIf you have questions, you may reply through the portal or call (515) 555-0100.',
        timestamp: '02/27/2026 9:14 AM',
        status: 'read',
        sender: 'State HHS — County F',
        author: 'Sarah Mitchell (SM5210)',
        rfiDeadline: '03/13/2026',
        attachments: [{ name: 'Form A-5170 — Asset Verification.pdf', size: '184 KB' }],
        deliveryTracking: {
          sent: '02/27/2026 9:14 AM',
          delivered: '02/27/2026 9:14 AM',
          read: '02/28/2026 7:32 AM',
          response: '03/02/2026 4:12 PM',
          deadline: '03/13/2026',
        },
      },
      {
        id: 'msg-rm-002',
        direction: 'outbound',
        channel: 'Portal',
        subject: 'Application received — APP-2026-045866',
        content:
          'NOTICE OF APPLICATION RECEIVED — MEDICAID\n' +
          'State HHS — Member Services · 1305 E Walnut St, Capital City, SX 00100\n\n' +
          'Date: February 26, 2026\n' +
          'Notice type: Acknowledgment of Application Received\n' +
          'Case number: IA-2026-045866\n' +
          'Application reference: APP-2026-045866\n\n' +
          'To: Robert Dale Mitchell, 412 Oak Street, University City, SX 00200\n\n' +
          'Dear Mr. Mitchell,\n\n' +
          'We have received your application for health coverage. This notice confirms your application is on file and explains what happens next, what you may need to do, and your rights during the review.\n\n' +
          'WHAT YOU APPLIED FOR\n' +
          '• Program: Medicaid — Non-MAGI (Aged, Blind, and Disabled)\n' +
          '• Applicant: Robert Dale Mitchell (household of 1)\n' +
          '• Date received: February 26, 2026\n' +
          '• Filed through: Self-Service Portal\n\n' +
          'WHAT HAPPENS NEXT\n' +
          'A caseworker has been assigned to your case. We will review your application and the information you provided to decide whether you qualify for Medicaid. Because your application is based on disability, we may need to verify your medical and financial information, which can take longer than a standard review. We will send you a written decision no later than 90 days from the date your application was received, as required by federal regulations (42 CFR § 435.912). If we need more information, we will send a separate request listing exactly what is needed and the date it is due.\n\n' +
          'WHAT YOU MAY NEED TO DO\n' +
          '• Watch for requests for information (RFIs) through your preferred contact method.\n' +
          '• Provide any requested verifications — such as bank statements, proof of income, or medical records — by the stated deadline so your application is not delayed or denied.\n' +
          '• Report any change in your address, income, household, or resources within 10 days.\n\n' +
          'YOUR RIGHTS\n' +
          '• You have the right to a written decision on your application and the reasons for it.\n' +
          '• If we do not act on your application within the required timeframe, or if you disagree with the decision, you have the right to request a fair hearing within 90 days of the decision notice.\n' +
          '• You may represent yourself or name a friend, relative, attorney, or other person as your authorized representative at any time.\n' +
          '• You may review the rules and the information used to decide your case.\n\n' +
          'NONDISCRIMINATION\n' +
          'State HHS complies with applicable federal civil rights laws and does not discriminate on the basis of race, color, national origin, age, disability, or sex. To file a complaint, contact the State HHS Civil Rights Coordinator or the U.S. Department of Health and Human Services, Office for Civil Rights.\n\n' +
          'LANGUAGE & ACCESSIBILITY HELP\n' +
          'Free language assistance and auxiliary aids and services are available at no cost. Call (515) 555-0100 (TTY: 711) for help in your language or to request this notice in large print, Braille, or audio.\n\n' +
          'QUESTIONS?\n' +
          'Contact your caseworker, Sarah Mitchell, or State HHS Member Services at (515) 555-0100, Monday–Friday, 8:00 a.m.–5:00 p.m. Have your case number (IA-2026-045866) ready, or reply through your secure portal inbox.\n\n' +
          'This is an automated acknowledgment. No action is required at this time unless we request additional information.',
        timestamp: '02/26/2026 1:48 PM',
        status: 'delivered',
        sender: 'State HHS — Automated',
        author: 'System (Rules Engine)',
        deliveryTracking: {
          sent: '02/26/2026 1:48 PM',
          delivered: '02/26/2026 1:48 PM',
          read: '02/26/2026 6:11 PM',
          response: 'N/A',
          deadline: 'N/A',
        },
      },
      {
        id: 'msg-rm-003',
        direction: 'inbound',
        channel: 'Portal',
        subject: 'Application submitted — APP-2026-045866',
        content:
          'Application submitted via Self-Service Portal. Single-person household. Medicaid (Non-MAGI ABD) requested. SSDI income on file. Disability documented.',
        timestamp: '02/26/2026 1:42 PM',
        status: 'received',
        sender: 'Robert D. Mitchell',
        isInitialSubmission: true,
      },
    ],
    narrative: {
      assignedTo: 'Sarah Mitchell (SM5210)',
      entries: [
        {
          date: '02/27/2026 9:14 AM',
          author: 'Sarah Mitchell (SM5210)',
          initials: 'SM',
          type: 'worker',
          action: 'RFI Issued — Asset Documentation',
          note: 'Asset totals self-attested at $3,040 — exceeds the single-person ABD asset limit ($2,000). Bank statements requested to verify totals; if confirmed, caseworker review may consider exempt categories.',
        },
        {
          date: '02/26/2026 1:48 PM',
          author: 'System (Auto)',
          initials: 'SYS',
          type: 'system',
          action: 'Federal Hub Verification',
          note: 'SSDI income $950/mo confirmed via SSA hub. Medicare Parts A & B coverage confirmed effective 06/01/2022.',
        },
        {
          date: '02/26/2026 1:42 PM',
          author: 'Robert D. Mitchell',
          initials: 'RM',
          type: 'worker',
          action: 'Application Received',
          note: 'Application submitted via Self-Service Portal. Non-MAGI ABD pathway requested.',
        },
        {
          date: '02/27/2026 10:02 AM',
          author: 'System (Auto)',
          initials: 'SYS',
          type: 'system',
          action: 'SSA Disability Status — Pending',
          note: 'Federal SSA hub returned PENDING disability case status. DDS referral required per Non-MAGI ABD pathway.',
        },
      ],
    },
  },
  // ----------------------------------------------------------------
  // L2 (ENG-1708) — additional case fixtures appended at the end of
  // the map per the wave-2 cross-layer convention: L2 adds NEW cases
  // (at the end); L4 only extends `messages` on existing cases. This
  // keeps L2 ↔ L4 conflict-free on this file.
  // ----------------------------------------------------------------

  // Maria Garcia — MAGI Family caretaker, household of 4, no disability.
  // Exercises the "no disability section" branch and a fuller household
  // table than Robert Mitchell's single-person fixture.
  'IA-2026-046102': {
    applied: '03/04/2026',
    identity: {
      fullName: 'Maria Elena Garcia',
      dob: '04/18/1989 (Age 36)',
      ssn: '912-34-5678',
      gender: 'Female',
      maritalStatus: 'Married',
      citizenship: 'U.S. Citizen',
      immigration: 'N/A — U.S. Citizen',
      raceEthnicity: 'Hispanic / Latina',
    },
    contact: {
      homeAddress: '88 Riverside Drive, Apt 3B, University City, SX 00204',
      mailingAddress: 'Same as home',
      phone: '(319) 555-0421',
      email: 'maria.garcia@email.com',
      preferredContact: 'Email',
      primaryLanguage: 'Spanish',
      interpreterNeeded: 'Yes — Spanish (written + verbal)',
      accessibilityNeeds: 'None reported',
    },
    household: {
      count: 4,
      members: [
        { name: 'Maria Elena Garcia', relation: 'Self', age: 36, dob: '04/18/1989' },
        { name: 'Carlos Garcia', relation: 'Spouse', age: 38, dob: '11/02/1987' },
        { name: 'Sofia Garcia', relation: 'Daughter', age: 7, dob: '08/14/2018' },
        { name: 'Mateo Garcia', relation: 'Son', age: 4, dob: '03/30/2021' },
      ],
      note: 'Tax filer household · Married filing jointly · Two dependent children claimed',
    },
    programs: [
      { prog: 'Medicaid', checked: true, note: 'Primary — MAGI Family (Section 1931 / Parent & Caretaker Relative)' },
      { prog: 'CHIP', checked: true, note: 'For Sofia & Mateo if HH income exceeds Medicaid kids threshold' },
      { prog: 'SNAP', checked: false, note: 'Not requested' },
      { prog: 'WIC', checked: false, note: 'Not requested — children over WIC age cutoff' },
    ],
    income: {
      rows: [
        {
          source: 'Carlos Garcia — Wages',
          sub: 'Riverside Logistics Inc. — Warehouse supervisor',
          type: 'Earned',
          freq: 'Bi-weekly',
          amount: '$1,940',
          monthly: '$4,203',
        },
        {
          source: 'Maria Garcia — Part-time wages',
          sub: 'Sunrise Childcare Co-op (school-year only)',
          type: 'Earned',
          freq: 'Bi-weekly',
          amount: '$520',
          monthly: '$1,127',
        },
      ],
      total: '$5,330/mo ($63,960/yr) — MAGI household of 4',
      note: 'Household income ~138% FPL — within Medicaid MAGI Parent/Caretaker eligibility range for HH of 4.',
    },
    assets: {
      rows: [
        { asset: 'Joint checking account', inst: 'First State Bank', value: '$2,180', countable: 'No' },
        { asset: 'Vehicle (primary)', inst: '2017 Toyota Sienna', value: '$11,400', countable: 'Exempt' },
        { asset: 'Vehicle (secondary)', inst: '2009 Honda Civic', value: '$3,200', countable: 'Exempt' },
      ],
      note: 'MAGI category — assets non-countable. Listed for completeness.',
    },
    disability: null,
    coverage: {
      hasInsurance: 'No',
      planName: 'N/A',
      policyId: 'N/A',
      coverageType: 'Uninsured at application',
      premium: 'N/A',
      effectiveDate: 'N/A',
      employerSponsored: 'Spouse declined — premium > 9.83% household income',
      spouseParentCoverage: 'N/A — spouse uninsured',
    },
    employment: {
      currentlyEmployed: 'Yes (both spouses)',
      employer: 'Carlos: Riverside Logistics · Maria: Sunrise Childcare Co-op',
      employmentType: 'Full-time / Part-time',
      startDate: 'Carlos: 06/2019 · Maria: 09/2022',
      workExemption: 'N/A — MAGI category (work requirement does not apply)',
      exemptionBasis: 'N/A',
      ihawpThreshold: 'N/A — MAGI category',
      volunteerTraining: 'None',
    },
    signature: {
      applicationId: 'APP-2026-046102',
      submissionMethod: 'Self-Service Portal (online, Spanish UI)',
      submitted: '03/04/2026 at 7:18 PM',
      ipAddress: '198.51.100.118',
      electronicSignature: 'Accepted — checkbox attestation (both spouses)',
      rrAcknowledged: 'Yes — Rights & Responsibilities (Spanish)',
      penaltyClause: 'Acknowledged — perjury warning',
      authorizedRep: 'None — self-applied',
    },
    messages: [
      {
        id: 'msg-mg-001',
        direction: 'inbound',
        channel: 'Portal',
        subject: 'Application submitted — APP-2026-046102',
        content:
          'Application submitted via Self-Service Portal (Spanish). 4-person tax household, two dependent children. Medicaid (MAGI Family) requested, CHIP for kids if applicable.',
        timestamp: '03/04/2026 7:18 PM',
        status: 'received',
        sender: 'Maria E. Garcia',
      },
    ],
    narrative: {
      assignedTo: 'Daniel Reyes (DR3819)',
      entries: [
        {
          date: '03/05/2026 8:42 AM',
          author: 'System (Auto)',
          initials: 'SYS',
          type: 'system',
          action: 'Federal Hub Verification',
          note: 'Wage matches confirmed via Department of Workforce hub for both spouses. Household income $5,330/mo within MAGI Parent/Caretaker eligibility range for HH of 4.',
        },
        {
          date: '03/04/2026 7:18 PM',
          author: 'Maria E. Garcia',
          initials: 'MG',
          type: 'worker',
          action: 'Application Received',
          note: 'Application submitted via Self-Service Portal (Spanish locale). MAGI Family pathway requested.',
        },
      ],
    },
  },

  // Jasmine Carter — Pregnant Women pathway, income-only (no assets test
  // under PW category). Exercises the `assets: null` branch and a
  // disability-section-absent layout.
  'IA-2026-047318': {
    applied: '03/11/2026',
    identity: {
      fullName: 'Jasmine Renee Carter',
      dob: '07/03/1998 (Age 27)',
      ssn: '923-45-6789',
      gender: 'Female',
      maritalStatus: 'Single',
      citizenship: 'U.S. Citizen',
      immigration: 'N/A — U.S. Citizen',
      raceEthnicity: 'Black / African American',
    },
    contact: {
      homeAddress: '1247 Hawthorne Lane, Apt 12, Riverbend, SX 00251',
      mailingAddress: 'Same as home',
      phone: '(319) 555-0907',
      email: 'j.carter98@email.com',
      preferredContact: 'SMS',
      primaryLanguage: 'English',
      interpreterNeeded: 'No',
      accessibilityNeeds: 'None reported',
    },
    household: {
      count: 2,
      members: [
        { name: 'Jasmine Renee Carter', relation: 'Self', age: 27, dob: '07/03/1998' },
        { name: 'Unborn child (EDD 08/22/2026)', relation: 'Unborn — counted', age: 0, dob: 'EDD 08/22/2026' },
      ],
      note: 'Pregnant Women pathway — unborn child counted toward household size per state policy.',
    },
    programs: [
      { prog: 'Medicaid', checked: true, note: 'Primary — MAGI Pregnant Women (income-only, no asset test)' },
      { prog: 'WIC', checked: true, note: 'Requested concurrently — referral package generated' },
      { prog: 'SNAP', checked: false, note: 'Not requested' },
      { prog: 'TANF/FIP', checked: false, note: 'Not requested' },
    ],
    income: {
      rows: [
        {
          source: 'Wages — Hawthorne Diner',
          sub: 'Server (tipped position) — reduced hours due to pregnancy',
          type: 'Earned',
          freq: 'Bi-weekly',
          amount: '$680',
          monthly: '$1,473',
          brand: ARGYLE_BRAND,
        },
        {
          source: 'Reported cash tips',
          sub: 'Self-reported — averaged over last 90 days',
          type: 'Earned',
          freq: 'Weekly',
          amount: '$110',
          monthly: '$477',
        },
      ],
      total: '$1,950/mo ($23,400/yr) — MAGI household of 2 (incl. unborn)',
      note: 'Household income ~118% FPL — within Pregnant Women eligibility range (up to 375% FPL in this state).',
    },
    assets: null,
    disability: null,
    coverage: {
      hasInsurance: 'No',
      planName: 'N/A',
      policyId: 'N/A',
      coverageType: 'Uninsured at application',
      premium: 'N/A',
      effectiveDate: 'N/A',
      employerSponsored: 'Not offered — part-time position',
      spouseParentCoverage: 'N/A — single, no spouse/parent covered',
    },
    employment: {
      currentlyEmployed: 'Yes — part-time',
      employer: 'Hawthorne Diner',
      employmentType: 'Part-time (reduced hours due to pregnancy)',
      startDate: '04/2023',
      workExemption: 'Yes — pregnancy',
      exemptionBasis: 'Pregnancy (EDD 08/22/2026) — postpartum extension to 03/31/2027',
      ihawpThreshold: 'N/A — exempt during pregnancy + postpartum',
      volunteerTraining: 'None',
    },
    signature: {
      applicationId: 'APP-2026-047318',
      submissionMethod: 'Self-Service Portal (mobile, online)',
      submitted: '03/11/2026 at 10:54 AM',
      ipAddress: '198.51.100.203',
      electronicSignature: 'Accepted — checkbox attestation',
      rrAcknowledged: 'Yes — Rights & Responsibilities (English)',
      penaltyClause: 'Acknowledged — perjury warning',
      authorizedRep: 'None — self-applied',
    },
    messages: [
      {
        id: 'msg-jc-001',
        direction: 'outbound',
        channel: 'SMS',
        subject: 'Pregnancy verification required',
        content:
          'Please upload a prenatal-care confirmation or signed physician statement so we can finalize your Pregnant Women Medicaid pathway. You can reply with a photo or use the Portal upload link.',
        timestamp: '03/12/2026 8:30 AM',
        status: 'read',
        sender: 'State HHS — County F',
        rfiDeadline: '03/26/2026',
      },
      {
        id: 'msg-jc-002',
        direction: 'inbound',
        channel: 'Portal',
        subject: 'Application submitted — APP-2026-047318',
        content:
          'Application submitted via Self-Service Portal (mobile). Pregnant Women pathway requested; WIC referral consent provided.',
        timestamp: '03/11/2026 10:54 AM',
        status: 'received',
        sender: 'Jasmine R. Carter',
      },
    ],
    narrative: {
      assignedTo: 'Daniel Reyes (DR3819)',
      entries: [
        {
          date: '03/12/2026 8:30 AM',
          author: 'Daniel Reyes (DR3819)',
          initials: 'DR',
          type: 'worker',
          action: 'RFI Issued — Pregnancy Verification',
          note: 'Pregnancy self-attested at application; need prenatal-care confirmation to lock in the Pregnant Women pathway. SMS issued (preferred contact channel).',
        },
        {
          date: '03/11/2026 11:02 AM',
          author: 'System (Auto)',
          initials: 'SYS',
          type: 'system',
          action: 'Federal Hub Verification',
          note: 'Wage match confirmed via Department of Workforce hub. Tip income self-reported (no hub match available). Household income within Pregnant Women MAGI threshold.',
        },
        {
          date: '03/11/2026 10:54 AM',
          author: 'Jasmine R. Carter',
          initials: 'JC',
          type: 'worker',
          action: 'Application Received',
          note: 'Application submitted via Self-Service Portal (mobile). Pregnant Women pathway requested.',
        },
      ],
    },
  },

  // Mathieu Lefevre — MAGI Other Adult applicant, naturalized citizen whose
  // citizenship status did not initially match the federal SSA hub. Exercises
  // the Reasonable Opportunity Period (RAI) pathway for citizenship
  // verification under 42 CFR §435.956(b): hub mismatch → RFA notice → ROP
  // begins → beneficiary submits documentation → caseworker re-verifies.
  //
  // Added per ENG-1824: CMS flagged on the May 18 review call that the demo
  // had no case exercising the citizenship RAI flow. Full audit trail covers
  // application → citizenship attestation → hub query → RFA generated →
  // RFA delivered → citizenship submitted → verification complete.
  'IA-2026-046847': {
    applied: '02/18/2026',
    identity: {
      fullName: 'Mathieu Antoine Lefevre',
      dob: '11/30/1991 (Age 34)',
      ssn: '918-76-5432',
      gender: 'Male',
      maritalStatus: 'Single',
      citizenship: 'U.S. Citizen (Naturalized 08/2019)',
      immigration: 'N/A — Naturalized U.S. Citizen (Certificate of Naturalization on file)',
      raceEthnicity: 'Black / African American',
    },
    contact: {
      homeAddress: '2204 Elmwood Terrace, Apt 6, Cedar Ridge, SX 00227',
      mailingAddress: 'Same as home',
      phone: '(319) 555-0488',
      email: 'm.lefevre91@email.com',
      preferredContact: 'Email',
      primaryLanguage: 'English',
      interpreterNeeded: 'No',
      accessibilityNeeds: 'None reported',
    },
    household: {
      count: 1,
      members: [{ name: 'Mathieu Antoine Lefevre', relation: 'Self', age: 34, dob: '11/30/1991' }],
      note: 'Single-person tax household · Files individually · No dependents claimed',
    },
    programs: [
      { prog: 'Medicaid', checked: true, note: 'Primary — MAGI Other Adult (childless adult expansion category)' },
      { prog: 'SNAP', checked: false, note: 'Not requested' },
      { prog: 'TANF/FIP', checked: false, note: 'Not requested' },
      { prog: 'WIC', checked: false, note: 'Not eligible — no children, not pregnant' },
    ],
    income: {
      rows: [
        {
          source: 'Wages — Cedar Ridge Logistics',
          sub: 'Warehouse associate — part-time, hourly',
          type: 'Earned',
          freq: 'Bi-weekly',
          amount: '$805',
          monthly: '$1,744',
        },
      ],
      total: '$1,744/mo ($20,930/yr) — MAGI household of 1',
      note: 'Household income ~135% FPL — within MAGI Other Adult eligibility range (up to 138% FPL with state expansion buffer).',
    },
    assets: null,
    disability: null,
    coverage: {
      hasInsurance: 'No',
      planName: 'N/A',
      policyId: 'N/A',
      coverageType: 'Uninsured at application',
      premium: 'N/A',
      effectiveDate: 'N/A',
      employerSponsored: 'Not offered — employer below ACA threshold',
      spouseParentCoverage: 'N/A — single, no spouse/parent covered',
    },
    employment: {
      currentlyEmployed: 'Yes — part-time',
      employer: 'Cedar Ridge Logistics',
      employmentType: 'Part-time hourly (~22 hrs/wk)',
      startDate: '03/2022',
      workExemption: 'N/A — MAGI category (work requirement does not apply)',
      exemptionBasis: 'N/A',
      ihawpThreshold: 'N/A — MAGI category',
      volunteerTraining: 'None',
    },
    signature: {
      applicationId: 'APP-2026-046847',
      submissionMethod: 'Self-Service Portal (online)',
      submitted: '02/18/2026 at 11:24 AM',
      ipAddress: '198.51.100.157',
      electronicSignature: 'Accepted — checkbox attestation',
      rrAcknowledged: 'Yes — Rights & Responsibilities (English)',
      penaltyClause: 'Acknowledged — perjury warning',
      authorizedRep: 'None — self-applied',
    },
    messages: [
      // Newest first, then descending — matches storyboard ordering on the
      // Notice & Messages tab. Covers the full citizenship-RAI message thread.
      {
        id: 'msg-ml-005',
        direction: 'outbound',
        channel: 'Portal',
        subject: 'Citizenship verified — Reasonable Opportunity Period complete',
        content:
          'We have reviewed the Certificate of Naturalization you submitted on 03/05/2026. Citizenship has been verified and the Reasonable Opportunity Period for your Medicaid application (APP-2026-046847) is now closed. No further documentation is required for citizenship.\n\nYour application will continue to final eligibility determination. You will receive a Notice of Decision once a final determination is made.\n\nIf you have questions, you may reply through the portal or call (515) 555-0100.',
        timestamp: '03/06/2026 2:48 PM',
        status: 'read',
        sender: 'State HHS — County F',
        author: 'Daniel Reyes (DR3819)',
        deliveryTracking: {
          sent: '03/06/2026 2:48 PM',
          delivered: '03/06/2026 2:48 PM',
          read: '03/06/2026 7:14 PM',
          response: 'N/A',
          deadline: 'N/A',
        },
      },
      {
        id: 'msg-ml-004',
        direction: 'inbound',
        channel: 'Portal',
        subject: 'Re: RFA — Citizenship documentation submitted',
        content:
          'Uploading my Certificate of Naturalization (issued 08/14/2019) as requested. Please confirm receipt and let me know if you need anything else.',
        timestamp: '03/05/2026 8:36 AM',
        status: 'received',
        sender: 'Mathieu A. Lefevre',
        attachments: [
          { name: 'Certificate of Naturalization — N-550.pdf', size: '412 KB' },
          { name: 'State Driver License.jpg', size: '198 KB' },
        ],
      },
      {
        id: 'msg-ml-003',
        direction: 'outbound',
        channel: 'Portal',
        subject: 'RFA Notice — Citizenship documentation required (Reasonable Opportunity Period)',
        content:
          'Your Medicaid application (APP-2026-046847) is being processed, but the federal SSA hub did not return a match confirming your U.S. citizenship status. Under 42 CFR §435.956(b), you are entitled to a Reasonable Opportunity Period of 90 days to provide documentation of citizenship while your application remains pending.\n\nPlease upload ONE of the following by 05/20/2026:\n  • Certificate of Naturalization (Form N-550 or N-570)\n  • Certificate of Citizenship (Form N-560 or N-561)\n  • U.S. Passport (current or expired)\n  • State-issued REAL ID compliant driver license + birth certificate\n\nYour application will not be denied for citizenship during the Reasonable Opportunity Period. If documentation is not provided by 05/20/2026, eligibility for federal Medicaid will be re-evaluated.\n\nForm A-3500 (Citizenship Documentation Cover Sheet) is enclosed for your reference. You may reply through the portal, mail to the address on this notice, or call (515) 555-0100.',
        timestamp: '02/19/2026 9:42 AM',
        status: 'read',
        sender: 'State HHS — County F',
        author: 'Daniel Reyes (DR3819)',
        rfiDeadline: '05/20/2026',
        attachments: [{ name: 'Form A-3500 — Citizenship Documentation Cover Sheet.pdf', size: '156 KB' }],
        deliveryTracking: {
          sent: '02/19/2026 9:42 AM',
          delivered: '02/19/2026 9:42 AM',
          read: '02/19/2026 6:08 PM',
          response: '03/05/2026 8:36 AM',
          deadline: '05/20/2026',
        },
      },
      {
        id: 'msg-ml-002',
        direction: 'outbound',
        channel: 'Portal',
        subject: 'Application received — APP-2026-046847',
        content:
          'We have received your Medicaid application. Your reference number is APP-2026-046847. A caseworker has been assigned and will reach out within 5 business days if additional information is required.',
        timestamp: '02/18/2026 11:31 AM',
        status: 'delivered',
        sender: 'State HHS — Automated',
        author: 'System (Rules Engine)',
        deliveryTracking: {
          sent: '02/18/2026 11:31 AM',
          delivered: '02/18/2026 11:31 AM',
          read: '02/18/2026 3:22 PM',
          response: 'N/A',
          deadline: 'N/A',
        },
      },
      {
        id: 'msg-ml-001',
        direction: 'inbound',
        channel: 'Portal',
        subject: 'Application submitted — APP-2026-046847',
        content:
          'Application submitted via Self-Service Portal. Single-person household. Medicaid (MAGI Other Adult) requested. Self-attested as naturalized U.S. citizen.',
        timestamp: '02/18/2026 11:24 AM',
        status: 'received',
        sender: 'Mathieu A. Lefevre',
        isInitialSubmission: true,
      },
    ],
    narrative: {
      assignedTo: 'Daniel Reyes (DR3819)',
      // Citizenship RAI audit trail (newest-first): the seven events CMS
      // expects per ticket ENG-1824 — application → citizenship attestation
      // (covered by Application Received) → hub query (Federal Hub) → RFA
      // generated → RFA delivered → citizenship submitted → verification
      // complete.
      entries: [
        {
          date: '03/06/2026 2:48 PM',
          author: 'Daniel Reyes (DR3819)',
          initials: 'DR',
          type: 'worker',
          action: 'Citizenship Verification Complete — RAI Closed',
          note: 'Certificate of Naturalization (Form N-550, issued 08/14/2019) reviewed and accepted. Citizenship status verified manually after federal hub re-query returned MATCH on document number. Reasonable Opportunity Period closed; application proceeds to final eligibility determination.',
        },
        {
          date: '03/06/2026 2:31 PM',
          author: 'System (Auto)',
          initials: 'SYS',
          type: 'system',
          action: 'Federal Hub Re-verification — Citizenship Match',
          note: 'SSA hub re-queried with naturalization document number from caseworker review. Hub returned VERIFIED match on USCIS A-number. Citizenship flag updated to "verified" on APP-2026-046847.',
        },
        {
          date: '03/05/2026 8:36 AM',
          author: 'Mathieu A. Lefevre',
          initials: 'ML',
          type: 'worker',
          action: 'Citizenship Documentation Submitted',
          note: 'Beneficiary uploaded Certificate of Naturalization (Form N-550, 412 KB) and state driver license (REAL ID compliant, 198 KB) via Self-Service Portal in response to RFA dated 02/19/2026. Submission within 90-day Reasonable Opportunity Period (deadline 05/20/2026).',
        },
        {
          date: '02/19/2026 9:42 AM',
          author: 'Daniel Reyes (DR3819)',
          initials: 'DR',
          type: 'worker',
          action: 'RFA Notice Issued — Citizenship Documentation',
          note: 'Request for Additional Information (RFA) generated and delivered to beneficiary via Portal (preferred contact channel). Notice cites 42 CFR §435.956(b) and lists acceptable citizenship documents (N-550, N-560, U.S. Passport, REAL ID + birth certificate). Form A-3500 cover sheet attached. ROP deadline: 05/20/2026.',
        },
        {
          date: '02/19/2026 9:38 AM',
          author: 'System (Auto)',
          initials: 'SYS',
          type: 'system',
          action: 'Reasonable Opportunity Period Started',
          note: 'Per 42 CFR §435.956(b), ROP timer started at 02/19/2026; 90-day deadline computed to 05/20/2026. Application remains in pending status; no adverse action permitted during ROP. Eligibility for all other MAGI factors continues to be evaluated in parallel.',
        },
        {
          date: '02/18/2026 11:36 AM',
          author: 'System (Auto)',
          initials: 'SYS',
          type: 'system',
          action: 'Federal Hub Verification — Citizenship Mismatch',
          note: 'SSA hub query returned NO MATCH for citizenship status. Beneficiary self-attested as naturalized U.S. citizen at application; SSA record did not contain a matching naturalization marker. Wage and identity data confirmed via Department of Workforce hub. Case routed to caseworker queue for RFA generation.',
        },
        {
          date: '02/18/2026 11:24 AM',
          author: 'Mathieu A. Lefevre',
          initials: 'ML',
          type: 'worker',
          action: 'Application Received',
          note: 'Application submitted via Self-Service Portal. MAGI Other Adult pathway requested. Self-attested as naturalized U.S. citizen (naturalized 08/2019). No dependents, no other coverage on file.',
        },
      ],
    },
  },
};

/**
 * Returns the case-detail fixture for the given case ID, falling back
 * to the default fixture if the ID is unknown. Stable across calls
 * (does not clone) — consumers should treat the returned value as
 * read-only.
 */
export function getCaseDetail(caseId: string): CaseDetailFixture {
  return CASE_DETAILS[caseId] ?? CASE_DETAILS[DEFAULT_CASE_ID];
}

/**
 * True if we have a real (non-fallback) fixture for the given case ID.
 * Used by the drawer chrome to optionally label fallback cases.
 */
export function hasCaseDetail(caseId: string): boolean {
  return caseId in CASE_DETAILS;
}
