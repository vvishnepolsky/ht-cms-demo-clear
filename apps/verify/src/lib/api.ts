/**
 * Token-scoped client for the hosted-flow REST surface
 * (docs/api-contract.md § Hosted Verify Assist flow). The session token from
 * the URL is the credential — there is no login in this app, and it never talks
 * to a federation gateway or auth service.
 *
 * Same-origin: every call goes to `/api/flow/...` through the Vite `/api`
 * dev proxy (no CORS). A 404/410 from any endpoint means the link is invalid,
 * expired, or already consumed, and the UI degrades to the invalid-link screen
 * without leaking session state.
 */

const API_BASE = '/api';

export interface DocumentTraits {
  document_type: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  dob: string;
  sex: string | null;
  address_1: string;
  address_2: string | null;
  city: string;
  subdivision: string;
  postal_code: string;
  country: string;
  document_number: string;
  issuing_subdivision: string;
  issuing_country: string;
  issued_date: string | null;
  expiration_date: string;
}

export interface HealthInsuranceTraits {
  payer_id: string | null;
  payer_name: string | null;
  plan_status: string | null;
  group_name: string | null;
  group_id: string | null;
  insurance_member_id: string | null;
  policy_holder_first_name: string | null;
  policy_holder_last_name: string | null;
}

export interface Determination {
  result: 'issue_found' | 'clear';
  duplicate_enrollment: boolean;
  payer_state: string | null;
  payer_state_name: string | null;
  coverage: HealthInsuranceTraits | null;
}

export interface FlowCheck {
  name: string;
  status: string;
  /** Real CLEAR API outcome; absent on stubbed/mock rows. */
  value?: boolean | null;
}

// 'pending' = verified with CLEAR but held for back-office review (a provider
// name/DOB mismatch) — terminal for the flow UI.
export type FlowStatus = 'awaiting_user' | 'in_progress' | 'success' | 'pending' | 'failed' | 'expired';

export type FlowResolution = 'ended_submit_proof' | 'confirm_enrolled';

export interface FlowSession {
  verificationId: string;
  status: FlowStatus;
  role: 'applicant' | 'household' | 'provider';
  /** 'mock' plays the in-app CLEAR capture replica; 'sandbox' redirects to clearUrl. */
  mode: 'mock' | 'sandbox';
  externalRef: string | null;
  /** Provider verifications: the provider's NPI (shown instead of externalRef). */
  npi: string | null;
  subjectName: string | null;
  checks: FlowCheck[];
  traits: {
    document?: DocumentTraits | null;
    phone?: { number: string | null } | null;
    ssnLast4?: string | null;
  } | null;
  determination: Determination | null;
  resolution: FlowResolution | null;
  /** Sandbox mode only: CLEAR's real hosted-UI URL for the verification step. */
  clearUrl: string | null;
  /**
   * Where the flow closes out to — back into the origin application. May be
   * null for a staff-initiated verification with no origin app, in which case
   * the flow ends on a completion screen instead of a hand-back.
   */
  returnTo: string | null;
}

/** Non-2xx response; `status` lets callers distinguish invalid/expired tokens (404/410). */
export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`request_failed_${status}`);
    this.name = 'ApiError';
  }
}

/** True when the error means the link is dead (unknown, expired, or consumed). */
export function isTokenGone(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 410);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    throw new ApiError(res.status);
  }
  return (await res.json()) as T;
}

export async function getFlowSession(token: string): Promise<FlowSession> {
  const { session } = await request<{ session: FlowSession }>(`/flow/sessions/${encodeURIComponent(token)}`);
  return session;
}

/** Captured stills from the mock CLEAR step, as image data URLs (≤ ~3 MB each). */
export interface CaptureImages {
  selfie?: string;
  documentFront?: string;
  documentBack?: string;
}

/**
 * Mock mode only — stands in for CLEAR's servers completing the verification.
 * Real webcam captures ride along to the staff console; a slot whose capture
 * was simulated (camera unavailable) is simply omitted. The phone entered in
 * the capture replica rides along too — it drives the server's phone-triggered
 * demo identities, mirroring how real runs carry the phone in CLEAR's traits.
 */
export async function completeClearStep(token: string, images: CaptureImages = {}, phone?: string): Promise<void> {
  await request(`/flow/sessions/${encodeURIComponent(token)}/clear-complete`, {
    method: 'POST',
    body: JSON.stringify({ ...images, phone }),
  });
}

/**
 * Close-out: record the applicant's answer to the coverage finding. When the
 * applicant chose "coverage ended" the proof file rides along as a base64 data
 * URL (Results.tsx caps it at ~6 MB; the server caps at 8 MB) and the server
 * stores it as a case document — the response carries its `proofDocumentId`.
 */
export async function sendResolution(
  token: string,
  resolution: FlowResolution,
  proof?: { name: string; proofDataUrl?: string; proofMimeType?: string },
): Promise<{ returnTo: string | null; proofDocumentId?: string | null }> {
  return request<{ ok: boolean; returnTo: string | null; proofDocumentId?: string | null }>(
    `/flow/sessions/${encodeURIComponent(token)}/resolution`,
    {
      method: 'POST',
      body: JSON.stringify({
        resolution,
        proofName: proof?.name,
        proofDataUrl: proof?.proofDataUrl,
        proofMimeType: proof?.proofMimeType,
      }),
    },
  );
}
