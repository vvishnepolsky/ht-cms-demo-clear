/**
 * Token-scoped client for the hosted-flow endpoints
 * (docs/api-contract.md § Hosted Verify Assist flow). The session token from
 * the URL is the credential — there is no login in this app.
 */

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
  /** Real CLEAR API outcome; absent on legacy mock rows. */
  value?: boolean | null;
}

export type FlowStatus = 'awaiting_user' | 'in_progress' | 'success' | 'failed' | 'expired';

export type FlowResolution = 'ended_submit_proof' | 'confirm_enrolled';

export interface FlowSession {
  verificationId: string;
  status: FlowStatus;
  role: 'applicant' | 'household';
  mode: 'mock' | 'sandbox';
  externalRef: string | null;
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
  /** Where the flow closes out to — back into the origin application. */
  returnTo: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`request_failed_${res.status}`);
  }
  return (await res.json()) as T;
}

export async function getFlowSession(token: string): Promise<FlowSession> {
  const { session } = await request<{ session: FlowSession }>(
    `/api/flow/sessions/${encodeURIComponent(token)}`,
  );
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
 * was simulated (camera unavailable) is simply omitted.
 */
export async function completeClearStep(token: string, images: CaptureImages = {}): Promise<void> {
  await request(`/api/flow/sessions/${encodeURIComponent(token)}/clear-complete`, {
    method: 'POST',
    body: JSON.stringify(images),
  });
}

export async function sendResolution(
  token: string,
  resolution: FlowResolution,
  proofName?: string,
): Promise<{ returnTo: string }> {
  return request<{ ok: boolean; returnTo: string }>(
    `/api/flow/sessions/${encodeURIComponent(token)}/resolution`,
    { method: 'POST', body: JSON.stringify({ resolution, proofName }) },
  );
}
