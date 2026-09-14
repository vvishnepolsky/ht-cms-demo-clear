import { useMutation, useApolloClient } from '@apollo/client/react';
import { useCallback, useState } from 'react';
import {
  CREATE_PERSON_MUTATION,
  CREATE_HOUSEHOLD_MUTATION,
  ADD_HOUSEHOLD_MEMBER_MUTATION,
  REMOVE_HOUSEHOLD_MEMBER_MUTATION,
  GET_HOUSEHOLD_QUERY,
  ERROR_CODES,
  type HouseholdMemberRole,
  type HouseholdError,
  type HouseholdMemberSummary,
} from '../lib/operations';
import { useResident } from '../lib/auth-store';
import { SESSION_KEYS } from '../lib/session-keys';

export interface HouseholdMemberFormState {
  firstName: string;
  middleInitial?: string;
  lastName: string;
  dob: string; // "YYYY-MM-DD"
  ssn?: string;
  relationship: string; // raw UI string — mapped to HouseholdMemberRole internally
}

/**
 * Maps UI relationship string → HouseholdMemberRole enum value.
 *
 * The wizard's WIZARD_RELATIONSHIPS array stores lowercase value strings ('child',
 * 'spouse', 'stepchild', ...). Older callers passed capitalized labels
 * ('Child', 'Spouse/Domestic Partner', ...) — kept here for back-compat.
 * Without this normalization every wizard-submitted member fell through to
 * the default and was written as OTHER_ADULT, which then bled into the
 * caseworker pathway-label rendering (a child showing as 'Adult Group MAGI').
 *
 * Exported for direct unit testing — `useWireHousehold.test.ts` exercises every
 * non-default branch plus the default fallback. The production call site
 * remains `useWireHousehold.execute()`.
 */
export function toHouseholdRole(relationship: string): HouseholdMemberRole {
  const key = relationship.toLowerCase().trim();
  switch (key) {
    case 'spouse':
    case 'spouse/domestic partner':
    case 'partner':
    case 'domestic partner':
      return 'SPOUSE';
    case 'child':
    case 'son':
    case 'daughter':
    case 'stepchild':
    case 'foster_child':
    case 'foster child':
      return 'CHILD';
    case 'grandchild':
      return 'OTHER_DEPENDENT';
    default:
      return 'OTHER_ADULT';
  }
}

/**
 * ENG-1869 · Diff helper. Given the wizard's resolved members (each already mapped
 * to a personId) and the household's current members from the server, returns the
 * set of non-head personIds to remove (in DB but not in wizard form) and the wizard
 * members to add (in wizard but not yet attached to the DB household). HEAD is
 * never returned in `toRemove` — the head is structural and immutable for the
 * lifetime of the wizard session.
 *
 * Exported for direct unit testing.
 */
export interface ResolvedWizardMember {
  member: HouseholdMemberFormState;
  personId: string;
}
export interface HouseholdMemberDiff {
  toAdd: ResolvedWizardMember[];
  toRemovePersonIds: string[];
}
export function computeHouseholdMemberDiff(
  wizardMembers: ResolvedWizardMember[],
  existingMembers: HouseholdMemberSummary[],
): HouseholdMemberDiff {
  const targetPersonIds = new Set(wizardMembers.map((m) => m.personId));
  const existingNonHeadPersonIds = new Set(
    existingMembers
      .filter((m) => m.role !== 'HEAD')
      .map((m) => m.person?.personId)
      .filter((p): p is string => typeof p === 'string' && p.length > 0),
  );
  return {
    toAdd: wizardMembers.filter((m) => !existingNonHeadPersonIds.has(m.personId)),
    toRemovePersonIds: [...existingNonHeadPersonIds].filter((pid) => !targetPersonIds.has(pid)),
  };
}

export interface UseWireHouseholdResult {
  execute: (members: HouseholdMemberFormState[]) => Promise<{ success: boolean; errors: HouseholdError[] }>;
  loading: boolean;
}

export function useWireHousehold(): UseWireHouseholdResult {
  const [createPerson] = useMutation(CREATE_PERSON_MUTATION, {
    fetchPolicy: 'no-cache',
  });
  const [createHousehold] = useMutation(CREATE_HOUSEHOLD_MUTATION, { fetchPolicy: 'no-cache' });
  const [addHouseholdMember] = useMutation(ADD_HOUSEHOLD_MEMBER_MUTATION, { fetchPolicy: 'no-cache' });
  const [removeHouseholdMember] = useMutation(REMOVE_HOUSEHOLD_MEMBER_MUTATION, { fetchPolicy: 'no-cache' });
  const apollo = useApolloClient();

  const resident = useResident();
  const customerId = resident?.customerId ?? null;
  const headId = resident?.id ?? null;

  const [loading, setLoading] = useState(false);

  const execute = useCallback(
    async (members: HouseholdMemberFormState[]): Promise<{ success: boolean; errors: HouseholdError[] }> => {
      // Guest path: no resident logged in — skip silently
      if (!customerId || !headId) {
        return { success: true, errors: [] };
      }

      setLoading(true);
      const startDate = new Date().toISOString();
      const headers = { 'x-customer-id': customerId };

      try {
        // 1. Resolve each non-head wizard member to a personId — creates a new
        //    identity-service Person record on first encounter, reuses cached
        //    personIds from sessionStorage on subsequent passes through the
        //    wizard. Idempotent so going Back/Continue does not duplicate.
        const additionalMembers = members.filter((m) => m.relationship !== 'Self' && m.firstName && m.lastName);

        let cachedIds: Record<string, string> = {};
        try {
          const raw = sessionStorage.getItem(SESSION_KEYS.MEMBER_PERSON_IDS);
          if (raw) cachedIds = JSON.parse(raw);
        } catch {}

        const wizardMembers: ResolvedWizardMember[] = await Promise.all(
          additionalMembers.map(async (member) => {
            const cacheKey = `${member.firstName}|${member.lastName}|${member.dob}`;
            const cached = cachedIds[cacheKey];
            if (cached) return { member, personId: cached };

            if (!member.dob) {
              throw {
                personErrors: [
                  { code: 'VALIDATION_ERROR', message: `Date of birth is required for ${member.firstName}.` },
                ],
              };
            }
            const { data } = await createPerson({
              variables: {
                input: {
                  firstName: member.firstName,
                  lastName: member.lastName,
                  middleName: member.middleInitial || undefined,
                  dateOfBirth: member.dob,
                  ssn: member.ssn?.replace(/\D/g, '') || undefined,
                },
              },
            });

            const errors = data?.createPerson?.errors ?? [];
            if (errors.length > 0) throw { personErrors: errors };

            const personId = data?.createPerson?.person?.personId;
            if (!personId)
              throw { personErrors: [{ code: ERROR_CODES.UNKNOWN, message: 'Failed to create person record.' }] };

            cachedIds[cacheKey] = personId;
            try {
              sessionStorage.setItem(SESSION_KEYS.MEMBER_PERSON_IDS, JSON.stringify(cachedIds));
            } catch {}

            return { member, personId };
          }),
        );

        // 2. Branch on whether a household was already created in a prior pass.
        const existingHouseholdId = sessionStorage.getItem(SESSION_KEYS.HOUSEHOLD_ID);

        if (existingHouseholdId) {
          // ── ENG-1869 SYNC PATH ─────────────────────────────────────────────
          // A household was created earlier. Fetch its current members from the
          // server and reconcile against the wizard's current member list:
          // additions (in wizard, not in DB) are added; non-head members in DB
          // that are no longer in the wizard form are removed. HEAD is never
          // removed. Without this, members the resident deleted on the People
          // step keep showing up on the caseworker's completed-case view
          // (ENG-1869 root cause).
          // Apollo throws on transport failure (caught by outer try/catch
          // with the same name-only logging convention as the rest of this
          // hook); a resolved GraphQL error path returns a static error to
          // the caller without leaking server detail into telemetry.
          const { data: hhData } = await apollo.query({
            query: GET_HOUSEHOLD_QUERY,
            variables: { id: existingHouseholdId, customerId },
            fetchPolicy: 'no-cache',
            context: { headers },
          });

          // Household was externally deleted (e.g. admin cleaned up a partial
          // signup, or storage reset between sessions). Drop the stale ID so
          // the next wizard pass falls through to the CREATE PATH and
          // re-bootstraps the household — without this guard the empty diff
          // would try to addHouseholdMember against a non-existent householdId
          // and loop indefinitely on every Continue press.
          if (!hhData?.household) {
            try {
              sessionStorage.removeItem(SESSION_KEYS.HOUSEHOLD_ID);
            } catch {}
            return {
              success: false,
              errors: [{ code: ERROR_CODES.NETWORK_ERROR, message: 'Unable to save. Please try again.' }],
            };
          }

          const existingMembers = hhData.household.members;
          const diff = computeHouseholdMemberDiff(wizardMembers, existingMembers);

          // Remove stale members first so a re-added person (same personId)
          // does not collide with a still-present row from a previous pass.
          for (const personId of diff.toRemovePersonIds) {
            const { data: rmData } = await removeHouseholdMember({
              variables: { input: { householdId: existingHouseholdId, personId, customerId } },
              context: { headers },
            });
            const rmErrors = rmData?.removeHouseholdMember?.errors ?? [];
            if (rmErrors.length > 0) {
              return { success: false, errors: rmErrors };
            }
          }

          for (const { member, personId } of diff.toAdd) {
            const { data: addData } = await addHouseholdMember({
              variables: {
                input: {
                  householdId: existingHouseholdId,
                  customerId,
                  personId,
                  role: toHouseholdRole(member.relationship),
                  relationshipToHead: member.relationship,
                  startDate,
                },
              },
              context: { headers },
            });
            const addErrors = addData?.addHouseholdMember?.errors ?? [];
            if (addErrors.length > 0) {
              try {
                sessionStorage.removeItem(SESSION_KEYS.MEMBER_PERSON_IDS);
              } catch {}
              return { success: false, errors: addErrors };
            }
          }

          return { success: true, errors: [] };
        }

        // ── CREATE PATH ────────────────────────────────────────────────────
        // No prior household — create one with the resident as HEAD, then attach
        // each additional member.
        const { data: householdData } = await createHousehold({
          variables: {
            input: {
              customerId,
              members: [{ personId: headId, role: 'HEAD', startDate }],
            },
          },
          context: { headers },
        });

        const householdErrors = householdData?.createHousehold?.errors ?? [];
        if (householdErrors.length > 0) {
          return { success: false, errors: householdErrors };
        }

        const householdId = householdData?.createHousehold?.household?.id;
        if (!householdId) {
          return { success: false, errors: [{ code: ERROR_CODES.UNKNOWN, message: 'Failed to create household.' }] };
        }

        for (const { member, personId } of wizardMembers) {
          const { data: addData } = await addHouseholdMember({
            variables: {
              input: {
                householdId,
                customerId,
                personId,
                role: toHouseholdRole(member.relationship),
                relationshipToHead: member.relationship,
                startDate,
              },
            },
            context: { headers },
          });

          const addErrors = addData?.addHouseholdMember?.errors ?? [];
          if (addErrors.length > 0) {
            // ENG-1842: clear cached personIds so a corrected retry re-creates
            // persons rather than reusing stale IDs that caused this failure.
            try {
              sessionStorage.removeItem(SESSION_KEYS.MEMBER_PERSON_IDS);
            } catch {}
            return { success: false, errors: addErrors };
          }
        }

        try {
          sessionStorage.setItem(SESSION_KEYS.HOUSEHOLD_ID, householdId);
        } catch {}

        // ENG-1831: do NOT clear MEMBER_PERSON_IDS here. The cache survives
        // through to useSubmitCase so it can thread each member's identity-service
        // personId into intakeData.householdMembers[*].personId. Without that,
        // the admin's caseworker view falls back to "Unknown" for every member.
        // useSubmitCase clears the cache on successful submission.

        return { success: true, errors: [] };
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'personErrors' in err) {
          const personErrors = (err as { personErrors?: HouseholdError[] }).personErrors;
          if (Array.isArray(personErrors)) {
            return { success: false, errors: personErrors };
          }
        }
        // Surface a static, non-PHI domain error to the caller. We intentionally
        // do not log err.message or err here — wizard mutation inputs include
        // user-supplied PHI (DOB, SSN, names) that must not enter telemetry.
        // Per standards/coding-standards.md § Error handling.
        return {
          success: false,
          errors: [{ code: ERROR_CODES.NETWORK_ERROR, message: 'Unable to save. Please try again.' }],
        };
      } finally {
        setLoading(false);
      }
    },
    [customerId, headId, createPerson, createHousehold, addHouseholdMember, removeHouseholdMember, apollo],
  );

  return { execute, loading };
}
