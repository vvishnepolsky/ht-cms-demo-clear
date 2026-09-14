import { describe, it, expect } from 'vitest';
import { computeHouseholdMemberDiff, toHouseholdRole, type ResolvedWizardMember } from './useWireHousehold';
import type { HouseholdMemberSummary } from '../lib/operations';

// ENG-1869 — the diff helper is where the root-cause fix logic lives. The hook
// itself is Apollo-bound and tested manually in the wizard; the pure helper is
// exhaustively covered here so future refactors of the hook cannot silently
// regress the "delete + re-add" wizard flow that produced extraneous members
// on the caseworker view.

function wizard(personId: string, relationship = 'Spouse'): ResolvedWizardMember {
  return {
    member: {
      firstName: 'X',
      lastName: 'X',
      dob: '2000-01-01',
      relationship,
    },
    personId,
  };
}

function dbMember(personId: string | null, role: 'HEAD' | 'SPOUSE' | 'CHILD' = 'SPOUSE'): HouseholdMemberSummary {
  return {
    id: `hm-${personId ?? 'null'}`,
    role,
    relationshipToHead: role === 'HEAD' ? null : 'Spouse',
    person: personId ? { personId } : null,
  };
}

describe('computeHouseholdMemberDiff', () => {
  it('returns no-op diff when wizard and DB agree (HEAD + identical members)', () => {
    const wizardMembers = [wizard('p1'), wizard('p2')];
    const existingMembers = [dbMember('head', 'HEAD'), dbMember('p1'), dbMember('p2')];

    const diff = computeHouseholdMemberDiff(wizardMembers, existingMembers);

    expect(diff.toAdd).toEqual([]);
    expect(diff.toRemovePersonIds).toEqual([]);
  });

  it('returns only additions when the wizard has new members not yet attached to the DB household', () => {
    const newMember = wizard('p3');
    const wizardMembers = [wizard('p1'), wizard('p2'), newMember];
    const existingMembers = [dbMember('head', 'HEAD'), dbMember('p1'), dbMember('p2')];

    const diff = computeHouseholdMemberDiff(wizardMembers, existingMembers);

    expect(diff.toAdd).toEqual([newMember]);
    expect(diff.toRemovePersonIds).toEqual([]);
  });

  it('returns only removals when the wizard has fewer members than the DB household (the ENG-1869 symptom)', () => {
    // User added p2 in an earlier pass, then went Back and removed p2 from the
    // wizard form. The wizard now reports only p1; the DB still has both.
    const wizardMembers = [wizard('p1')];
    const existingMembers = [dbMember('head', 'HEAD'), dbMember('p1'), dbMember('p2')];

    const diff = computeHouseholdMemberDiff(wizardMembers, existingMembers);

    expect(diff.toAdd).toEqual([]);
    expect(diff.toRemovePersonIds).toEqual(['p2']);
  });

  it('returns both add and remove when the wizard swaps one member for another', () => {
    // User removed p2 and added p3 in the same pass. The hook must add p3 and
    // remove p2 atomically so the DB matches the wizard's current state.
    const newMember = wizard('p3');
    const wizardMembers = [wizard('p1'), newMember];
    const existingMembers = [dbMember('head', 'HEAD'), dbMember('p1'), dbMember('p2')];

    const diff = computeHouseholdMemberDiff(wizardMembers, existingMembers);

    expect(diff.toAdd).toEqual([newMember]);
    expect(diff.toRemovePersonIds).toEqual(['p2']);
  });

  it('never removes the HEAD member, even if HEAD is absent from the wizard members list', () => {
    // The wizard members list passed to useWireHousehold contains non-head
    // applicants only; HEAD must be treated as structural and immutable.
    const wizardMembers = [wizard('p1')];
    const existingMembers = [dbMember('head', 'HEAD'), dbMember('p1')];

    const diff = computeHouseholdMemberDiff(wizardMembers, existingMembers);

    expect(diff.toRemovePersonIds).not.toContain('head');
    expect(diff.toRemovePersonIds).toEqual([]);
  });

  it('ignores DB members whose person is null (federation hydration gaps)', () => {
    const wizardMembers = [wizard('p1')];
    const existingMembers = [dbMember('head', 'HEAD'), dbMember('p1'), dbMember(null, 'SPOUSE')];

    const diff = computeHouseholdMemberDiff(wizardMembers, existingMembers);

    expect(diff.toRemovePersonIds).toEqual([]);
  });

  it('handles an empty wizard members list against a household that has stale members', () => {
    // The resident removed every additional member from the wizard. All
    // non-head DB members should be removed; HEAD stays.
    const diff = computeHouseholdMemberDiff([], [dbMember('head', 'HEAD'), dbMember('p1'), dbMember('p2', 'CHILD')]);

    expect(diff.toAdd).toEqual([]);
    expect(diff.toRemovePersonIds.sort()).toEqual(['p1', 'p2']);
  });

  it('handles an empty existing household (first pass through the wizard) by returning everyone as additions', () => {
    const m1 = wizard('p1');
    const m2 = wizard('p2');

    const diff = computeHouseholdMemberDiff([m1, m2], []);

    expect(diff.toAdd).toEqual([m1, m2]);
    expect(diff.toRemovePersonIds).toEqual([]);
  });
});

// The role-mapping fix is the same kind of pure boundary that
// computeHouseholdMemberDiff is — branch-coverage on a switch statement is
// trivially worth locking down. Originally a regression: every wizard value was
// lowercase ('child', 'spouse') but the switch arms expected capitalized labels
// ('Child', 'Spouse/Domestic Partner'), so every member landed as OTHER_ADULT
// in the household DB and the caseworker view rendered children as adults.
describe('toHouseholdRole', () => {
  it.each<[string, ReturnType<typeof toHouseholdRole>]>([
    // Lowercase wizard values (current WIZARD_RELATIONSHIPS.value shape)
    ['child', 'CHILD'],
    ['son', 'CHILD'],
    ['daughter', 'CHILD'],
    ['stepchild', 'CHILD'],
    ['foster_child', 'CHILD'],
    ['foster child', 'CHILD'],
    ['spouse', 'SPOUSE'],
    ['partner', 'SPOUSE'],
    ['domestic partner', 'SPOUSE'],
    ['grandchild', 'OTHER_DEPENDENT'],
    // Historical capitalized labels — kept for back-compat with older callers
    ['Child', 'CHILD'],
    ['Spouse', 'SPOUSE'],
    ['Spouse/Domestic Partner', 'SPOUSE'],
    ['Grandchild', 'OTHER_DEPENDENT'],
    // Default fallback for unmapped relationships
    ['sibling', 'OTHER_ADULT'],
    ['parent', 'OTHER_ADULT'],
    ['other_relative', 'OTHER_ADULT'],
    ['', 'OTHER_ADULT'],
  ])('maps %j → %s', (input, expected) => {
    expect(toHouseholdRole(input)).toBe(expected);
  });

  it('is case-insensitive (normalizes input before matching)', () => {
    expect(toHouseholdRole('CHILD')).toBe('CHILD');
    expect(toHouseholdRole('SPOUSE')).toBe('SPOUSE');
  });

  it('trims surrounding whitespace before matching', () => {
    expect(toHouseholdRole('  child  ')).toBe('CHILD');
    expect(toHouseholdRole('\tspouse\n')).toBe('SPOUSE');
  });
});
