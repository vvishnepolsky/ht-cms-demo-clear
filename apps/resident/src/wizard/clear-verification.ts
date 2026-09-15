/**
 * CLEAR identity verification round-trip helpers for the wizard's 'personal'
 * step (Verify Assist handoff).
 *
 * Outbound (`startClearVerification`): POST /api/verifications, record a
 * pending marker `{ id, role }` in sessionStorage, flush the form to
 * localStorage (FormDataProvider mirrors every change there, so by the time
 * the click handler runs the draft is already persisted — we just force one
 * last synchronous write), then hand the browser to the hosted flow.
 *
 * Inbound: the hosted flow returns the browser to `/#/personal?verified=<id>`.
 * `useStepRouter` (app.tsx) parses the hash, strips the query, lands on the
 * 'personal' step and stashes the id via `setReturnLegVerificationId`. The
 * personal step picks it up with `takeReturnLegVerificationId()`, polls
 * GET /api/verifications/:id to a terminal status and, on `success`, applies
 * `traits.document` (+ phone, ssnLast4) to `primaryApplicant` via
 * `applyVerificationToPrimary`.
 */
import {
  createVerification,
  getVerification,
  normalizeDocumentTraits,
  normalizeIsoDate,
  normalizePhoneTrait,
  normalizeSexTrait,
  type Verification,
  type VerificationRole,
} from '../lib/verify-assist-client';
import { SESSION_KEYS } from '../lib/session-keys';
import type { HealthInsuranceEntry, IdentityVerification, PrimaryApplicant, WizardFormData } from './form-data.types';

// ─── Pending marker (sessionStorage) ─────────────────────────────────────────

export interface PendingVerification {
  id: string;
  role: VerificationRole;
}

export function readPendingVerification(): PendingVerification | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEYS.PENDING_VERIFICATION);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingVerification>;
    return typeof parsed?.id === 'string' && parsed.id ? { id: parsed.id, role: parsed.role ?? 'applicant' } : null;
  } catch {
    return null;
  }
}

export function writePendingVerification(pending: PendingVerification): void {
  try {
    sessionStorage.setItem(SESSION_KEYS.PENDING_VERIFICATION, JSON.stringify(pending));
  } catch {
    // sessionStorage unavailable — the return leg still has the ?verified= id.
  }
}

export function clearPendingVerification(): void {
  try {
    sessionStorage.removeItem(SESSION_KEYS.PENDING_VERIFICATION);
  } catch {
    // ignore
  }
}

// ─── Return-leg handoff (module-level, hash router → personal step) ──────────

let returnLegVerificationId: string | null = null;

/** Called by the hash router when it sees `#/personal?verified=<id>`. */
export function setReturnLegVerificationId(id: string | null): void {
  returnLegVerificationId = id;
}

export interface ReturnLeg {
  id: string;
  /** 'url' = came back via `?verified=`; 'pending' = only the sessionStorage marker exists. */
  source: 'url' | 'pending';
}

/**
 * One-shot read for the personal step: the id from the return URL, else the
 * pending marker's id (covers a hosted flow that dropped the query string, or
 * the user pressing Back into the wizard mid-flow). Returns null when there is
 * nothing to poll. Clears the module slot so a later remount of the step does
 * not re-run the return leg.
 */
export function takeReturnLegVerificationId(): ReturnLeg | null {
  const fromUrl = returnLegVerificationId;
  returnLegVerificationId = null;
  if (fromUrl) return { id: fromUrl, source: 'url' };
  const pending = readPendingVerification();
  return pending ? { id: pending.id, source: 'pending' } : null;
}

/**
 * Parse a wizard hash like `#/personal?verified=abc` → `{ stepId, params }`.
 * The wizard historically only ever had `#/<step>`; the hosted flow's
 * `returnTo` adds a query string after the step id, which must not break
 * step resolution.
 */
export function parseWizardHash(hash: string): { stepId: string; params: URLSearchParams } {
  const trimmed = (hash || '').replace(/^#\/?/, '');
  const q = trimmed.indexOf('?');
  if (q === -1) return { stepId: trimmed, params: new URLSearchParams() };
  return { stepId: trimmed.slice(0, q), params: new URLSearchParams(trimmed.slice(q + 1)) };
}

// ─── Outbound ────────────────────────────────────────────────────────────────

/**
 * Create the verification session, persist the pending marker, run the
 * caller's flush (persist the form) and navigate to the hosted flow. Resolves
 * only if navigation did not happen (it normally never resolves because the
 * page unloads); rejects on API failure so the CTA can re-enable.
 */
export async function startClearVerification(role: VerificationRole, flushForm?: () => void): Promise<void> {
  const { verification } = await createVerification(role);
  writePendingVerification({ id: verification.id, role });
  flushForm?.();
  window.location.assign(verification.hostedUrl);
}

// ─── Inbound polling ─────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 20; // ~30s budget

const TERMINAL: ReadonlySet<string> = new Set(['success', 'failed', 'expired']);

/**
 * Poll the verification to a terminal status. Resolves with the last-seen
 * verification either way (caller branches on `status`); a still-pending
 * verification after the budget is treated by callers as a failure.
 */
export async function pollVerification(
  id: string,
  opts: { intervalMs?: number; maxAttempts?: number; signal?: { cancelled: boolean } } = {},
): Promise<Verification> {
  const interval = opts.intervalMs ?? POLL_INTERVAL_MS;
  const max = opts.maxAttempts ?? POLL_MAX_ATTEMPTS;
  let last: Verification | null = null;
  for (let attempt = 0; attempt < max; attempt++) {
    if (opts.signal?.cancelled) break;
    const { verification } = await getVerification(id);
    last = verification;
    if (TERMINAL.has(verification.status)) return verification;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  if (!last) throw new Error('verification_unavailable');
  return last;
}

// ─── Apply traits → form ─────────────────────────────────────────────────────

/** PrimaryApplicant keys a CLEAR verification can prefill. */
export const CLEAR_PREFILLABLE_FIELDS = [
  'firstName',
  'middleName',
  'lastName',
  'dob',
  'sex',
  'streetAddress',
  'aptUnit',
  'city',
  'state',
  'zip',
  'phone',
  'ssn',
] as const;
export type ClearPrefillableField = (typeof CLEAR_PREFILLABLE_FIELDS)[number];

/**
 * Pure: apply a successful verification's identity traits to the primary
 * applicant. Only non-empty traits overwrite the form; each overwritten key is
 * recorded in `identityVerification.verifiedFields` so the screen can badge
 * it (and drop the badge if the user edits it later). Returns the input
 * unchanged when the verification has no document traits.
 */
export function applyVerificationToPrimary(
  primary: PrimaryApplicant | undefined,
  verification: Verification,
): PrimaryApplicant {
  const base: PrimaryApplicant = { ...(primary ?? {}) };
  const doc = normalizeDocumentTraits(verification.traits?.document);
  if (!doc) return base;

  const verifiedFields: string[] = [];
  const next: PrimaryApplicant = { ...base };
  const put = (key: ClearPrefillableField, value: string) => {
    if (!value) return;
    (next as Record<string, unknown>)[key] = value;
    verifiedFields.push(key);
  };

  put('firstName', doc.firstName);
  put('middleName', doc.middleName);
  put('lastName', doc.lastName);
  put('dob', doc.dob);
  put('sex', normalizeSexTrait(doc.sex));
  put('streetAddress', doc.streetAddress);
  put('aptUnit', doc.aptUnit);
  put('city', doc.city);
  put('state', doc.state);
  put('zip', doc.zip);
  put('phone', normalizePhoneTrait(verification.traits?.phone));

  // A verified address means they are not without a fixed address.
  if (doc.streetAddress) next.homeless = false;

  const ssnLast4 = verification.traits?.ssnLast4?.replace(/\D/g, '').slice(-4) || null;
  if (ssnLast4) {
    // The full SSN never reaches the client: clear any typed value so the
    // masked read-only field is the single source of truth.
    next.ssn = '';
    next.noSSN = false;
    verifiedFields.push('ssn');
  }

  const identityVerification: IdentityVerification = {
    id: verification.id,
    provider: 'CLEAR',
    status: 'success',
    verifiedFields,
    ssnLast4,
    verifiedAt: verification.completedAt ?? new Date().toISOString(),
  };
  next.identityVerification = identityVerification;
  return next;
}

/** Convenience wrapper over the whole form. */
export function applyVerificationToForm(data: WizardFormData, verification: Verification): WizardFormData {
  return { ...data, primaryApplicant: applyVerificationToPrimary(data.primaryApplicant, verification) };
}

/** True when `field` was prefilled by CLEAR and not edited since. */
export function isFieldVerified(primary: PrimaryApplicant | undefined, field: string): boolean {
  return !!primary?.identityVerification?.verifiedFields?.includes(field);
}

/**
 * Pure: the user edited `field` — drop it from verifiedFields. The
 * verification record itself stays (the identity was still verified); only
 * the per-field badge goes away.
 */
export function unverifyField(primary: PrimaryApplicant, field: string): PrimaryApplicant {
  const iv = primary.identityVerification;
  if (!iv || !iv.verifiedFields.includes(field)) return primary;
  return { ...primary, identityVerification: { ...iv, verifiedFields: iv.verifiedFields.filter((f) => f !== field) } };
}

/** Friendly copy for the applicant's in-flow answer about out-of-state coverage. */
export function describeResolution(resolution: string | null | undefined): string | null {
  switch (resolution) {
    case 'ended_submit_proof':
      return 'You told us that coverage has ended and submitted proof.';
    case 'confirm_enrolled':
      return 'You confirmed you are still enrolled in that coverage.';
    default:
      return null;
  }
}

// ─── Coverage discovery → insurance step ─────────────────────────────────────

/** Wizard "type of coverage" values the insurance step offers. */
const INSURANCE_TYPES = new Set(['employer', 'marketplace', 'medicare', 'tricare', 'private', 'other']);
/** Relationship values the step's REL_OPTS_V2 select offers. */
const HOLDER_RELATIONSHIPS = new Set(['spouse', 'child', 'stepchild', 'parent', 'sibling', 'grandchild', 'grandparent', 'other_relative', 'roommate', 'other']);

/**
 * Pure: when the verification's coverage discovery found the applicant's OWN
 * (non-Medicaid, non-duplicate) coverage — e.g. an active employer plan — prefill
 * one active entry for the primary applicant ('0') on the insurance step,
 * marked `source: 'clear'` and locked. A duplicate-enrollment finding (out-of-
 * state Medicaid) is a caseworker matter and never prefills anything; an entry
 * the applicant already typed is left alone. Returns the input unchanged when
 * there is nothing to apply.
 */
export function applyVerificationCoverageToInsurance(
  healthInsurance: Record<string, HealthInsuranceEntry> | undefined,
  verification: Verification,
): Record<string, HealthInsuranceEntry> {
  const current = healthInsurance ?? {};
  const det = verification.determination;
  const cov = det?.coverage;
  if (!det || det.duplicate_enrollment || !cov) return current;
  const type = (det.coverage_type ?? cov.coverage_type ?? '').toLowerCase();
  if (!type || type === 'medicaid' || !INSURANCE_TYPES.has(type)) return current;
  if (cov.plan_status && cov.plan_status.toUpperCase() !== 'ACTIVE') return current;
  const existing = current['0'];
  if (existing && existing.source !== 'clear' && existing.hasInsurance) return current;

  const holderName = [cov.policy_holder_first_name, cov.policy_holder_last_name].filter(Boolean).join(' ').trim();
  const relationship = (cov.policy_holder_relationship ?? '').toLowerCase();
  const differentHolder = !!relationship && relationship !== 'self';
  const entry: HealthInsuranceEntry = {
    hasInsurance: 'yes',
    insuranceType: type,
    companyName: cov.payer_name ?? '',
    policyNumber: cov.insurance_member_id ?? '',
    groupNumber: cov.group_id ?? '',
    differentHolder,
    holderName: differentHolder ? holderName : '',
    holderRelationship: differentHolder ? (HOLDER_RELATIONSHIPS.has(relationship) ? relationship : 'other') : '',
    premium: cov.monthly_premium != null ? String(cov.monthly_premium) : '',
    coverageStartDate: normalizeIsoDate(cov.coverage_start_date),
    coverageEndDate: '',
    lossReason: '',
    skipped: false,
    source: 'clear',
    locked: true,
  };
  return { ...current, '0': entry };
}
