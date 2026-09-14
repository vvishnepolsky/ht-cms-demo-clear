/**
 * Wizard-wide constants shared across the form data layer, eligibility
 * preview, and submission flow. Lives in its own module to avoid circular
 * imports between `build-intake-data.ts` and `eligibility.tsx`.
 */

// Recipient id for the primary applicant in otherIncome entries. The wizard
// assigns this id to the primary; household members get unique ids like 'm1', 'm2'.
export const PRIMARY_APPLICANT_ID = '0';

// Income type identifiers. Persisted in form state and read at 3+ sites
// (INCOME_TOGGLES, intake inference, eligibility routing, estate-recovery
// predicate). A typo at any one site would silently break SSDI Non-MAGI
// routing or SSI estate-recovery detection with no TypeScript error.
export const INCOME_TYPE_SSI = 'ssi';
export const INCOME_TYPE_SSDI = 'ssdi';

// Initial determination values for the Non-MAGI (ABD) pathway. Persisted in
// eligibility output and read at 3+ sites (eligibility.tsx, eligibility.test.ts,
// and any future confirmation copy referencing the determination string).
// A typo at any one site would silently produce the wrong pathway label.
export const INITIAL_DETERMINATION_PENDING_NON_MAGI = 'pending_non_magi' as const;

// Employment status values that cross the wizard → backend boundary.
// Must match the `employmentStatus` enum in intakeApplicantSchema
// (services/medicaid-ee-service/src/types/intake-data.ts).
// Used at 3+ sites: inferEmploymentStatus (build-intake-data.ts),
// tests, and formatEmploymentStatus (cms-demo/admin/derive-case-detail.ts).
export const EMPLOYMENT_STATUS_EMPLOYED = 'employed' as const;
