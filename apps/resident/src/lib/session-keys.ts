type SectionKey =
  | 'programs'
  | 'personalInfo'
  | 'household'
  | 'householdMembers'
  | 'demographics'
  | 'background'
  | 'workRequirements'
  | 'jobInfo'
  | 'incomeInfo'
  | 'incomeDiscrepancy'
  | 'shelterCosts'
  | 'dependentCare'
  | 'healthInsurance'
  | 'employerCoverage'
  | 'financialResources'
  | 'propertyVehicles'
  | 'authorizedRep'
  | 'preferences';

/** Shared sessionStorage key constants — single source of truth to avoid silent breakage. */
export const SESSION_KEYS = {
  // Autofill tracking (ENG-425 — Reducto scan)
  AUTOFILL_APPLIED: 'autofill-applied',
  PERSONAL_INFO_AUTOFILLED: 'personal-info-autofilled',
  HOUSEHOLD_AUTOFILLED: 'household-autofilled',
  HOUSEHOLD_MEMBERS_AUTOFILLED: 'household-members-autofilled',
  DEMOGRAPHICS_AUTOFILLED: 'demographics-autofilled',
  JOB_INFO_AUTOFILLED: 'job-info-autofilled',
  INCOME_INFO_AUTOFILLED: 'income-info-autofilled',
  HEALTH_INSURANCE_AUTOFILLED: 'health-insurance-autofilled',
  FINANCIAL_RESOURCES_AUTOFILLED: 'financial-resources-autofilled',
  AUTHORIZED_REP_AUTOFILLED: 'authorized-rep-autofilled',
  HEAD_PERSON_ID: 'head-person-id',
  HOUSEHOLD_ID: 'household-id',
  HOUSEHOLD_DRAFT: 'household-draft',
  HOUSEHOLD_MEMBERS_DRAFT: 'household-members-draft',
  MEMBER_PERSON_IDS: 'household-member-person-ids',
  PERSONAL_INFO_DRAFT: 'personal-info-draft',
  DEMOGRAPHICS_DRAFT: 'demographics-draft',
  BACKGROUND_DRAFT: 'background-draft',
  WORK_REQUIREMENTS_DRAFT: 'work-requirements-draft',
  JOB_INFO_DRAFT: 'job-info-draft',
  JOB_HISTORY_MANUAL_DRAFT: 'job-history-manual-draft',
  JOB_HISTORY_ARGYLE_JOBS: 'job-history-argyle-jobs',
  INCOME_INFO_DRAFT: 'income-info-draft',
  INCOME_DISCREPANCY_DRAFT: 'income-discrepancy-draft',
  SHELTER_COSTS_DRAFT: 'shelter-costs-draft',
  DEPENDENT_CARE_DRAFT: 'dependent-care-draft',
  HEALTH_INSURANCE_DRAFT: 'health-insurance-draft',
  EMPLOYER_COVERAGE_DRAFT: 'employer-coverage-draft',
  FINANCIAL_RESOURCES_DRAFT: 'financial-resources-draft',
  PROPERTY_VEHICLES_DRAFT: 'property-vehicles-draft',
  AUTHORIZED_REP_DRAFT: 'authorized-rep-draft',
  PREFERENCES_DRAFT: 'preferences-draft',
  PROGRAMS_DRAFT: 'programs-draft',
  SUBMITTED_PROGRAMS: 'submitted-programs',
  CASE_ID: 'case-id',
  COMM_PREFS: 'comm-prefs',
  MEDICAID_EE_DRAFT_ID: 'medicaid-ee-draft-id',
  // CLEAR / Verify Assist: `{ id, role }` of the verification we handed the
  // browser off for, so the return leg (`/#/personal?verified=<id>`) knows
  // what to poll. Cleared once the verification reaches a terminal status.
  PENDING_VERIFICATION: 'sx-pending-verification',
} as const;

/**
 * Maps draft sectionKey values to their corresponding sessionStorage keys.
 * Only sections that write to sessionStorage are listed; sections without a
 * storage entry (e.g. snapScreening, which manages inline state) are omitted —
 * the hydration helper skips unmapped keys without error.
 */
export const SECTION_KEY_TO_SESSION_KEY: Partial<Record<SectionKey, string>> = {
  programs: SESSION_KEYS.PROGRAMS_DRAFT,
  personalInfo: SESSION_KEYS.PERSONAL_INFO_DRAFT,
  household: SESSION_KEYS.HOUSEHOLD_DRAFT,
  householdMembers: SESSION_KEYS.HOUSEHOLD_MEMBERS_DRAFT,
  demographics: SESSION_KEYS.DEMOGRAPHICS_DRAFT,
  background: SESSION_KEYS.BACKGROUND_DRAFT,
  workRequirements: SESSION_KEYS.WORK_REQUIREMENTS_DRAFT,
  jobInfo: SESSION_KEYS.JOB_INFO_DRAFT,
  incomeInfo: SESSION_KEYS.INCOME_INFO_DRAFT,
  incomeDiscrepancy: SESSION_KEYS.INCOME_DISCREPANCY_DRAFT,
  shelterCosts: SESSION_KEYS.SHELTER_COSTS_DRAFT,
  dependentCare: SESSION_KEYS.DEPENDENT_CARE_DRAFT,
  healthInsurance: SESSION_KEYS.HEALTH_INSURANCE_DRAFT,
  employerCoverage: SESSION_KEYS.EMPLOYER_COVERAGE_DRAFT,
  financialResources: SESSION_KEYS.FINANCIAL_RESOURCES_DRAFT,
  propertyVehicles: SESSION_KEYS.PROPERTY_VEHICLES_DRAFT,
  authorizedRep: SESSION_KEYS.AUTHORIZED_REP_DRAFT,
  preferences: SESSION_KEYS.PREFERENCES_DRAFT,
};
