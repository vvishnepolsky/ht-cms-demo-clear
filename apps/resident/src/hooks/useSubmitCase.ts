import { useMutation } from '@apollo/client/react';
import { useCallback, useState } from 'react';
import { CREATE_MEDICAID_EE_CASE_MUTATION, ERROR_CODES, type PayloadError } from '../lib/operations';
import { useResident } from '../lib/auth-store';
import { SESSION_KEYS } from '../lib/session-keys';
import { buildIntakeData } from '../wizard/build-intake-data';
import type { WizardFormData } from '../wizard/form-data.types';

export interface SubmitCaseResult {
  success: boolean;
  caseId?: string;
  caseNumber?: string;
  errors: PayloadError[];
}

export interface UseSubmitCaseResult {
  execute: (wizardData: WizardFormData) => Promise<SubmitCaseResult>;
  loading: boolean;
}

/**
 * Submits the wizard's collected data as a `MedicaidEeCase`.
 *
 * Reads:
 * - applicantPersonId from `auth-store` (set at register/login in StepLoginV2)
 * - householdId from sessionStorage (set by `useWireHousehold` in StepHouseholdMembersV2)
 * - intakeData built from `wizardData` (FormDataContext.data) via `build-intake-data`
 *
 * Guest path: returns success without firing the mutation so the wizard
 * can still advance to the confirmation page for demo flow purposes.
 */
export function useSubmitCase(): UseSubmitCaseResult {
  const [mutate] = useMutation(CREATE_MEDICAID_EE_CASE_MUTATION, {
    fetchPolicy: 'no-cache',
  });

  const resident = useResident();
  const customerId = resident?.customerId ?? null;
  // ENG-1703: prefer identity-service personId when available (accounts post-ENG-1703).
  const applicantPersonId = resident?.personId ?? resident?.id ?? null;
  const [loading, setLoading] = useState(false);

  const execute = useCallback(
    async (wizardData: WizardFormData): Promise<SubmitCaseResult> => {
      if (!customerId || !applicantPersonId) {
        // Guest path — no auth, skip the mutation and let the wizard advance.
        return { success: true, errors: [] };
      }

      const householdId = sessionStorage.getItem(SESSION_KEYS.HOUSEHOLD_ID);
      if (!householdId) {
        return {
          success: false,
          errors: [
            {
              code: 'MISSING_HOUSEHOLD',
              message: 'Household must be created before submitting. Go back to the People step and try again.',
            },
          ],
        };
      }

      setLoading(true);
      try {
        // ENG-1831: thread each non-head household member's identity-service
        // personId into intakeData.householdMembers[*].personId. Without it,
        // the admin's caseworker view joins by personId and falls back to
        // "Unknown" for every non-head member. useWireHousehold populated this
        // cache (keyed by `${firstName}|${lastName}|${dob}`) when it created
        // the Person records — translate to a `{ wizardMemberId → personId }`
        // map keyed by the wizard's local member id so build-intake-data can
        // look each one up by `m.id`.
        const memberPersonIds = readMemberPersonIdsFor(wizardData);

        const intakeData = buildIntakeData({
          data: wizardData,
          applicantPersonId,
          memberPersonIds,
        });

        // CLEAR / Verify Assist: link the applicant's completed identity
        // verification to the case explicitly (the server otherwise falls back
        // to the caller's most recent unlinked applicant verification).
        const identityVerificationId = wizardData?.primaryApplicant?.identityVerification?.id ?? undefined;

        const { data } = await mutate({
          variables: {
            input: {
              householdId,
              applicantPersonId,
              caseType: 'INITIAL',
              ...(identityVerificationId ? { identityVerificationId } : {}),
              // ENG-1646: buildIntakeData now returns the precisely-typed
              // IntakeDataPayload (drift-checked at its `return`). The GraphQL
              // `intakeData` input is a JSON scalar (Record<string, unknown>),
              // so widen to the transport type at this serialization boundary.
              intakeData: intakeData as unknown as Record<string, unknown>,
            },
          },
          context: { headers: { 'x-customer-id': customerId } },
        });

        if (!data?.createMedicaidEeCase) {
          return { success: false, errors: [{ code: ERROR_CODES.UNKNOWN, message: 'No response from server.' }] };
        }

        const errors: PayloadError[] = data.createMedicaidEeCase.errors ?? [];
        if (errors.length > 0) {
          return { success: false, errors };
        }

        const submittedCase = data.createMedicaidEeCase.case;
        if (submittedCase?.id) {
          sessionStorage.setItem(SESSION_KEYS.CASE_ID, submittedCase.id);
        }
        // ENG-1912: medicaid-ee-service does not assign a human-readable case
        // number to self-service submissions (caseNumber comes back null), so the
        // canonical identifier is the SX-… number we persisted into
        // intakeData.displayMeta.caseNumber. Surface that same value to the
        // confirmation screen so the citizen sees exactly what the caseworker
        // portal reads back from intakeData.
        // ENG-1646: intakeData.displayMeta is now typed (IntakeDisplayMeta) —
        // caseNumber is always present, so no cast/guard is needed.
        const persistedCaseNumber = intakeData.displayMeta.caseNumber;
        // ENG-1831: useWireHousehold deliberately leaves MEMBER_PERSON_IDS in
        // sessionStorage so we can read it here; clear it now that we've
        // threaded the personIds into the submitted intakeData.
        try {
          sessionStorage.removeItem(SESSION_KEYS.MEMBER_PERSON_IDS);
        } catch {}
        return {
          success: true,
          caseId: submittedCase?.id,
          caseNumber: submittedCase?.caseNumber ?? persistedCaseNumber ?? undefined,
          errors: [],
        };
      } catch (err) {
        // Log the error code/name (not the raw message) so we have signal without
        // leaking arbitrary exception strings into telemetry. User-facing message
        // stays static per standards/coding-standards.md § Error handling.
        console.error('[useSubmitCase] network/transport failure', {
          name: err instanceof Error ? err.name : typeof err,
        });
        return {
          success: false,
          errors: [
            {
              code: ERROR_CODES.NETWORK_ERROR,
              message: 'Unable to submit. Please try again.',
            },
          ],
        };
      } finally {
        setLoading(false);
      }
    },
    [customerId, applicantPersonId, mutate],
  );

  return { execute, loading };
}

/**
 * Translates the `${firstName}|${lastName}|${dob}` → personId cache populated
 * by useWireHousehold into the `{ wizardMemberId → personId }` shape that
 * build-intake-data expects. Returns `{}` if the cache is missing or malformed
 * — the caller continues with null personIds (graceful degradation) and the
 * admin's "Unknown" fallback re-engages for the affected members only.
 *
 * Exported for direct unit testing of the failure branches (malformed JSON,
 * missing ids, non-string personIds). The production call site is
 * `useSubmitCase.execute()`; no other module should import this helper.
 */
export function readMemberPersonIdsFor(wizardData: any): Record<string, string> {
  let cache: Record<string, string>;
  try {
    const raw = sessionStorage.getItem(SESSION_KEYS.MEMBER_PERSON_IDS);
    cache = raw ? JSON.parse(raw) : {};
  } catch {
    cache = {};
  }
  if (!cache || typeof cache !== 'object') return {};

  const members = Array.isArray(wizardData?.householdMembers) ? wizardData.householdMembers : [];
  const map: Record<string, string> = {};
  for (const m of members) {
    const memberId = typeof m?.id === 'string' ? m.id : '';
    if (!memberId) continue;
    // Must mirror the cache key shape used by useWireHousehold.
    const key = `${m?.firstName ?? ''}|${m?.lastName ?? ''}|${m?.dob ?? ''}`;
    const personId = cache[key];
    if (typeof personId === 'string' && personId.length > 0) {
      map[memberId] = personId;
    }
  }
  return map;
}
