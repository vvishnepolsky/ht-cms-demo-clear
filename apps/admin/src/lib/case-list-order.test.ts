import { describe, expect, it } from 'vitest';
import { getCaseNeighbors, prioritizeOpenVerifyAssistFlags } from './case-list-order';

const cases = [
  { id: 'a', caseNumber: 'IA-1' },
  { id: 'b', caseNumber: 'IA-2' },
  { id: 'c', caseNumber: 'IA-3' },
] as const;

describe('getCaseNeighbors', () => {
  it('returns null prev for first item', () => {
    expect(getCaseNeighbors(cases, 'a')).toEqual({ prev: null, next: 'b' });
  });
  it('returns prev and next for middle item', () => {
    expect(getCaseNeighbors(cases, 'b')).toEqual({ prev: 'a', next: 'c' });
  });
  it('returns null next for last item', () => {
    expect(getCaseNeighbors(cases, 'c')).toEqual({ prev: 'b', next: null });
  });
  it('returns nulls when id not in list', () => {
    expect(getCaseNeighbors(cases, 'z')).toEqual({ prev: null, next: null });
  });
  it('returns nulls for empty list', () => {
    expect(getCaseNeighbors([], 'a')).toEqual({ prev: null, next: null });
  });
});

describe('prioritizeOpenVerifyAssistFlags', () => {
  const oos = (id: string, flagStatus: string | null) => ({
    id,
    identityVerification: {
      determination: { duplicate_enrollment: true },
      flag: flagStatus ? { status: flagStatus } : null,
    },
  });
  const clean = (id: string) => ({
    id,
    identityVerification: { determination: { duplicate_enrollment: false }, flag: null },
  });
  const none = (id: string) => ({ id, identityVerification: null });

  it('pins open / in_review out-of-state findings to the top, preserving relative order', () => {
    const list = [none('a'), oos('b', 'open'), clean('c'), oos('d', 'in_review'), oos('e', null)];
    expect(prioritizeOpenVerifyAssistFlags(list).map((c) => c.id)).toEqual(['b', 'd', 'e', 'a', 'c']);
  });

  it('does not pin resolved or dismissed flags', () => {
    const list = [none('a'), oos('b', 'resolved'), oos('c', 'dismissed')];
    expect(prioritizeOpenVerifyAssistFlags(list).map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('is a no-op for lists without verify-assist data', () => {
    const list = [none('a'), none('b')];
    expect(prioritizeOpenVerifyAssistFlags(list).map((c) => c.id)).toEqual(['a', 'b']);
  });
});
