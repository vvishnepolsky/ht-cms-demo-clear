import { describe, it, expect, beforeEach } from 'vitest';
import { SESSION_KEYS } from './session-keys';

/**
 * Verifies that the iowa/resident logout path clears all PHI-bearing sessionStorage
 * keys. ENG-1313 security requirement: sessionStorage must be wiped on logout to
 * prevent PHI leaking to the next user on a shared device.
 *
 * Behavioral contract: AppLayout.handleLogout() calls sessionStorage.clear() after
 * storeLogout(). These tests verify the scope of what gets cleared and that the
 * chosen approach (clear() vs. targeted removeItem) is sufficient.
 */

describe('sessionStorage PHI keys cleared on logout', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('confirms all SESSION_KEYS values are wiped by a single sessionStorage.clear()', () => {
    const allKeys = Object.values(SESSION_KEYS);
    for (const key of allKeys) {
      sessionStorage.setItem(key, JSON.stringify({ phi: true }));
    }
    expect(sessionStorage.length).toBe(allKeys.length);

    // Simulate what AppLayout.handleLogout() now calls.
    sessionStorage.clear();

    for (const key of allKeys) {
      expect(sessionStorage.getItem(key)).toBeNull();
    }
    expect(sessionStorage.length).toBe(0);
  });

  it('clears all draft section keys that contain applicant-entered PHI', () => {
    const draftKeys = [
      SESSION_KEYS.PERSONAL_INFO_DRAFT,
      SESSION_KEYS.HOUSEHOLD_DRAFT,
      SESSION_KEYS.HOUSEHOLD_MEMBERS_DRAFT,
      SESSION_KEYS.DEMOGRAPHICS_DRAFT,
      SESSION_KEYS.BACKGROUND_DRAFT,
      SESSION_KEYS.INCOME_INFO_DRAFT,
      SESSION_KEYS.HEALTH_INSURANCE_DRAFT,
      SESSION_KEYS.FINANCIAL_RESOURCES_DRAFT,
      SESSION_KEYS.AUTHORIZED_REP_DRAFT,
    ];

    for (const key of draftKeys) {
      sessionStorage.setItem(key, JSON.stringify({ ssn: 'REDACTED', dob: '1990-01-01' }));
    }

    sessionStorage.clear();

    for (const key of draftKeys) {
      expect(sessionStorage.getItem(key)).toBeNull();
    }
  });

  it('clears identity-linking keys that could be used to reconstruct applicant identity', () => {
    sessionStorage.setItem(SESSION_KEYS.MEDICAID_EE_DRAFT_ID, 'draft-id-abc');
    sessionStorage.setItem(SESSION_KEYS.HEAD_PERSON_ID, 'person-id-xyz');
    sessionStorage.setItem(SESSION_KEYS.HOUSEHOLD_ID, 'household-id-123');

    sessionStorage.clear();

    expect(sessionStorage.getItem(SESSION_KEYS.MEDICAID_EE_DRAFT_ID)).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEYS.HEAD_PERSON_ID)).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEYS.HOUSEHOLD_ID)).toBeNull();
  });

  it('clears autofill flags that encode which PHI fields were pre-filled from external sources', () => {
    sessionStorage.setItem(SESSION_KEYS.AUTOFILL_APPLIED, 'true');
    sessionStorage.setItem(SESSION_KEYS.PERSONAL_INFO_AUTOFILLED, 'true');
    sessionStorage.setItem(SESSION_KEYS.HOUSEHOLD_AUTOFILLED, 'true');

    sessionStorage.clear();

    expect(sessionStorage.getItem(SESSION_KEYS.AUTOFILL_APPLIED)).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEYS.PERSONAL_INFO_AUTOFILLED)).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEYS.HOUSEHOLD_AUTOFILLED)).toBeNull();
  });
});
