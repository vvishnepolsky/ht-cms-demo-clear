import { describe, it, expect, beforeEach } from 'vitest';
import { readMemberPersonIdsFor } from './useSubmitCase';
import { SESSION_KEYS } from '../lib/session-keys';

describe('readMemberPersonIdsFor', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns {} when MEMBER_PERSON_IDS is absent from sessionStorage', () => {
    const result = readMemberPersonIdsFor({
      householdMembers: [{ id: 'm1', firstName: 'A', lastName: 'B', dob: '2000-01-01' }],
    });
    expect(result).toEqual({});
  });

  it('returns {} when MEMBER_PERSON_IDS contains malformed JSON', () => {
    // useWireHousehold writes JSON; a corrupted session (extension, manual edit, race)
    // must degrade gracefully rather than throw and abort the submission.
    sessionStorage.setItem(SESSION_KEYS.MEMBER_PERSON_IDS, '{not valid json');
    const result = readMemberPersonIdsFor({
      householdMembers: [{ id: 'm1', firstName: 'A', lastName: 'B', dob: '2000-01-01' }],
    });
    expect(result).toEqual({});
  });

  it('returns {} when the parsed cache is a non-object (e.g. array, number)', () => {
    sessionStorage.setItem(SESSION_KEYS.MEMBER_PERSON_IDS, JSON.stringify(['not', 'an', 'object']));
    // Array.isArray would return true here, but we still want a plain map; arrays
    // are technically `typeof 'object'`, so the guard below is what catches them.
    const result = readMemberPersonIdsFor({
      householdMembers: [{ id: 'm1', firstName: 'A', lastName: 'B', dob: '2000-01-01' }],
    });
    // Arrays are typeof 'object' so they pass the guard; the lookup just produces no matches.
    // Either {} or no member entries — both are graceful. The contract is: never throw.
    expect(result).toEqual({});
  });

  it('returns {} when wizardData.householdMembers is missing or not an array', () => {
    sessionStorage.setItem(SESSION_KEYS.MEMBER_PERSON_IDS, JSON.stringify({ 'A|B|2000-01-01': 'p1' }));
    expect(readMemberPersonIdsFor({})).toEqual({});
    expect(readMemberPersonIdsFor({ householdMembers: 'not-an-array' })).toEqual({});
    expect(readMemberPersonIdsFor(null)).toEqual({});
    expect(readMemberPersonIdsFor(undefined)).toEqual({});
  });

  it('skips members without a string id', () => {
    sessionStorage.setItem(
      SESSION_KEYS.MEMBER_PERSON_IDS,
      JSON.stringify({ 'A|B|2000-01-01': 'p1', 'C|D|1999-01-01': 'p2' }),
    );
    const result = readMemberPersonIdsFor({
      householdMembers: [
        { id: 'm1', firstName: 'A', lastName: 'B', dob: '2000-01-01' },
        { firstName: 'C', lastName: 'D', dob: '1999-01-01' }, // no id
        { id: 42, firstName: 'E', lastName: 'F', dob: '1998-01-01' }, // non-string id
      ],
    });
    expect(result).toEqual({ m1: 'p1' });
  });

  it('skips members whose cached value is missing or not a non-empty string', () => {
    sessionStorage.setItem(
      SESSION_KEYS.MEMBER_PERSON_IDS,
      JSON.stringify({
        'A|B|2000-01-01': 'p1',
        'C|D|1999-01-01': '', // empty string
        'E|F|1998-01-01': null, // null
        'G|H|1997-01-01': 42, // non-string
      }),
    );
    const result = readMemberPersonIdsFor({
      householdMembers: [
        { id: 'm1', firstName: 'A', lastName: 'B', dob: '2000-01-01' },
        { id: 'm2', firstName: 'C', lastName: 'D', dob: '1999-01-01' },
        { id: 'm3', firstName: 'E', lastName: 'F', dob: '1998-01-01' },
        { id: 'm4', firstName: 'G', lastName: 'H', dob: '1997-01-01' },
        { id: 'm5', firstName: 'I', lastName: 'J', dob: '1996-01-01' }, // not in cache
      ],
    });
    expect(result).toEqual({ m1: 'p1' });
  });

  it('builds the full map when cache and members align', () => {
    sessionStorage.setItem(
      SESSION_KEYS.MEMBER_PERSON_IDS,
      JSON.stringify({
        'Marcus|Carter|1989-11-15': 'person-marcus',
        'Aaliyah|Carter|2017-09-22': 'person-aaliyah',
      }),
    );
    const result = readMemberPersonIdsFor({
      householdMembers: [
        { id: 'm1', firstName: 'Marcus', lastName: 'Carter', dob: '1989-11-15' },
        { id: 'm2', firstName: 'Aaliyah', lastName: 'Carter', dob: '2017-09-22' },
      ],
    });
    expect(result).toEqual({ m1: 'person-marcus', m2: 'person-aaliyah' });
  });

  it('uses empty strings for member fields the wizard left blank when building the cache key', () => {
    // Guards against an edge case where a member's dob is empty/undefined: the
    // key shape stays consistent (`A|B|`) rather than producing `A|B|undefined`,
    // which would never match a cache populated by useWireHousehold.
    sessionStorage.setItem(SESSION_KEYS.MEMBER_PERSON_IDS, JSON.stringify({ 'A|B|': 'p1' }));
    const result = readMemberPersonIdsFor({
      householdMembers: [{ id: 'm1', firstName: 'A', lastName: 'B' }], // dob omitted
    });
    expect(result).toEqual({ m1: 'p1' });
  });
});
