/**
 * deriveCaseDetail — maps a live EECase (from GET_EE_CASE_QUERY) to the
 * CaseDetailFixture shape consumed by the drawer's tab components.
 *
 * Data sources by section:
 *   Identity / Contact — determinations[].person (PersonRecord from identity-service)
 *   Household          — intakeData.householdMembers (names/DOBs captured at submission)
 *   Programs / Income  — intakeData
 *   Disability/Coverage/Employment — intakeData.applicant flags
 *   Signature          — case.id + intakeData.applicationDate
 *
 * Fields not captured by any backend source (gender, marital status,
 * immigration, race/ethnicity, assets, detailed employment) render as DASH.
 * Messages and narrative are left empty — those tabs have their own data paths.
 */

import type { EECase } from '../types/ee';
import type { AssetRow, CaseDetailFixture } from '../data/case-details';
import {
  isNonMagiCase,
  ABD_ASSET_DEFS,
  abdLimitForHousehold,
  formatAbdNote,
  readCitizenEnteredCountableResources,
  SSDI_SOURCE_LABEL,
  SSI_SOURCE_LABEL,
} from './ee-utils';
import { caseDisplayNumber, DASH } from './utils';

export const NO_COUNTABLE_RESOURCES_NOTE = 'No countable resources reported.';
export const FEDERAL_HUB_MATCH_SUB = 'Federal hub match — confirmed';

function fullName(first: string | null | undefined, last: string | null | undefined): string {
  return [first, last].filter(Boolean).join(' ') || DASH;
}

function formatAddress(
  addr:
    | {
        street?: string | null;
        city?: string | null;
        state?: string | null;
        zip?: string | null;
      }
    | null
    | undefined,
): string {
  if (!addr) return DASH;
  const line1 = addr.street ?? '';
  const line2 = [addr.city, addr.state].filter(Boolean).join(', ');
  const zip = addr.zip ?? '';
  return [line1, line2, zip].filter(Boolean).join(' ') || DASH;
}

function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const parts = iso.slice(0, 10).split('-');
  if (parts.length !== 3) return iso;
  const [year, month, day] = parts;
  return `${month}/${day}/${year}`;
}

function calcAge(dob: string | null | undefined): number {
  if (!dob) return 0;
  const parts = dob.slice(0, 10).split('-');
  if (parts.length !== 3) return 0;
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return 0;
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return Math.max(0, age);
}

function formatCitizenship(status: string): string {
  const MAP: Record<string, string> = {
    us_citizen: 'U.S. Citizen',
    us_national: 'U.S. National',
    lawful_permanent_resident: 'Lawful Permanent Resident',
    qualified_non_citizen: 'Qualified Non-Citizen',
  };
  return (MAP[status] ?? status) || DASH;
}

// Must match intakeApplicantSchema employmentStatus enum in medicaid-ee-service.
// Mirrored from EMPLOYMENT_STATUS_EMPLOYED in cms-demo/resident/wizard-constants.ts
// (not imported cross-app to avoid coupling admin → resident build graph).
const EMPLOYMENT_STATUS_EMPLOYED = 'employed' as const;

function formatEmploymentStatus(status: string): string {
  const MAP: Record<string, string> = {
    [EMPLOYMENT_STATUS_EMPLOYED]: 'Yes (Employed)',
    employed_full_time: 'Yes (Full-Time)',
    employed_part_time: 'Yes (Part-Time)',
    self_employed: 'Yes (Self-Employed)',
    unemployed: 'No',
    retired: 'Retired',
    student: 'Student',
  };
  return (MAP[status] ?? status) || DASH;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '');
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0);
}

export function deriveCaseDetail(eeCase: EECase): CaseDetailFixture {
  // Primary applicant: HEAD household member matched to their determination by personId.
  // Mirrors CaseHeader's findPersonRecord + getApplicant pattern so all surfaces
  // agree on who the applicant is regardless of determination array order.
  const headMember = eeCase.household.members.find((m) => m.role === 'HEAD') ?? eeCase.household.members[0];
  const headPersonId = headMember?.person?.personId ?? null;
  const applicantDet =
    (headPersonId
      ? eeCase.determinations.find((d) => d.person?.personId === headPersonId)
      : eeCase.determinations.find((d) => d.person !== null)) ?? null;
  const person = applicantDet?.person ?? null;

  const intake = (eeCase.intakeData ?? {}) as Record<string, unknown>;
  const applicant = (intake.applicant ?? {}) as Record<string, unknown>;
  // displayMeta mirrors what the citizen saw / entered at submission time
  // (case number, SSN). It is the authoritative source for self-service cases
  // where the backend caseNumber column is null and the federated PersonRecord
  // is not yet populated (ENG-1476). See cms-demo/resident build-intake-data.ts.
  const displayMeta = (intake.displayMeta ?? {}) as Record<string, unknown>;
  const intakeMembers = Array.isArray(intake.householdMembers)
    ? (intake.householdMembers as Array<Record<string, unknown>>)
    : [];

  // ── Identity ──────────────────────────────────────────────────────────────
  // person (PersonRecord) is null until personPolicyId is written (deferred,
  // ENG-1476). Fall back to intakeData.householdMembers[0] for name and DOB.
  const primaryMember =
    intakeMembers.find((m) => str(m.relationship).toLowerCase() === 'self') ?? intakeMembers[0] ?? null;
  const identity: CaseDetailFixture['identity'] = {
    fullName: fullName(
      person?.firstName ?? str(primaryMember?.firstName),
      person?.lastName ?? str(primaryMember?.lastName),
    ),
    dob: formatIsoDate(person?.dateOfBirth ?? str(primaryMember?.dateOfBirth)),
    // ENG-1913: prefer the citizen-entered SSN persisted on displayMeta (full,
    // so maskSSN() in the tab derives the last 4); fall back to the identity-
    // service ssnLast4, then DASH. Never synthesise an SSN from the case id.
    ssn: (typeof displayMeta.ssn === 'string' ? displayMeta.ssn : null) ?? person?.ssnLast4 ?? DASH,
    gender: str(applicant.gender) || DASH,
    maritalStatus: str(applicant.maritalStatus) || DASH,
    citizenship: formatCitizenship(str(applicant.citizenshipStatus)),
    immigration: str(applicant.immigration) || DASH,
    raceEthnicity: str(applicant.raceEthnicity) || DASH,
  };

  // ── Contact ───────────────────────────────────────────────────────────────
  // Same fallback — person is null until ENG-1476.
  const intakeAddress = (primaryMember?.address ?? null) as {
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  } | null;
  const primaryAddress = person?.addresses?.[0] ?? intakeAddress;
  const contact: CaseDetailFixture['contact'] = {
    homeAddress: formatAddress(primaryAddress),
    mailingAddress: formatAddress(primaryAddress),
    phone: (person?.phones?.[0]?.value ?? str(primaryMember?.phone)) || DASH,
    email: (person?.emails?.[0]?.value ?? str(primaryMember?.email)) || DASH,
    preferredContact: DASH,
    primaryLanguage: person?.preferredLanguage ?? DASH,
    interpreterNeeded: DASH,
    accessibilityNeeds: DASH,
  };

  // ── Household ─────────────────────────────────────────────────────────────
  // intakeData.householdMembers has names/DOBs/relationships captured at submission.
  // Fall back to household.members for role/relationship when intakeData is absent.
  const members: CaseDetailFixture['household']['members'] =
    intakeMembers.length > 0
      ? intakeMembers.map((m) => ({
          name: fullName(str(m.firstName), str(m.lastName)),
          relation: str(m.relationship) || 'Unknown',
          age: calcAge(str(m.dateOfBirth)),
          dob: formatIsoDate(str(m.dateOfBirth)),
        }))
      : eeCase.household.members.map((m) => ({
          name: DASH,
          relation: m.relationshipToHead ?? m.role,
          age: 0,
          dob: DASH,
        }));

  const fplPct = num(intake.federalPovertyLevelPercent);
  const monthlyIncome = num(intake.monthlyHouseholdIncome);
  const householdNote =
    fplPct > 0
      ? `${fplPct}% FPL · Monthly household income: $${monthlyIncome.toLocaleString()}`
      : monthlyIncome > 0
        ? `Monthly household income: $${monthlyIncome.toLocaleString()}`
        : '';

  const household: CaseDetailFixture['household'] = {
    count: members.length,
    members,
    note: householdNote,
  };

  // ── Programs ──────────────────────────────────────────────────────────────
  const requested = str(intake.requestedProgram).toLowerCase();
  const programs: CaseDetailFixture['programs'] = [
    { prog: 'Medicaid', checked: requested.includes('medicaid'), note: '' },
    { prog: 'SNAP', checked: requested.includes('snap'), note: '' },
    { prog: 'TANF / FIP', checked: requested.includes('tanf') || requested.includes('fip'), note: '' },
    { prog: 'WIC', checked: requested.includes('wic'), note: '' },
  ];

  // ── Income ────────────────────────────────────────────────────────────────
  const isPrimaryReceivingSSDI = applicant.receivingSSDI === true;
  const isPrimaryReceivingSSI = applicant.receivingSSI === true;

  type IncomeRow = CaseDetailFixture['income']['rows'][number];
  const incomeRows: IncomeRow[] = intakeMembers.flatMap((m, idx): IncomeRow[] => {
    const inc = (m.income ?? {}) as Record<string, unknown>;
    const memberName = fullName(str(m.firstName), str(m.lastName));
    const rel = str(m.relationship).toLowerCase();
    const isPrimary = rel === 'self' || (!rel && idx === 0);
    const rows: IncomeRow[] = [];
    const employment = num(inc.employmentIncome);
    const other = num(inc.otherIncome);
    if (employment > 0) {
      rows.push({
        source: memberName,
        sub: str(m.relationship) || 'Self',
        type: 'Employment',
        freq: 'Monthly',
        amount: `$${employment.toLocaleString()}`,
        monthly: `$${employment.toLocaleString()}`,
      });
    }
    if (other > 0) {
      // TODO(ENG-1877): demo simplification — the entire `otherIncome` amount is
      // labelled as SSDI/SSI whenever the applicant flag is set. In a real eligibility
      // scenario `otherIncome` may mix SSDI with other unearned income sources; each
      // source would need its own income-type breakdown rather than a single row.
      if (isPrimary && isPrimaryReceivingSSDI) {
        rows.push({
          source: SSDI_SOURCE_LABEL,
          sub: FEDERAL_HUB_MATCH_SUB,
          type: 'Unearned',
          freq: 'Monthly',
          amount: `$${other.toLocaleString()}`,
          monthly: `$${other.toLocaleString()}`,
        });
      } else if (isPrimary && isPrimaryReceivingSSI) {
        rows.push({
          source: SSI_SOURCE_LABEL,
          sub: FEDERAL_HUB_MATCH_SUB,
          type: 'Unearned',
          freq: 'Monthly',
          amount: `$${other.toLocaleString()}`,
          monthly: `$${other.toLocaleString()}`,
        });
      } else {
        rows.push({
          source: memberName,
          sub: 'Other',
          type: 'Other Income',
          freq: 'Monthly',
          amount: `$${other.toLocaleString()}`,
          monthly: `$${other.toLocaleString()}`,
        });
      }
    }
    return rows;
  });

  const income: CaseDetailFixture['income'] = {
    rows:
      incomeRows.length > 0
        ? incomeRows
        : [{ source: 'No income reported', sub: '', type: '', freq: '', amount: DASH, monthly: DASH }],
    total: monthlyIncome > 0 ? `$${monthlyIncome.toLocaleString()}` : DASH,
  };

  // ── Disability ────────────────────────────────────────────────────────────
  const isDisabled = applicant.isDisabled === true;
  const disability: CaseDetailFixture['disability'] = isDisabled
    ? {
        claimed: 'Yes',
        type: DASH,
        ssdiStart: applicant.receivingSSI === true ? 'SSI active' : DASH,
        physician: DASH,
        certStatus: DASH,
        ltc: DASH,
        nursingHome: DASH,
        medicare: applicant.hasMedicare === true ? 'Yes' : 'No',
        ddsReferralSent: false,
        ddsStatus: 'pending',
      }
    : null;

  // ── Coverage ──────────────────────────────────────────────────────────────
  const hasMedicare = applicant.hasMedicare === true;
  const coverage: CaseDetailFixture['coverage'] = {
    hasInsurance: hasMedicare ? 'Yes' : 'No',
    planName: hasMedicare ? 'Medicare' : DASH,
    policyId: DASH,
    coverageType: hasMedicare ? 'Medicare' : DASH,
    premium: DASH,
    effectiveDate: DASH,
    employerSponsored: 'No',
    spouseParentCoverage: DASH,
  };

  // ── Employment ────────────────────────────────────────────────────────────
  const employment: CaseDetailFixture['employment'] = {
    currentlyEmployed: formatEmploymentStatus(str(applicant.employmentStatus)),
    employer: DASH,
    employmentType: DASH,
    startDate: DASH,
    workExemption: DASH,
    exemptionBasis: DASH,
    ihawpThreshold: DASH,
    volunteerTraining: DASH,
  };

  // ── Signature ─────────────────────────────────────────────────────────────
  const appDate = str(intake.applicationDate) || eeCase.createdAt.slice(0, 10);
  const signature: CaseDetailFixture['signature'] = {
    // ENG-1912: show the SAME case number the citizen saw. caseDisplayNumber
    // prefers the canonical SX-… identifier persisted on displayMeta, then the
    // backend caseNumber column (seeded cases set it), then the case id tail.
    applicationId: caseDisplayNumber(eeCase),
    submissionMethod: 'Self-Service Portal',
    submitted: appDate,
    ipAddress: DASH,
    electronicSignature: 'Yes',
    rrAcknowledged: 'Yes',
    penaltyClause: 'Acknowledged',
    authorizedRep: 'N/A',
  };

  // ── Assets ────────────────────────────────────────────────────────────────
  // Only applicable to Non-MAGI ABD cases. nonMagiResources is forwarded per
  // member from build-intake-data.ts (ENG-1877). Each entry mirrors the
  // RESOURCE_DEFAULTS shape from screens-nonmagi.tsx.
  const isNonMagi = isNonMagiCase(applicant, eeCase.determinations);

  let assets: CaseDetailFixture['assets'] = null;
  if (isNonMagi) {
    // Countable total comes from the shared selector so Verify, Evaluate, and this
    // drawer read one source of truth (ENG-1914). The flatMap below builds the
    // display rows only (including exempt rows, which the countable total excludes).
    const countableTotal = readCitizenEnteredCountableResources(eeCase);
    const assetRows: AssetRow[] = intakeMembers.flatMap((m): AssetRow[] => {
      const res = (m.nonMagiResources ?? {}) as Record<string, unknown>;
      const memberName = fullName(str(m.firstName), str(m.lastName));
      return ABD_ASSET_DEFS.flatMap((def): AssetRow[] => {
        if (res[def.hasKey] !== true) return [];
        const raw = str(res[def.amountKey]);
        const amount = parseFloat(raw.replace(/[^0-9.]/g, '')) || 0;
        if (amount <= 0) return [];
        return [
          {
            asset: def.label,
            inst: memberName,
            value: `$${amount.toLocaleString()}`,
            countable: def.exempt ? 'Exempt' : 'Yes',
          },
        ];
      });
    });
    const householdSizeForLimit = num(intake.householdSize) || 1;
    // TODO(ENG-1877): demo simplification — two shortcuts worth noting for a real
    // eligibility scenario:
    // 1. The $3,000 limit is the married-couple limit; any 2-person household gets it
    //    here, but a disabled applicant + a non-applying child should be $2,000.
    // 2. `countableTotal` sums resources across all members against a single limit,
    //    but ABD asset limits apply per-individual ($2k) or per-couple ($3k), not as
    //    a household aggregate.
    const abdLimit = abdLimitForHousehold(householdSizeForLimit);
    const note = assetRows.length > 0 ? formatAbdNote(countableTotal, abdLimit) : NO_COUNTABLE_RESOURCES_NOTE;
    assets = { rows: assetRows, note };
  }

  return {
    applied: appDate,
    identity,
    contact,
    household,
    programs,
    income,
    assets,
    disability,
    coverage,
    employment,
    signature,
    // Messages and narrative come from their own data sources (NoticesMessagesTab
    // has no real backend yet; ActivityLogTab uses its own auditLog query).
    messages: [],
    narrative: { assignedTo: DASH, entries: [] },
  };
}
