/**
 * Unit tests for EligibilityNoticeSection logic (ENG-1726).
 *
 * Component rendering tests are omitted — no jsdom/testing-library in this app.
 * The branching logic is extracted into `resolveNoticeErrorMessage` so it can
 * be tested as a pure function covering: domain error codes, network-error
 * fallback (S-3), and the no-error / empty-state path (S-2).
 */

import { describe, it, expect } from 'vitest';
import { resolveNoticeErrorMessage } from './DocumentsTab';

describe('resolveNoticeErrorMessage', () => {
  it('returns the NOT_FOUND message for code NOT_FOUND', () => {
    const msg = resolveNoticeErrorMessage('NOT_FOUND', false);
    expect(msg).toBe('No eligibility notice has been generated for this case.');
  });

  it('returns the STORAGE_FAILED message for code STORAGE_FAILED', () => {
    const msg = resolveNoticeErrorMessage('STORAGE_FAILED', false);
    expect(msg).toBe('The notice could not be retrieved. Please try again later.');
  });

  it('returns the INTERNAL_ERROR message for code INTERNAL_ERROR', () => {
    const msg = resolveNoticeErrorMessage('INTERNAL_ERROR', false);
    expect(msg).toBe('An unexpected error occurred. Please try again later.');
  });

  it('falls back to INTERNAL_ERROR for an unrecognised domain error code', () => {
    const msg = resolveNoticeErrorMessage('UNKNOWN_CODE', false);
    expect(msg).toBe('An unexpected error occurred. Please try again later.');
  });

  it('returns INTERNAL_ERROR for a network error with no domain error (S-3)', () => {
    // When Apollo returns error=ApolloError and firstError is undefined the
    // component calls resolveNoticeErrorMessage(undefined, true).  This must
    // NOT fall through to the pending-case copy — it must surface the generic
    // error message so the caseworker knows something went wrong.
    const msg = resolveNoticeErrorMessage(undefined, true);
    expect(msg).toBe('An unexpected error occurred. Please try again later.');
  });

  it('returns null when there is no domain error and no network error (S-2 / empty state)', () => {
    // This is the { noticeUrl: null, errors: [] } case — notice exists but has
    // not been generated yet.  The component renders the pending-case copy;
    // this helper correctly signals "no error to display".
    const msg = resolveNoticeErrorMessage(undefined, false);
    expect(msg).toBeNull();
  });

  it('domain error code takes precedence over network error flag', () => {
    // errorPolicy:'all' can return both data.errors and ApolloError simultaneously.
    // Domain code wins — it is more specific than the generic network fallback.
    const msg = resolveNoticeErrorMessage('NOT_FOUND', true);
    expect(msg).toBe('No eligibility notice has been generated for this case.');
  });
});
