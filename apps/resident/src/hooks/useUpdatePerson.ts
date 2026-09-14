import { useMutation } from '@apollo/client/react';
import { useCallback } from 'react';
import { UPDATE_PERSON_MUTATION, type PayloadError } from '../lib/operations';
import { useResident } from '../lib/auth-store';

export interface PersonalInfoFormState {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  dob: string; // "YYYY-MM-DD" from <input type="date">
  ssn: string;
  noSSN: boolean;
  street: string;
  apt: string;
  city: string;
  state: string;
  zip: string;
  mailingStreet: string;
  mailingApt: string;
  mailingCity: string;
  mailingState: string;
  mailingZip: string;
  phone: string;
  phoneType: string;
  email: string;
  preferredLanguage?: string;
}

export interface UseUpdatePersonResult {
  execute: (form: PersonalInfoFormState) => Promise<{ success: boolean; errors: PayloadError[] }>;
  loading: boolean;
  networkError: string | null;
}

/**
 * Pure function: maps a `PersonalInfoFormState` + `personId` to the
 * `updatePerson` mutation input object.
 *
 * Exported so it can be unit-tested independently of the Apollo hook.
 * Callers that need the full hook behaviour use `useUpdatePerson` instead.
 */
export function buildUpdatePersonInput(form: PersonalInfoFormState, personId: string) {
  const ssn = form.noSSN ? undefined : form.ssn?.replace(/\D/g, '') || undefined;
  const addressLine = form.apt ? `${form.street} ${form.apt}` : form.street;

  return {
    personId,
    firstName: form.firstName,
    lastName: form.lastName,
    middleName: form.middleName || undefined,
    suffix: form.suffix || undefined,
    // Empty string must be omitted — the identity-service isoDateField rejects ''.
    dateOfBirth: form.dob || undefined,
    ssn,
    emails: form.email ? [{ value: form.email }] : undefined,
    phones: form.phone ? [{ use: 'MOBILE' as const, value: form.phone }] : undefined,
    addresses: form.street
      ? [
          {
            use: 'HOME' as const,
            type: 'BOTH' as const,
            line: [addressLine],
            city: form.city,
            state: form.state,
            postalCode: form.zip,
            country: 'US',
            isPrimary: true,
          },
        ]
      : undefined,
    preferredLanguage: form.preferredLanguage ?? 'en',
  };
}

export function useUpdatePerson(): UseUpdatePersonResult {
  const [updatePerson, { loading, error: apolloError }] = useMutation(UPDATE_PERSON_MUTATION, {
    fetchPolicy: 'no-cache',
  });

  const resident = useResident();

  const networkError = apolloError ? 'Unable to save. Please try again.' : null;

  const execute = useCallback(
    async (form: PersonalInfoFormState): Promise<{ success: boolean; errors: PayloadError[] }> => {
      if (!resident?.id) {
        // Guest users: form data lives in React state only; skip the mutation.
        return { success: true, errors: [] };
      }

      try {
        const { data } = await updatePerson({
          variables: {
            input: buildUpdatePersonInput(form, resident.id),
          },
        });

        if (!data?.updatePerson) return { success: false, errors: [] };
        const errors = data.updatePerson.errors ?? [];
        if (errors.length > 0) return { success: false, errors };
        return { success: true, errors: [] };
      } catch {
        return { success: false, errors: [] };
      }
    },
    [resident?.id, updatePerson],
  );

  return { execute, loading, networkError };
}
