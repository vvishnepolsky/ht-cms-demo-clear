/**
 * Per-step async "before continue" registry.
 *
 * A step component that needs to run an async side effect (e.g. a GraphQL
 * mutation) before the wizard advances can call `useStepSubmit(fn)` in
 * render. The wizard's BottomBar Continue button awaits the registered
 * function via `runPendingSubmit()` and only advances on `{ ok: true }`.
 *
 * Single-slot registry — only one step is on-screen at a time, so we
 * don't need a stack. The hook clears the slot on unmount.
 */

import { useEffect } from 'react';

export type SubmitResult = { ok: boolean; error?: string | null };
export type SubmitFn = () => Promise<SubmitResult>;

let pending: SubmitFn | null = null;

export function useStepSubmit(fn: SubmitFn): void {
  // eslint-disable-next-line no-restricted-syntax -- imperative singleton registration: register a render-time callback into a module-level slot so the wizard's BottomBar Continue button can `await` the active step's submitter. Named alternatives (key-based reset, mutation onCompleted, event handlers) don't apply: the call site only runs once per step mount, the cleanup must clear the slot when the step unmounts, and there's no Apollo mutation to hang an `onCompleted` off — the hook is the registration boundary itself.
  useEffect(() => {
    pending = fn;
    return () => {
      if (pending === fn) pending = null;
    };
  }, [fn]);
}

export async function runPendingSubmit(): Promise<SubmitResult> {
  if (!pending) return { ok: true };
  try {
    return await pending();
  } catch (err) {
    // Belt-and-suspenders: all current pending submitters catch internally
    // and return static strings, so this branch shouldn't fire. Log the
    // error name (not the raw message) for signal; show a static fallback.
    // Per standards/coding-standards.md § Error handling in mutations.
    console.error('[runPendingSubmit] unexpected uncaught error', {
      name: err instanceof Error ? err.name : typeof err,
    });
    return { ok: false, error: 'An unexpected error occurred. Please try again.' };
  }
}
