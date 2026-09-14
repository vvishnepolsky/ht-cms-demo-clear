/**
 * Verify Assist REST client (`/api/verifications*`) — the CLEAR identity
 * verification handoff. See docs/api-contract.md § Verify Assist REST and
 * docs/verify-assist-api-contract.md for the full shapes.
 *
 * Same origin (`runtimeEnv.identityUrl`, default ''), session cookie via
 * `credentials: 'include'`, `x-app` so the server reads the resident cookie.
 * Owners get the identity-only view of a verification: `traits.document`,
 * `traits.phone`, `traits.ssnLast4`, plus `determination` and `resolution`.
 * Coverage details (`traits.health_insurance`, flags) are staff-only and
 * never reach this client.
 */
import { runtimeEnv } from '@ht/runtime-env';
import { APP_KEY } from './identity-client';

const BASE_URL = runtimeEnv.identityUrl;

export type VerificationStatus = 'awaiting_user' | 'in_progress' | 'success' | 'failed' | 'expired';
export type VerificationRole = 'applicant' | 'household';

/**
 * Identity traits read off the government ID. The server mirrors CLEAR's
 * Verified API field names; the GraphQL `DocumentTraits` type in the contract
 * uses slightly different spellings (`date_of_birth`/`address_line1`/`state`/
 * `gender`), so both variants are modelled here and normalised by
 * `normalizeDocumentTraits`.
 */
export interface RawDocumentTraits {
  document_type?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  // CLEAR spelling
  dob?: string | null;
  sex?: string | null;
  address_1?: string | null;
  address_2?: string | null;
  subdivision?: string | null;
  // GraphQL/contract spelling
  date_of_birth?: string | null;
  gender?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  state?: string | null;
  // shared
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  issuing_state?: string | null;
  issuing_subdivision?: string | null;
  document_number_last4?: string | null;
  expiration_date?: string | null;
}

export interface DocumentTraits {
  documentType: string | null;
  firstName: string;
  middleName: string;
  lastName: string;
  /** ISO yyyy-mm-dd */
  dob: string;
  /** Raw gender/sex code from the ID (e.g. 'M' | 'F' | 'X'), or ''. */
  sex: string;
  streetAddress: string;
  aptUnit: string;
  city: string;
  state: string;
  zip: string;
}

export interface VerificationCheck {
  name: string;
  status: string;
}

export interface CoverageDetermination {
  result: 'issue_found' | 'clear';
  duplicate_enrollment: boolean;
  payer_state: string | null;
  payer_state_name: string | null;
}

export interface VerificationTraits {
  document: RawDocumentTraits | null;
  /** Server returns either a bare string or CLEAR's `{ number }` object. */
  phone?: string | { number: string | null } | null;
  /** Demo posture: only the last 4 leave the server. */
  ssnLast4?: string | null;
}

export interface Verification {
  id: string;
  externalRef: string | null;
  role: VerificationRole;
  subjectName: string | null;
  status: VerificationStatus;
  hostedUrl: string;
  createdAt: string;
  completedAt: string | null;
  checks: VerificationCheck[];
  traits: VerificationTraits | null;
  determination: CoverageDetermination | null;
  /** 'ended_submit_proof' | 'confirm_enrolled' | null */
  resolution: string | null;
}

export interface CreatedVerification {
  id: string;
  externalRef: string | null;
  hostedUrl: string;
  status: VerificationStatus;
}

export class VerifyAssistError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'VerifyAssistError';
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: 'include',
      headers: {
        'x-app': APP_KEY,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new VerifyAssistError('network_error', 'Network request failed', 0);
  }
  if (!res.ok) {
    let code = 'unknown_error';
    let message = 'Request failed';
    try {
      // Either `{ error: 'code', message }` (identity style) or `{ error: { code, message } }`.
      const payload = (await res.json()) as {
        error?: string | { code?: string; message?: string };
        message?: string;
      };
      if (typeof payload.error === 'string') {
        code = payload.error;
        message = payload.message ?? message;
      } else if (payload.error) {
        code = payload.error.code ?? code;
        message = payload.error.message ?? message;
      }
    } catch {
      // Non-JSON error body — keep the static defaults.
    }
    throw new VerifyAssistError(code, message, res.status);
  }
  return (await res.json()) as T;
}

/** `POST /api/verifications { role }` → hosted flow URL to hand the browser to. */
export function createVerification(role: VerificationRole): Promise<{ verification: CreatedVerification }> {
  return request('POST', '/api/verifications', { role });
}

/** `GET /api/verifications/:id` — owner view. */
export function getVerification(id: string): Promise<{ verification: Verification }> {
  return request('GET', `/api/verifications/${encodeURIComponent(id)}`);
}

// ─── Normalisers ─────────────────────────────────────────────────────────────

function str(v: string | null | undefined): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Normalise either spelling of the document traits into the wizard's field names. */
export function normalizeDocumentTraits(raw: RawDocumentTraits | null | undefined): DocumentTraits | null {
  if (!raw) return null;
  const doc: DocumentTraits = {
    documentType: raw.document_type ?? null,
    firstName: str(raw.first_name),
    middleName: str(raw.middle_name),
    lastName: str(raw.last_name),
    dob: normalizeIsoDate(raw.date_of_birth ?? raw.dob),
    sex: str(raw.gender ?? raw.sex),
    streetAddress: str(raw.address_line1 ?? raw.address_1),
    aptUnit: str(raw.address_line2 ?? raw.address_2),
    city: str(raw.city),
    state: str(raw.state ?? raw.subdivision).toUpperCase(),
    zip: str(raw.postal_code).replace(/\D/g, '').slice(0, 5),
  };
  if (!doc.firstName && !doc.lastName && !doc.dob) return null;
  return doc;
}

/** Phone trait → 10 raw digits (the wizard's storage form), or ''. */
export function normalizePhoneTrait(phone: VerificationTraits['phone']): string {
  const value = typeof phone === 'string' ? phone : phone?.number ?? '';
  const digits = value.replace(/\D/g, '');
  // Strip a leading US country code.
  return (digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits).slice(0, 10);
}

/**
 * Coerce a date to the form's `YYYY-MM-DD` (what `<input type="date">` holds).
 * Accepts ISO date/datetime strings and `MM/DD/YYYY`.
 */
export function normalizeIsoDate(value: string | null | undefined): string {
  const v = str(value);
  if (!v) return '';
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** Map an ID's gender code onto the wizard's `sex` values (female | male | x). */
export function normalizeSexTrait(sex: string): string {
  const s = sex.trim().toLowerCase();
  if (!s) return '';
  if (s === 'f' || s === 'female' || s === '2') return 'female';
  if (s === 'm' || s === 'male' || s === '1') return 'male';
  return 'x';
}
