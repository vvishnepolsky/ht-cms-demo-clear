/**
 * Case-list ordering helpers.
 *
 *  - `getCaseNeighbors` — prev/next ids for in-queue navigation.
 *  - `prioritizeOpenVerifyAssistFlags` — pins cases with an open out-of-state
 *    Medicaid finding (CLEAR / Verify Assist) to the top of the queue so the
 *    caseworker sees them first. Stable: relative order inside each partition
 *    is preserved, so it composes with whatever sort ran before it.
 */

import { hasOpenOutOfStateFlag } from '../types/ee';

export interface CaseListItem {
  readonly id: string;
}

export interface CaseNeighbors {
  readonly prev: string | null;
  readonly next: string | null;
}

export function getCaseNeighbors<T extends CaseListItem>(cases: readonly T[], currentId: string): CaseNeighbors {
  const idx = cases.findIndex((c) => c.id === currentId);
  if (idx < 0) return { prev: null, next: null };
  return {
    prev: idx > 0 ? cases[idx - 1]!.id : null,
    next: idx < cases.length - 1 ? cases[idx + 1]!.id : null,
  };
}

export interface VerifyAssistOrderable {
  readonly identityVerification?: {
    determination: { duplicate_enrollment: boolean } | null;
    flag: { status: string } | null;
  } | null;
}

/** True when the case should be pinned to the top of the queue. */
export function isPinnedVerifyAssistCase(c: VerifyAssistOrderable): boolean {
  return hasOpenOutOfStateFlag(c.identityVerification);
}

export function prioritizeOpenVerifyAssistFlags<T extends VerifyAssistOrderable>(cases: readonly T[]): T[] {
  const pinned: T[] = [];
  const rest: T[] = [];
  for (const c of cases) (isPinnedVerifyAssistCase(c) ? pinned : rest).push(c);
  return [...pinned, ...rest];
}
