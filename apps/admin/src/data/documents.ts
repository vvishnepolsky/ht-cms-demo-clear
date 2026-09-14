/**
 * Mocked case documents for the cms-demo template.
 *
 * Sourced from the CMS Demo Storyboard (DocumentViewer.jsx).
 * Caseworker-only view: documents are read-only metadata + a small enum of
 * verification states the caseworker can toggle client-side. No backend wiring
 * yet — when ENG-1583 / ENG-1585 land and the eligibility-document-service
 * exposes a graphql contract, swap the imports here.
 *
 * Conventions:
 * - Uploaders are read from the canonical roster in `./team.ts` (or the
 *   household member, who we render as a free-form string).
 * - Upload timestamps are anchored to DEMO_TODAY (`./demoToday.ts`) via
 *   `daysAgo()` so timelines stay self-consistent.
 */

import { daysAgo, formatMDY } from './demoToday';
import { TEAM } from './team';

export type DocumentStatus = 'pending' | 'verified' | 'rejected';

export type DocumentType = 'identity' | 'income' | 'residency' | 'household' | 'medical' | 'other';

export type DocumentExt = 'pdf' | 'jpg' | 'png' | 'tiff';

/**
 * Free-form tags used by the CaseDetailsDrawer Documents tab to drive
 * filter-bucket membership (e.g. an RFI response is `type: 'income'` but
 * also `tags: ['rfi']` so it shows up under the RFI bucket). Optional —
 * a missing tags array means the doc only belongs to its `type` bucket.
 */
export type DocumentTag = 'rfi' | 'disability' | 'pregnancy' | 'asset' | 'employment' | 'required';

export interface CaseDocument {
  id: string;
  caseId: string;
  /** Human-readable filename as it would appear in S3. */
  name: string;
  /** What the document proves (identity, income, etc). Drives the icon. */
  type: DocumentType;
  /** File extension — drives the preview pane "paper" treatment. */
  ext: DocumentExt;
  /** Display-friendly size, e.g. "1.2 MB". */
  size: string;
  pages: number;
  status: DocumentStatus;
  uploadedBy: string;
  /** MM/DD/YYYY anchored to DEMO_TODAY. */
  uploadedAt: string;
  /**
   * Optional cross-cutting tags for filter buckets that span types
   * (e.g. RFI responses). The drawer's Documents tab uses these to
   * compute bucket counts alongside `type`.
   */
  tags?: DocumentTag[];
  /**
   * What the document is providing evidence for, surfaced as a one-line
   * subtitle in the drawer's Documents tab tile. e.g. "Identity verification".
   */
  relatedTo?: string;
  /** Optional one-line summary of what's inside the doc. */
  summary?: string;
  /**
   * Optional textual "preview" body. The DocumentViewer renders this as
   * monospace `<pre>` on a paper surface — a low-fidelity stand-in for a real
   * PDF rasterization. Keep it short (~10-30 lines).
   */
  previewText?: string;
}

/**
 * Per-case fixture data. Keyed by case ID. The viewer looks up by case ID
 * when given one, otherwise falls back to the default fixture set.
 *
 * Case IDs are not stable across this prototype (real ones come from
 * medicaid-ee-service); the WorkspacePage passes the active case ID through
 * and `documentsForCase()` returns the matching set or the default fallback.
 */
const DEFAULT_DOCUMENTS: CaseDocument[] = [
  {
    id: 'doc-001',
    caseId: 'default',
    name: 'Drivers_License_Front.jpg',
    type: 'identity',
    ext: 'jpg',
    size: '1.4 MB',
    pages: 1,
    status: 'verified',
    uploadedBy: 'Maria Rodriguez (applicant)',
    uploadedAt: formatMDY(daysAgo(6)),
    summary: 'State of X driver license, expires 08/2028.',
    previewText: [
      'STATE OF X DRIVER LICENSE',
      '────────────────────────────────',
      'DL  X1234567',
      'EXP 08/14/2028',
      'CLASS  D',
      '',
      'RODRIGUEZ, MARIA E',
      '4720 OAKWOOD AVE',
      'CITYVILLE, X 50010',
      '',
      'DOB  03/22/1988',
      'SEX  F   EYES  BRN   HGT  5-04',
    ].join('\n'),
  },
  {
    id: 'doc-002',
    caseId: 'default',
    name: 'PayStub_Acme_Logistics_Feb2026.pdf',
    type: 'income',
    ext: 'pdf',
    size: '218 KB',
    pages: 2,
    status: 'pending',
    uploadedBy: 'Maria Rodriguez (applicant)',
    uploadedAt: formatMDY(daysAgo(4)),
    summary: 'Biweekly pay stub from Acme Logistics, period ending 02/14/2026.',
    previewText: [
      'ACME LOGISTICS, INC.',
      'EARNINGS STATEMENT',
      '────────────────────────────────',
      'Employee  RODRIGUEZ, MARIA E',
      'Emp ID    47281',
      'Period    02/01/2026 - 02/14/2026',
      'Pay Date  02/19/2026',
      '',
      'Earnings        Hours      Amount',
      'Regular         80.00    1,840.00',
      'Overtime         3.50      120.75',
      '                       ──────────',
      'Gross Pay              1,960.75',
      'Federal Tax              -218.40',
      'Social Security          -121.57',
      'Medicare                  -28.43',
      'State Tax                 -76.42',
      '                       ──────────',
      'NET PAY                1,515.93',
    ].join('\n'),
  },
  {
    id: 'doc-003',
    caseId: 'default',
    name: 'Utility_Bill_StateXEnergy_March2026.pdf',
    type: 'residency',
    ext: 'pdf',
    size: '312 KB',
    pages: 1,
    status: 'pending',
    uploadedBy: 'Maria Rodriguez (applicant)',
    uploadedAt: formatMDY(daysAgo(3)),
    summary: 'State-X Energy bill addressed to 4720 Oakwood Ave.',
    previewText: [
      'STATE-X ENERGY',
      'CUSTOMER STATEMENT',
      '────────────────────────────────',
      'Account   77481-2',
      'Service   4720 OAKWOOD AVE',
      '          CITYVILLE, X 50010',
      'Period    02/10/2026 - 03/09/2026',
      '',
      'Electric usage      612 kWh',
      'Gas usage            38 therm',
      'Previous balance     0.00',
      'Current charges    142.18',
      '                ────────',
      'Total due          142.18',
      'Due date    03/28/2026',
    ].join('\n'),
  },
  {
    id: 'doc-004',
    caseId: 'default',
    name: 'Birth_Certificate_Aiden.pdf',
    type: 'household',
    ext: 'pdf',
    size: '498 KB',
    pages: 1,
    status: 'verified',
    uploadedBy: TEAM.sarah.name,
    uploadedAt: formatMDY(daysAgo(2)),
    summary: 'Certified copy of birth certificate for minor household member.',
    previewText: [
      'STATE OF X — DEPARTMENT OF VITAL RECORDS',
      'CERTIFICATE OF LIVE BIRTH',
      '────────────────────────────────',
      'Name       AIDEN J. RODRIGUEZ',
      'Born       11/02/2019',
      'Sex        Male',
      'County     Polk',
      '',
      'Mother     Maria E. Rodriguez',
      'Father     (not listed)',
      '',
      'Certified true copy issued 03/12/2026',
      'Registrar  K. Holloway',
    ].join('\n'),
  },
  {
    id: 'doc-005',
    caseId: 'default',
    name: 'SSA_Benefit_Verification_Letter.pdf',
    type: 'income',
    ext: 'pdf',
    size: '186 KB',
    pages: 1,
    status: 'rejected',
    uploadedBy: 'Maria Rodriguez (applicant)',
    uploadedAt: formatMDY(daysAgo(1)),
    summary: 'SSA letter — rejected: applies to a different household member.',
    previewText: [
      'SOCIAL SECURITY ADMINISTRATION',
      'BENEFIT VERIFICATION LETTER',
      '────────────────────────────────',
      'Date    March 4, 2026',
      'To      Robert J. Rodriguez',
      '        4720 Oakwood Ave',
      '        Cityville, X 50010',
      '',
      'You are entitled to a monthly benefit of',
      '$1,427.00 beginning January 2026.',
      '',
      'Keep this letter for your records.',
    ].join('\n'),
  },
  {
    id: 'doc-006',
    caseId: 'default',
    name: 'Medical_Necessity_Letter.pdf',
    type: 'medical',
    ext: 'pdf',
    size: '241 KB',
    pages: 2,
    status: 'pending',
    uploadedBy: 'UIHC Patient Portal (auto)',
    uploadedAt: formatMDY(daysAgo(1)),
    summary: 'Provider attestation supporting expedited eligibility review.',
    previewText: [
      'UNIVERSITY OF X HOSPITALS & CLINICS',
      'STATEMENT OF MEDICAL NECESSITY',
      '────────────────────────────────',
      'Patient   Maria E. Rodriguez',
      'DOB       03/22/1988',
      'MRN       4471823',
      '',
      'Dx        Type 2 diabetes (E11.9), uncontrolled',
      'Plan      Continue metformin 1000mg BID;',
      '          add basal insulin; A1C in 90 days.',
      '',
      'Patient requires uninterrupted Medicaid coverage to',
      'access ongoing endocrinology follow-up and insulin.',
      '',
      '— Dr. P. Anand, MD',
      '  Endocrinology, UIHC',
    ].join('\n'),
  },
];

/**
 * Per-case document fixtures. Keyed by the medicaidEeCases row id (the same
 * `caseId` the drawer is opened with). Each list is ordered by upload time
 * (newest first). When a case ID has no entry here, `documentsForCase()`
 * falls back to `DEFAULT_DOCUMENTS` so the drawer / WorkspacePage's modal
 * always renders something meaningful.
 *
 * Storyboard parity: src/data/case-documents.jsx :: `CASE_DOCUMENTS[caseId]`.
 * The storyboard's render-block shape is collapsed here into the existing
 * `previewText` (monospace ASCII) — the in-app DocumentViewer renders that
 * as paper-on-slate, which is the same low-fidelity treatment the storyboard
 * fell back to for documents without a structured `render` block.
 */
const CASE_DOCUMENTS: Record<string, CaseDocument[]> = {
  // Robert Mitchell — Non-MAGI ABD applicant (default L1 case fixture).
  // 5 docs span the Documents tab's filter buckets (Income, Identity, Medical,
  // RFI, Other) so each filter chip has at least one card to render.
  'IA-2026-045866': [
    {
      id: 'rj-doc-id',
      caseId: 'IA-2026-045866',
      name: 'State_Drivers_License_R_Mitchell.jpg',
      type: 'identity',
      ext: 'jpg',
      size: '1.2 MB',
      pages: 1,
      status: 'verified',
      uploadedBy: 'Robert D. Mitchell (applicant)',
      uploadedAt: formatMDY(daysAgo(17)),
      tags: ['required'],
      relatedTo: 'Identity verification',
      summary: 'State driver license — class C, expires 09-22-2029.',
      previewText: [
        'STATE DRIVER LICENSE',
        '────────────────────────────────',
        'DL       182KH4756',
        'CLASS    C',
        'EXP      09-22-2029',
        '',
        'MITCHELL, ROBERT DALE',
        '412 OAK STREET',
        'UNIVERSITY CITY, SX 00100',
        '',
        'DOB      09-22-1967',
        'SEX      M       HGT  5-10',
        'EYES     BRO     END  NONE',
        'REST     B (CORRECTIVE LENSES)',
        '',
        'Issued   09-22-2024',
      ].join('\n'),
    },
    {
      id: 'rj-doc-ssa-award',
      caseId: 'IA-2026-045866',
      name: 'SSA_Award_Letter_SSDI_2026.pdf',
      type: 'income',
      ext: 'pdf',
      size: '284 KB',
      pages: 2,
      status: 'verified',
      uploadedBy: 'Robert D. Mitchell (applicant)',
      uploadedAt: formatMDY(daysAgo(17)),
      tags: ['required'],
      relatedTo: 'Income verification (SSDI)',
      summary: 'SSA Title II disability benefit letter — $1,180/mo effective 01/2026.',
      previewText: [
        'SOCIAL SECURITY ADMINISTRATION',
        'Office of Central Operations · Baltimore, MD 21235',
        '────────────────────────────────',
        'Date    January 15, 2026',
        'To      Robert D. Mitchell',
        '        412 Oak Street',
        '        University City, SX 00200',
        '',
        'Subject  BNC# 14YJ-22HG-9PKR · Title II Disability',
        '',
        'Your monthly benefit amount effective January 2026 is',
        '$1,180.00. Benefits are paid on the third Wednesday of',
        'each month by direct deposit to the account ending in',
        '4421 at FIRST NATIONAL BANK.',
        '',
        'Medicare Parts A and B coverage is active effective',
        '06/01/2022 (24-month SSDI waiting period satisfied).',
        '',
        'Sincerely,',
        '  Mary E. Roland',
        '  Director, Disability Operations',
      ].join('\n'),
    },
    {
      id: 'rj-doc-bank-statement',
      caseId: 'IA-2026-045866',
      name: 'UniversityCU_Statement_Feb2026.pdf',
      type: 'income',
      ext: 'pdf',
      size: '264 KB',
      pages: 2,
      status: 'pending',
      uploadedBy: 'Robert D. Mitchell (applicant)',
      uploadedAt: formatMDY(daysAgo(13)),
      tags: ['asset', 'rfi'],
      relatedTo: 'Asset verification (RFI 03/13)',
      summary: 'Combined checking + savings statement — for asset RFI on 03/13/2026.',
      previewText: [
        'UNIVERSITY CREDIT UNION — STATEMENT',
        'Account ending 4421 · 02/01/2026 – 02/29/2026',
        '────────────────────────────────',
        'Account holder    ROBERT D MITCHELL',
        '',
        'Beginning balance       $1,795.18',
        'Deposits                +$1,184.86',
        'Withdrawals               -$1,140.00',
        'Ending balance          $1,840.04',
        '',
        '02/19  SSA SSDI Direct Deposit   +$1,180.00   $2,975.18',
        '02/22  ACH — Utility (energy)      -$142.18   $2,833.00',
        '02/24  ATM — Cash withdrawal       -$200.00   $2,633.00',
        '02/26  ACH — Rent (412 Oak)        -$795.00   $1,838.00',
        '02/28  Interest payment              +$4.86   $1,840.04',
      ].join('\n'),
    },
    {
      id: 'rj-doc-medical-cert',
      caseId: 'IA-2026-045866',
      name: 'Medical_Necessity_UH_Spine_Center.pdf',
      type: 'medical',
      ext: 'pdf',
      size: '241 KB',
      pages: 2,
      status: 'verified',
      uploadedBy: 'University Health (provider)',
      uploadedAt: formatMDY(daysAgo(16)),
      tags: ['disability', 'required'],
      relatedTo: 'Disability documentation',
      summary: 'Provider attestation supporting Non-MAGI ABD eligibility pathway.',
      previewText: [
        'UNIVERSITY HEALTH — SPINE CENTER',
        'STATEMENT OF MEDICAL NECESSITY',
        '────────────────────────────────',
        'Patient    Robert Dale Mitchell',
        'DOB        09-22-1967',
        'MRN        UH-3387-21',
        '',
        'Dx         Chronic lumbar radiculopathy (M54.16)',
        '           s/p L4-L5 fusion 11/2019',
        '',
        'Functional limitations: unable to sustain seated or',
        'standing posture > 30 minutes. Lifting restricted',
        'to < 10 lb. Patient meets SSA Listing 1.04.',
        '',
        'Recommended care: ongoing pain management,',
        'physical therapy 2x/wk, neurology follow-up q3mo.',
        '',
        '— Dr. Kenneth Whitfield, MD',
        '  University Health Spine Center',
      ].join('\n'),
    },
    {
      id: 'rj-doc-rfi-response',
      caseId: 'IA-2026-045866',
      name: 'RFI_Response_AssetClarification.pdf',
      type: 'other',
      ext: 'pdf',
      size: '98 KB',
      pages: 1,
      status: 'pending',
      uploadedBy: 'Robert D. Mitchell (applicant)',
      uploadedAt: formatMDY(daysAgo(2)),
      tags: ['rfi'],
      relatedTo: 'RFI 03/13 — asset clarification',
      summary: 'Applicant cover letter responding to the 03/13 asset RFI.',
      previewText: [
        'To:    Sarah Mitchell, County F caseworker',
        'From:  Robert D. Mitchell',
        'Re:    RFI 03/13/2026 — Asset Documentation',
        '────────────────────────────────',
        '',
        'I am submitting the requested two months of statements',
        'for both my checking and savings accounts at University',
        'Credit Union. The combined balance has been around $3,000',
        'because I keep a small reserve for medical co-pays and',
        'monthly rent.',
        '',
        'My only other holdings are my 2014 Honda Civic (used',
        'for medical transport — Dr. Whitfield is 14 miles away)',
        'and my modest household belongings. I have no retirement',
        'accounts, no investment accounts, and no real property.',
        '',
        'Please let me know if anything further is needed.',
        '',
        '— Robert D. Mitchell',
      ].join('\n'),
    },
  ],

  // Mathieu Lefevre — MAGI Other Adult applicant exercising the citizenship
  // Reasonable Opportunity Period (RAI) flow under 42 CFR §435.956(b). The
  // citizenship documents below are the artifacts referenced from the case's
  // `messages` thread in case-details.ts (msg-ml-003 RFA notice, msg-ml-004
  // beneficiary upload). Without this entry the Documents tab would fall back
  // to DEFAULT_DOCUMENTS during the CMS RAI walkthrough — a jarring context
  // switch given the demo is centrally about document submission.
  'IA-2026-046847': [
    {
      id: 'ml-doc-naturalization',
      caseId: 'IA-2026-046847',
      name: 'Certificate_of_Naturalization_N-550.pdf',
      type: 'identity',
      ext: 'pdf',
      size: '412 KB',
      pages: 1,
      status: 'verified',
      uploadedBy: 'Mathieu A. Lefevre (applicant)',
      uploadedAt: formatMDY(daysAgo(10)),
      tags: ['rfi', 'required'],
      relatedTo: 'Citizenship verification — RFA response',
      summary: 'Certificate of Naturalization (Form N-550) — closes the citizenship RAI loop.',
      previewText: [
        'DEPARTMENT OF HOMELAND SECURITY',
        'U.S. CITIZENSHIP AND IMMIGRATION SERVICES',
        '────────────────────────────────',
        'CERTIFICATE OF NATURALIZATION',
        '',
        'A-Number      A 218-XXX-XXX',
        'Cert. No.     N-550 / 21-7783-XXXX',
        'Issued        08-14-2019 · Capital City, SX',
        '',
        'Personal description of holder as of date of',
        'naturalization:',
        '  Name             MATHIEU ANTOINE LEFEVRE',
        '  Date of birth    11-30-1991',
        '  Country of birth Haiti',
        '  Sex              Male       Height  5-9',
        '',
        'Be it known that, pursuant to an application filed',
        'with the U.S. Citizenship and Immigration Services,',
        'the named person was admitted as a citizen of the',
        'United States of America at a ceremony held on the',
        'date and place shown above.',
        '',
        '— U.S. Citizenship and Immigration Services',
      ].join('\n'),
    },
    {
      id: 'ml-doc-photo-id',
      caseId: 'IA-2026-046847',
      name: 'State_Drivers_License_M_Lefevre.jpg',
      type: 'identity',
      ext: 'jpg',
      size: '198 KB',
      pages: 1,
      status: 'verified',
      uploadedBy: 'Mathieu A. Lefevre (applicant)',
      uploadedAt: formatMDY(daysAgo(10)),
      tags: ['required'],
      relatedTo: 'Identity verification — submitted with citizenship docs',
      summary: 'REAL ID compliant state driver license — supports identity match for the naturalization cert.',
      previewText: [
        'STATE DRIVER LICENSE  ★ REAL ID',
        '────────────────────────────────',
        'DL       227MK0488',
        'CLASS    C',
        'EXP      11-30-2031',
        '',
        'LEFEVRE, MATHIEU ANTOINE',
        '2204 ELMWOOD TERRACE APT 6',
        'CEDAR RIDGE, SX 00227',
        '',
        'DOB      11-30-1991',
        'SEX      M       HGT  5-9',
        'EYES     BRO     END  NONE',
        '',
        'Issued   11-30-2023',
      ].join('\n'),
    },
    {
      id: 'ml-doc-rfa-cover',
      caseId: 'IA-2026-046847',
      name: 'Form_A-3500_Citizenship_Cover_Sheet.pdf',
      type: 'other',
      ext: 'pdf',
      size: '156 KB',
      pages: 1,
      status: 'verified',
      uploadedBy: 'State HHS — County F',
      uploadedAt: formatMDY(daysAgo(24)),
      tags: ['rfi'],
      relatedTo: 'RFA 02/19 — Citizenship Documentation Request (42 CFR §435.956(b))',
      summary: 'Agency-issued RFA cover sheet listing acceptable citizenship documents and ROP deadline.',
      previewText: [
        'State HHS — Member Services',
        'Form A-3500 · Citizenship Documentation Cover Sheet',
        '────────────────────────────────',
        'Case      IA-2026-046847',
        'Applicant Mathieu A. Lefevre',
        'Issued    02-19-2026',
        'Deadline  05-20-2026 (90-day ROP)',
        '',
        'AUTHORITY: 42 CFR §435.956(b) — Reasonable',
        'Opportunity Period for citizenship verification.',
        '',
        'ACCEPTABLE DOCUMENTS (provide ONE):',
        '  • Certificate of Naturalization (N-550 / N-570)',
        '  • Certificate of Citizenship (N-560 / N-561)',
        '  • U.S. Passport (current or expired)',
        '  • REAL ID + birth certificate',
        '',
        'Your application will not be denied for citizenship',
        'during the Reasonable Opportunity Period. Reply via',
        'the Self-Service Portal, mail, or call (515) 555-0100.',
      ].join('\n'),
    },
  ],
};

/**
 * Return the document list for a given case ID. Falls back to
 * `DEFAULT_DOCUMENTS` (the generic Maria Rodriguez fixture set) when
 * the case ID has no per-case fixture — keeps the demo resilient when
 * the drawer or modal is opened on a case the fixtures don't cover yet.
 *
 * Returns shallow clones so callers can mutate (e.g. status overrides
 * by the drawer's DocumentsTab) without contaminating the module-
 * level fixture map.
 */
export function documentsForCase(caseId: string): CaseDocument[] {
  const list = CASE_DOCUMENTS[caseId] ?? DEFAULT_DOCUMENTS;
  return list.map((d) => ({ ...d }));
}
