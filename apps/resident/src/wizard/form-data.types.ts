/**
 * Wizard form-data types (ENG-1646).
 *
 * Authored explicitly from the screens' actual read/write sites and the
 * `build-intake-data.ts` consumer — NOT derived via `typeof INITIAL_FORM`,
 * because the initializer infers `never[]` / `{}` for the very PHI-carrying
 * collections (otherIncome, jobs, householdMembers, nonMagiResources) that the
 * builder and screens read. See the ENG-1646 adversarial review.
 *
 * Every field is optional: the wizard form starts empty/partial and the builder
 * reads defensively (`data?.x ?? default`). Optionality is what lets a partially
 * filled form — and the trimmed fixtures in the tests — satisfy this type.
 *
 * The intake-payload mirror at the bottom of this file (`IntakeDataPayload` and
 * friends) is the OUTPUT contract for `buildIntakeData`. It mirrors the server
 * schema so `tsc` becomes a drift detector on the PHI payload.
 *   SOURCE OF TRUTH: services/medicaid-ee-service/src/types/intake-data.ts
 *   (`intakeApplicantSchema` / `intakeDataSchema`). Keep in sync — the resident
 *   app does not depend on the service package, so the type cannot be imported.
 */

// ── Wizard state element types ──────────────────────────────────────────────

/** A single employment/self-employment record, keyed under a person id in `jobs`. */
export interface Job {
  id?: string;
  employer?: string;
  address?: string;
  phone?: string;
  startDate?: string;
  ongoing?: boolean;
  endDate?: string;
  payRate?: string;
  payType?: string;
  payFrequency?: string;
  hoursPerWeek?: string;
  monthlyIncome?: number;
  selfEmployed?: boolean;
  businessName?: string;
  businessType?: string;
  grossRevenue?: string;
  businessExpenses?: string;
}

/** A non-wage income entry (SSI/SSDI/etc.), tagged with the recipient's person id. */
export interface OtherIncome {
  id?: string;
  /** Person key the income belongs to: '0' (primary) or a household member id. */
  recipient?: string;
  /** Income type, e.g. INCOME_TYPE_SSI / INCOME_TYPE_SSDI. Some entries use `kind`. */
  type?: string;
  kind?: string;
  /** Dollar amount as entered (parsed with parseFloat downstream). */
  amount?: string;
  frequency?: string;
}

/** An applying or non-applying household member captured in the wizard. */
export interface HouseholdMember {
  id?: string;
  firstName?: string;
  middleInitial?: string;
  lastName?: string;
  dob?: string;
  relationship?: string;
  sex?: string;
  ssn?: string;
  applying?: boolean;
  hasDisability?: boolean;
  pregnant?: boolean | null;
  dueDate?: string;
  expectedBabies?: number;
}

/** Per-person citizenship/immigration disclosure, keyed by person id. */
export interface CitizenshipEntry {
  status?: string;
  documentType?: string;
  alienNumber?: string;
  dateOfEntry?: string;
  countryOfBirth?: string;
  hasSponsor?: boolean;
  sponsorName?: string;
  sponsorAddress?: string;
  sponsorIncome?: string;
  fiveYearResident?: boolean | null;
  tribalMember?: boolean | null;
  tribeName?: string;
}

/** Per-person health-insurance disclosure, keyed by person id. */
export interface HealthInsuranceEntry {
  hasInsurance?: string;
  insuranceType?: string;
  companyName?: string;
  policyNumber?: string;
  groupNumber?: string;
  /** Is the policy holder someone other than this person? */
  differentHolder?: boolean | null;
  holderName?: string;
  /** REL_OPTS_V2 value, e.g. spouse | parent | other */
  holderRelationship?: string;
  /** Monthly premium in dollars (string — the input is free text). */
  premium?: string;
  /** ISO yyyy-mm-dd */
  coverageStartDate?: string;
  coverageEndDate?: string;
  lossReason?: string;
  skipped?: boolean;
  /** 'clear' when the entry was prefilled from the CLEAR coverage discovery. */
  source?: 'clear';
  /** Prefilled entry is greyed/locked until the applicant chooses "This isn't right — edit". */
  locked?: boolean;
}

export interface Household {
  county?: string;
  applicationFor?: string;
  existingCase?: boolean | null;
  caseNumber?: string;
  householdSize?: number;
}

/**
 * Record of a completed CLEAR identity verification (Verify Assist handoff on
 * the 'personal' step). Written by `applyVerificationToPrimary` in
 * clear-verification.ts; read by the personal-info screen (verified chips,
 * masked SSN), the 'personal' step validator, the review/confirmation screens
 * and `build-intake-data.ts` (forwarded to the caseworker under
 * `intakeData.applicant.identityVerification` and `displayMeta`).
 */
export interface IdentityVerification {
  /** Verify Assist verification id (`verify_<nanoid>`). */
  id: string;
  provider: 'CLEAR';
  status: 'success';
  /** PrimaryApplicant keys that were prefilled from the verified ID and not edited since. */
  verifiedFields: string[];
  /** Only the last 4 leave the server. Null when the ID carried no SSN. */
  ssnLast4: string | null;
  /** ISO timestamp the verification completed (server `completedAt`, or client time). */
  verifiedAt: string;
}

export interface PrimaryApplicant {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  suffix?: string;
  dob?: string;
  ssn?: string;
  noSSN?: boolean;
  sex?: string;
  streetAddress?: string;
  aptUnit?: string;
  city?: string;
  state?: string;
  zip?: string;
  homeless?: boolean;
  mailingAddressSame?: boolean;
  phone?: string;
  phoneType?: string;
  email?: string;
  textReminders?: boolean;
  /** Some flows record pregnancy on the applicant directly (build-intake-data reads it). */
  pregnant?: boolean | null;
  /** Set when the applicant verified with CLEAR on the personal step. */
  identityVerification?: IdentityVerification | null;
}

export interface Demographics {
  race?: string[];
  ethnicity?: string;
  veteran?: boolean | null;
  pregnant?: boolean | null;
  dueDate?: string;
  expectedBabies?: number;
  /** Builder treats `true` or `'yes'` as disabled. */
  disability?: boolean | string | null;
  formerFosterYouth?: boolean | null;
}

export interface TaxFiling {
  willFile?: string;
  headOfHouseholdId?: string;
  filingJointlyWithId?: string;
  taxDependentIds?: string[];
}

export interface ProjectedIncome {
  expectedChange?: string;
  changeDate?: string;
  changeReason?: string[];
  changeReasonOther?: string;
  lastTaxReturnAGI?: string;
}

export interface EmployerCoverage {
  offered?: boolean | null;
  memberId?: string;
  employerName?: string;
  availableDate?: string;
  employeePremium?: string;
  familyPremium?: string;
  coversWhat?: string[];
  enrollmentStatus?: string;
  meetsMinimumValue?: string;
  planYearStart?: string;
  cobraAvailable?: boolean | null;
}

export interface Retroactive {
  hasBills?: boolean | null;
  months?: string[];
  requestCoverage?: boolean | null;
}

export interface AuthorizedRep {
  hasRep?: boolean | null;
  name?: string;
  relationship?: string;
  phone?: string;
  email?: string;
  address?: string;
  scope?: string[];
}

export interface Preferences {
  noticeChannels?: string[];
  renewalReminders?: boolean;
  writtenLanguage?: string;
  spokenLanguage?: string;
  bestTimeToContact?: string;
  preferredContactMethod?: string;
  alternatePhone?: string;
  okToLeaveVoicemail?: boolean | null;
  accessibilityNeeds?: string[];
}

/**
 * Computed eligibility-preview result stored on the form. The shape is produced
 * by `eligibility.tsx` (typed under its own subtask, ENG-1646 group D); modelled
 * here as an open record so the PHI core does not couple to that internal shape.
 */
export type EligibilityPreview = Record<string, unknown>;

/**
 * The wizard's single source of truth (FormDataContext.data). Keyed sub-records
 * (`citizenship`, `healthInsurance`, `jobs`) are indexed by person id —
 * '0' for the primary applicant, a member id for each household member.
 */
export interface WizardFormData {
  household?: Household;
  primaryApplicant?: PrimaryApplicant;
  demographics?: Demographics;
  citizenship?: Record<string, CitizenshipEntry>;
  taxFiling?: TaxFiling;
  workRequirements?: Record<string, unknown>;
  nonMagiResources?: Record<string, unknown>;
  nonMagiMedicareLtc?: Record<string, unknown>;
  householdMembers?: HouseholdMember[];
  jobs?: Record<string, Job[]>;
  otherIncome?: OtherIncome[];
  projectedIncome?: ProjectedIncome;
  healthInsurance?: Record<string, HealthInsuranceEntry>;
  employerCoverage?: EmployerCoverage;
  retroactive?: Retroactive;
  authorizedRep?: AuthorizedRep;
  preferences?: Preferences;
  eligibility?: EligibilityPreview | null;
  /** ENG-1684: Argyle bank-mock flags (leading underscore = internal). */
  _bankConnected?: boolean;
  _bankBalance?: string;
  /** ENG-1895: income method picker state (leading underscore = internal). */
  _incomeConfirmed?: string[];
  _payrollDocsByPerson?: Record<string, Array<{ id: string; name: string; size: number; type: string }>>;
  _argyleByPerson?: Record<string, { provider: string; at: string }>; // per-person Argyle connection: { [memberId]: { provider: string; at: string } }
}

// ── FormDataContext value ───────────────────────────────────────────────────

/**
 * A section update: a partial patch, a full replacement, or an updater fn.
 * (Named with a `Value` suffix because the runtime context object already owns
 * the plain `FormDataContext` name and is imported by 16 screen files.)
 */
export type SectionPatch<T> = Partial<T> | T | ((prev: T) => T);

export interface FormDataContextValue {
  data: WizardFormData;
  setData: React.Dispatch<React.SetStateAction<WizardFormData>>;
  updateFormData: <K extends keyof WizardFormData>(section: K, patch: SectionPatch<WizardFormData[K]>) => void;
  setPath: <K extends keyof WizardFormData>(
    section: K,
    key: keyof NonNullable<WizardFormData[K]>,
    value: unknown,
  ) => void;
  loadSample: () => void;
  resetForm: () => void;
}

// ── Intake payload OUTPUT contract (mirror of medicaid-ee-service) ───────────
// SOURCE OF TRUTH: services/medicaid-ee-service/src/types/intake-data.ts

export type IntakeCitizenshipStatus =
  | 'us_citizen'
  | 'lawful_permanent_resident'
  | 'qualified_noncitizen'
  | 'nonqualified_noncitizen'
  | 'undocumented';

/**
 * The BRE-input applicant block. Mirrors `intakeApplicantSchema`.
 *
 * `dateOfBirth` is REQUIRED & non-empty server-side (`z.iso.date()`). The builder
 * intentionally emits `undefined` when the applicant left DOB blank — the server
 * then surfaces a structured intake error rather than computing age=0 (see the
 * intakeApplicantSchema comment). So the producer type is `string | undefined`:
 * an honest reflection that this builder CAN emit a contract-incomplete DOB,
 * which the server rejects. Every other field name/type matches the schema, so
 * `tsc` still catches drift on annualIncome/citizenshipStatus/etc.
 */
export interface IntakeApplicant {
  dateOfBirth: string | undefined;
  householdSize: number;
  annualIncome: number;
  citizenshipStatus: IntakeCitizenshipStatus;
  isPregnant?: boolean;
  isDisabled?: boolean;
  receivingSSI?: boolean;
  receivingSSDI?: boolean;
  employmentStatus?: 'employed' | 'unemployed' | 'self_employed';
  hasMedicare?: boolean;
  isPostpartum?: boolean;
  postpartumMonthsElapsed?: number;
  stateOfResidence?: string;
  /** CLEAR identity verification, when the applicant completed one (passthrough for caseworkers). */
  identityVerification?: IntakeIdentityVerification;
}

/** Intake mirror of `IdentityVerification` — what the caseworker portal reads. */
export interface IntakeIdentityVerification {
  id: string;
  provider: 'CLEAR';
  status: 'success';
  verifiedFields: string[];
  ssnLast4: string | null;
  verifiedAt: string;
}

/** Per-member income sub-shape on the caseworker-display member entries. */
export interface IntakeMemberIncome {
  employmentIncome: number;
  selfEmploymentIncome: number;
  otherIncome: number;
  totalMonthly: number;
}

/** Optional postal address — present only on the primary applicant's entry. */
export interface IntakeMemberAddress {
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

/**
 * Caseworker-display member entry (the rich `householdMembers` shape, distinct
 * from the BRE `applicant` block). Carries each member's OWN per-person BRE
 * attributes (ENG-1865). `address`/`phone`/`email` appear only on the primary.
 */
export interface IntakeInsurance {
  /** employer | marketplace | medicare | tricare | private | other */
  type: string | null;
  insurer: string | null;
  policyNumber: string | null;
  groupNumber: string | null;
  premiumMonthly: number | null;
  policyHolderIsOther: boolean;
  policyHolderName: string | null;
  /** spouse | parent | other … */
  policyHolderRelationship: string | null;
  /** ISO yyyy-mm-dd */
  coverageStartDate: string | null;
  /** 'clear' when prefilled from the identity verification's coverage discovery, else 'applicant'. */
  source: 'clear' | 'applicant';
}

export interface IntakeMember {
  personId: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string | undefined;
  relationship: string;
  address?: IntakeMemberAddress;
  phone?: string | null;
  email?: string | null;
  tribalMember: boolean | null;
  tribeName: string;
  income: IntakeMemberIncome;
  hasInsurance: boolean;
  /** Details of the current coverage when hasInsurance (source 'clear' = found by CLEAR's coverage discovery). */
  insurance?: IntakeInsurance | null;
  nonMagiResources: unknown;
  citizenshipStatus: IntakeCitizenshipStatus;
  isPregnant: boolean;
  isDisabled: boolean;
  receivingSSI: boolean;
  hasMedicare: boolean;
}

/**
 * Persisted, both-app-readable mirror channel (ENG-1912/1913). `ssn` is the
 * formatted full SSN and is omitted entirely when the applicant declared no SSN.
 */
export interface IntakeDisplayMeta {
  caseNumber: string;
  ssn?: string;
  /** CLEAR identity verification summary (admin reads displayMeta). */
  identityVerification?: IntakeIdentityVerification;
}

/**
 * Full payload `buildIntakeData` returns. `applicant` + `householdMembers` are
 * the contract block (`intakeDataSchema`); the remaining fields are the
 * caseworker-display extras the schema preserves via `.passthrough()`. Every
 * emitted field is named here (no index signature), so a typo'd or misplaced
 * field on the PHI payload is a compile error.
 */
export interface IntakeDataPayload {
  displayMeta: IntakeDisplayMeta;
  applicant: IntakeApplicant;
  applicationDate: string;
  applicantName: string;
  householdSize: number;
  householdMembers: IntakeMember[];
  monthlyHouseholdIncome: number;
  federalPovertyLevelPercent: number;
  federalPovertyLevelThreshold: number;
  state: string;
  county: string;
  requestedProgram: string;
}
