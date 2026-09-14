/**
 * Builds the `intakeData` payload for `createMedicaidEeCase` from the
 * wizard's `FormDataContext.data`.
 *
 * Required by the medicaid-ee resolver's `intakeApplicantSchema` (see
 * `services/medicaid-ee-service/src/types/intake-data.ts`):
 *
 *   { applicant: { dateOfBirth, householdSize, annualIncome, citizenshipStatus,
 *     isPregnant?, isDisabled?, receivingSSI?, receivingSSDI?, employmentStatus?,
 *     hasMedicare?, isPostpartum?, postpartumMonthsElapsed?, stateOfResidence? } }
 *
 * `intakeDataSchema` uses `.passthrough()`, so additional caseworker-display
 * fields (applicantName, householdMembers, monthlyHouseholdIncome, ...) are
 * stored verbatim alongside the required `applicant` block — match the seed
 * shape in `services/medicaid-ee-service/scripts/seed-ee-cases.ts` so the
 * admin case-workspace can render the same way a seeded case renders.
 */

import { lookupFPL } from './eligibility';
import { formatSSN } from '../lib/ssn';
import {
  PRIMARY_APPLICANT_ID,
  INCOME_TYPE_SSI,
  INCOME_TYPE_SSDI,
  EMPLOYMENT_STATUS_EMPLOYED,
} from './wizard-constants';
import type {
  WizardFormData,
  PrimaryApplicant,
  Job,
  OtherIncome,
  CitizenshipEntry,
  HealthInsuranceEntry,
  IntakeCitizenshipStatus,
  IntakeMember,
  IntakeDisplayMeta,
  IntakeDataPayload,
  IntakeIdentityVerification,
} from './form-data.types';

// ENG-1912: the State-X (SX) citizen-facing case number. The medicaid-ee-service
// does not assign a human-readable case number to self-service submissions (the
// `caseNumber` column stays null), so the citizen-generated number is the canonical
// identifier and must be persisted in intakeData where BOTH apps can read it. The
// suffix is derived from a stable seed (applicantPersonId + applicationDate) rather
// than Math.random(), so re-deriving the intake for the same submission yields the
// same number — the confirmation screen and the caseworker case view never diverge.
export function generateCaseNumber(applicationDate: string, seed: string): string {
  const [year, month, day] = applicationDate.split('-');
  let hash = 0;
  const basis = `${seed}|${applicationDate}`;
  for (let i = 0; i < basis.length; i++) {
    hash = (hash * 31 + basis.charCodeAt(i)) >>> 0;
  }
  const suffix = String((hash % 90000) + 10000); // always 5 digits, 10000–99999
  return `SX-${year}-${month}${day}-${suffix}`;
}

// State-X tenant state code (matches context.tsx CMS_DEMO_STATE and the
// server's VERIFY_ASSIST_TENANT_STATE).
const DEMO_STATE_CODE = 'SX';

/** Mirror `primaryApplicant.identityVerification` into the intake shape, or
 * undefined when the applicant did not verify with CLEAR. */
export function intakeIdentityVerification(primary: PrimaryApplicant): IntakeIdentityVerification | undefined {
  const iv = primary?.identityVerification;
  if (!iv || iv.status !== 'success' || !iv.id) return undefined;
  return {
    id: iv.id,
    provider: 'CLEAR',
    status: 'success',
    verifiedFields: Array.isArray(iv.verifiedFields) ? [...iv.verifiedFields] : [],
    ssnLast4: iv.ssnLast4 ?? null,
    verifiedAt: iv.verifiedAt,
  };
}

type Frequency = 'hourly' | 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly' | 'annually' | string;

function monthlyFromJob(job: Job): number {
  if (typeof job?.monthlyIncome === 'number' && Number.isFinite(job.monthlyIncome)) {
    return job.monthlyIncome;
  }
  const rate = parseFloat(job?.payRate ?? '') || 0;
  const hrs = parseFloat(job?.hoursPerWeek ?? '') || 0;
  const freq: Frequency = (job?.payFrequency ?? '').toLowerCase();
  switch (freq) {
    case 'hourly':
      return (rate * hrs * 52) / 12;
    case 'weekly':
      return (rate * 52) / 12;
    case 'biweekly':
    case 'bi-weekly':
      return (rate * 26) / 12;
    case 'semimonthly':
    case 'semi-monthly':
      return rate * 2;
    case 'monthly':
      return rate;
    case 'quarterly':
      return rate / 3;
    case 'annually':
    case 'annual':
    case 'yearly':
      return rate / 12;
    default:
      return 0;
  }
}

function monthlyFromOtherIncome(entry: OtherIncome): number {
  const amount = parseFloat(entry?.amount ?? '') || 0;
  const freq: Frequency = (entry?.frequency ?? '').toLowerCase();
  switch (freq) {
    case 'weekly':
      return (amount * 52) / 12;
    case 'biweekly':
    case 'bi-weekly':
      return (amount * 26) / 12;
    case 'semimonthly':
    case 'semi-monthly':
      return amount * 2;
    case 'monthly':
    case '':
      return amount;
    case 'quarterly':
      return amount / 3;
    case 'annually':
    case 'annual':
    case 'yearly':
      return amount / 12;
    default:
      return amount;
  }
}

function jobsForPerson(jobs: Record<string, Job[]> | undefined, personKey: string): Job[] {
  return Array.isArray(jobs?.[personKey]) ? jobs[personKey] : [];
}

function memberRelationshipForIntake(raw: string | undefined): string {
  if (!raw) return 'Other';
  const r = raw.toLowerCase();
  if (r === 'spouse' || r === 'spouse/domestic partner') return 'Spouse';
  if (r === 'child') return 'Child';
  if (r === 'son') return 'Son';
  if (r === 'daughter') return 'Daughter';
  // Title-case fallback
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// Runtime allow-list for the citizenship status. `satisfies` makes tsc error if
// any literal here drifts from the IntakeCitizenshipStatus union (e.g. a typo, or
// a value the union no longer permits) — the common accident when the union and
// this list fall out of sync.
const CITIZENSHIP_STATUS_ALLOWED = [
  'us_citizen',
  'lawful_permanent_resident',
  'qualified_noncitizen',
  'nonqualified_noncitizen',
  'undocumented',
] as const satisfies readonly IntakeCitizenshipStatus[];

// Citizenship is captured per applying person, keyed by recipient id in
// `data.citizenship` ('0' = primary applicant, member.id = each member).
function citizenshipStatusForKey(data: WizardFormData, key: string): IntakeCitizenshipStatus {
  const status = data?.citizenship?.[key]?.status;
  if (typeof status === 'string' && CITIZENSHIP_STATUS_ALLOWED.includes(status as IntakeCitizenshipStatus))
    return status as IntakeCitizenshipStatus;
  return 'us_citizen';
}

function inferCitizenshipStatus(data: WizardFormData): IntakeCitizenshipStatus {
  return citizenshipStatusForKey(data, PRIMARY_APPLICANT_ID);
}

function inferEmploymentStatus(jobs: WizardFormData['jobs']): 'employed' | 'unemployed' | 'self_employed' | undefined {
  if (!jobs) return undefined;
  const all = Object.values(jobs).flat();
  if (all.length === 0) return 'unemployed';
  if (all.some((j) => j?.selfEmployed)) return 'self_employed';
  return EMPLOYMENT_STATUS_EMPLOYED;
}

// SS income is captured per recipient id, so these flags must filter on a
// specific person's recipient id. Without the filter, a household member's
// SSDI/SSI entry would falsely set another person's BRE flag and route them
// to Non-MAGI. '0' = primary applicant; member.id = each household member.
function receivingSSIForKey(data: WizardFormData, key: string): boolean {
  const other = Array.isArray(data?.otherIncome) ? data.otherIncome : [];
  return other.some((e) => e?.recipient === key && (e?.type ?? e?.kind ?? '').toLowerCase() === INCOME_TYPE_SSI);
}

function inferReceivingSSI(data: WizardFormData): boolean {
  return receivingSSIForKey(data, PRIMARY_APPLICANT_ID);
}

function inferReceivingSSDI(data: WizardFormData): boolean {
  const other = Array.isArray(data?.otherIncome) ? data.otherIncome : [];
  return other.some(
    (e) => e?.recipient === PRIMARY_APPLICANT_ID && (e?.type ?? e?.kind ?? '').toLowerCase() === INCOME_TYPE_SSDI,
  );
}

// Per-person Medicare: health insurance is keyed by recipient id, so a member's
// (or the primary's, key '0') own entry decides their flag.
function hasMedicareForKey(healthInsurance: WizardFormData['healthInsurance'], key: string): boolean {
  const e = healthInsurance?.[key];
  return !!e && (e?.insuranceType ?? '').toLowerCase().includes('medicare');
}

function inferIsPregnant(data: WizardFormData): boolean {
  if (data?.primaryApplicant?.pregnant === true) return true;
  if (data?.demographics?.pregnant === true) return true;
  return false;
}

// The PRIMARY applicant's own disability — the demographics step captures it for
// the applicant only, so a dependent's `hasDisability` must not set the primary's
// flag (per-member disability is read from each member's own `hasDisability`).
function primaryIsDisabled(data: WizardFormData): boolean {
  return data?.demographics?.disability === true || data?.demographics?.disability === 'yes';
}

export interface BuildIntakeDataInput {
  /** Wizard FormDataContext.data */
  data: WizardFormData;
  /** Identity-service personId for the primary applicant (auth-store.id) */
  applicantPersonId?: string | null;
  /** Member id → identity-service personId map (cached by useWireHousehold) */
  memberPersonIds?: Record<string, string>;
}

export function buildIntakeData(input: BuildIntakeDataInput): IntakeDataPayload {
  const { data, applicantPersonId, memberPersonIds } = input;
  const primary: PrimaryApplicant = data?.primaryApplicant ?? {};
  const members = Array.isArray(data?.householdMembers) ? data.householdMembers : [];

  // ── Income ────────────────────────────────────────────────────────────────
  const jobs: Record<string, Job[]> = data?.jobs ?? {};
  // Primary jobs live under key '0' in INITIAL_FORM. Members can have their own keys.
  let monthlyTotal = 0;
  const primaryJobsMonthly = jobsForPerson(jobs, '0').reduce((sum, j) => sum + monthlyFromJob(j), 0);
  monthlyTotal += primaryJobsMonthly;

  const memberJobMonthlyById: Record<string, number> = {};
  for (const m of members) {
    const key = m?.id || '';
    const mm = jobsForPerson(jobs, key).reduce((sum, j) => sum + monthlyFromJob(j), 0);
    memberJobMonthlyById[key] = mm;
    monthlyTotal += mm;
  }

  const otherIncomeArr = Array.isArray(data?.otherIncome) ? data.otherIncome : [];
  const otherIncomeMonthly = otherIncomeArr.reduce((sum: number, e) => sum + monthlyFromOtherIncome(e), 0);
  monthlyTotal += otherIncomeMonthly;

  const monthlyHouseholdIncome = Math.round(monthlyTotal * 100) / 100;
  const annualIncome = Math.round(monthlyHouseholdIncome * 12 * 100) / 100;

  // ── Household size + FPL ─────────────────────────────────────────────────
  const householdSize = Math.max(1, 1 + members.length);
  const fplAnnual = lookupFPL(householdSize);
  const federalPovertyLevelPercent = fplAnnual > 0 ? Math.round((annualIncome / fplAnnual) * 1000) / 10 : 0;
  // 138% FPL monthly is the MAGI eligibility threshold (133% + 5% disregard).
  // federalPovertyLevelThreshold is displayed in CaseAssist as "under the $X/mo threshold".
  const fplMonthly = Math.round((fplAnnual * 1.38) / 12);

  // ── Health insurance per applying person (any insurance = hasInsurance) ───
  const healthIns: Record<string, HealthInsuranceEntry> = data?.healthInsurance ?? {};
  function hasInsuranceFor(key: string): boolean {
    const e = healthIns?.[key];
    return !!e && e.hasInsurance === 'yes' && !e.skipped;
  }

  // ── Members rich shape (caseworker display) ───────────────────────────────
  const intakeMembers: IntakeMember[] = [];

  const citizenship: Record<string, CitizenshipEntry> = data?.citizenship ?? {};

  const streetParts = [primary.streetAddress, primary.aptUnit].filter(Boolean).join(' ');
  intakeMembers.push({
    personId: applicantPersonId ?? null,
    firstName: primary.firstName ?? '',
    lastName: primary.lastName ?? '',
    dateOfBirth: primary.dob || undefined,
    relationship: 'Self',
    address: {
      street: streetParts || null,
      city: primary.city || null,
      state: primary.state || null,
      zip: primary.zip || null,
    },
    phone: primary.phone || null,
    email: primary.email || null,
    tribalMember: citizenship['0']?.tribalMember ?? null,
    tribeName: citizenship['0']?.tribalMember ? (citizenship['0']?.tribeName ?? '') : '',
    income: {
      employmentIncome: Math.round(primaryJobsMonthly * 100) / 100,
      selfEmploymentIncome: 0,
      otherIncome: Math.round(otherIncomeMonthly * 100) / 100,
      totalMonthly: Math.round((primaryJobsMonthly + otherIncomeMonthly) * 100) / 100,
    },
    hasInsurance: hasInsuranceFor('0'),
    nonMagiResources: data?.nonMagiResources?.['0'] ?? null,
    // Per-applicant BRE attributes (ENG-1865 follow-up) — like every household
    // member below, the primary's entry reflects its OWN per-person flags
    // (keyed to recipient id '0'), not a household-wide scan, so a dependent's
    // disability/Medicare never bleeds onto the primary's display entry. The
    // separate `applicant` block (the BRE input) is unchanged.
    citizenshipStatus: inferCitizenshipStatus(data),
    isPregnant: inferIsPregnant(data),
    isDisabled: primaryIsDisabled(data),
    receivingSSI: inferReceivingSSI(data),
    hasMedicare: hasMedicareForKey(healthIns, PRIMARY_APPLICANT_ID),
  });

  for (const m of members) {
    const memberKey = m?.id || '';
    const memberMonthly = memberJobMonthlyById[memberKey] ?? 0;
    const memberCz = citizenship[memberKey] ?? {};
    intakeMembers.push({
      personId: memberPersonIds?.[memberKey] ?? null,
      firstName: m?.firstName ?? '',
      lastName: m?.lastName ?? '',
      dateOfBirth: m?.dob || undefined,
      relationship: memberRelationshipForIntake(m?.relationship),
      tribalMember: memberCz.tribalMember ?? null,
      tribeName: memberCz.tribalMember ? (memberCz.tribeName ?? '') : '',
      income: {
        employmentIncome: Math.round(memberMonthly * 100) / 100,
        selfEmploymentIncome: 0,
        otherIncome: 0,
        totalMonthly: Math.round(memberMonthly * 100) / 100,
      },
      hasInsurance: hasInsuranceFor(memberKey),
      nonMagiResources: data?.nonMagiResources?.[memberKey] ?? null,
      // Per-member BRE attributes (ENG-1865 follow-up) — each member is evaluated
      // with its OWN citizenship/health flags, not the primary's. Pregnancy is
      // not collected per member in the V0 wizard, so non-primary members are
      // false (previously they implicitly inherited the primary's value).
      citizenshipStatus: citizenshipStatusForKey(data, memberKey),
      isPregnant: false,
      isDisabled: m?.hasDisability === true,
      receivingSSI: receivingSSIForKey(data, memberKey),
      hasMedicare: hasMedicareForKey(healthIns, memberKey),
    });
  }

  // ── displayMeta (caseworker-portal mirror, ENG-1912 / ENG-1913) ────────────
  // displayMeta is the persisted, both-app-readable channel the admin portal
  // reads for the case number and the applicant SSN. Writing the citizen's own
  // values here keeps the caseworker view in lockstep with what the citizen saw
  // and entered, instead of letting each app synthesise its own fallback.
  const applicationDate = new Date().toISOString().slice(0, 10);
  const caseNumber = generateCaseNumber(applicationDate, applicantPersonId ?? primary.email ?? 'guest');
  // Full SSN (formatted) so the admin's SensitiveValue/maskSSN can derive the
  // last 4; omitted entirely when the applicant declared no SSN.
  const primarySsnDigits = primary.noSSN ? '' : (primary.ssn ?? '').replace(/\D/g, '');
  const displayMeta: IntakeDisplayMeta = { caseNumber };
  if (primarySsnDigits.length > 0) {
    displayMeta.ssn = formatSSN(primarySsnDigits);
  }
  // CLEAR identity verification (Verify Assist handoff on the personal step).
  // Written under BOTH `applicant` (BRE/intake block) and `displayMeta` (the
  // channel the caseworker portal reads) so either consumer finds it.
  const identityVerification = intakeIdentityVerification(primary);
  if (identityVerification) {
    displayMeta.identityVerification = identityVerification;
  }

  return {
    displayMeta,
    applicant: {
      dateOfBirth: primary.dob || undefined,
      householdSize,
      annualIncome,
      citizenshipStatus: inferCitizenshipStatus(data),
      isPregnant: inferIsPregnant(data),
      // isPostpartum / postpartumMonthsElapsed are in IntakeApplicant (and the
      // server schema) but the V0 wizard does not collect them, so they are
      // intentionally omitted here (optional on the contract). TODO: wire up if
      // postpartum-tracking screens are added.
      // Primary-only (ENG-1865 review): the applicant block feeds the PRIMARY's
      // BRE determination, so its disability/Medicare flags must reflect the
      // primary's own attributes — a disabled/Medicare-enrolled dependent must
      // not flag the primary (which would misroute them to Non-MAGI/ABD). Matches
      // the per-member display entries above and the design's applicant-level
      // disability claim.
      isDisabled: primaryIsDisabled(data),
      receivingSSI: inferReceivingSSI(data),
      receivingSSDI: inferReceivingSSDI(data),
      employmentStatus: inferEmploymentStatus(jobs),
      hasMedicare: hasMedicareForKey(healthIns, PRIMARY_APPLICANT_ID),
      stateOfResidence: primary.state || DEMO_STATE_CODE,
      ...(identityVerification ? { identityVerification } : {}),
    },
    // ── caseworker-display extras (passthrough on intakeDataSchema) ─────────
    applicationDate,
    applicantName: [primary.firstName, primary.lastName].filter(Boolean).join(' ') || 'Applicant',
    householdSize,
    householdMembers: intakeMembers,
    monthlyHouseholdIncome,
    federalPovertyLevelPercent,
    federalPovertyLevelThreshold: fplMonthly,
    state: primary.state || DEMO_STATE_CODE,
    county: data?.household?.county ?? '',
    requestedProgram: 'State-X Medicaid',
    // nonMagiResources is forwarded per-member (see intakeMembers above) and, as
    // of ENG-1933, consumed by the BRE mapper (intake-to-bre-mapper.ts
    // computeCountableResources) to drive the ABD $2,000 resource test — no
    // longer a hardcoded 0.
    // nonMagiMedicareLtc is still not forwarded — TODO(ENG-1748+): forward it and
    // map needs_ltss / Medicare buy-in once the EE service grows a Non-MAGI intake
    // schema with Zod validators for the LTC disclosures.
  };
}
