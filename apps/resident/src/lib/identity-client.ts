/**
 * REST client for the demo server's identity endpoints (`/api/auth/*`,
 * `/api/enrollment`) — shapes are identity-service compatible, see
 * docs/api-contract.md § Identity REST.
 *
 * Same origin: `runtimeEnv.identityUrl` defaults to '' so requests go to
 * `/api/...` on the current origin (Vite dev proxy → :4000). The server keys
 * the session cookie (`cms-demo-resident_session`) and the role check off the
 * `x-app` header, so every call sends it.
 */

import { runtimeEnv } from '@ht/runtime-env';

const IDENTITY_URL = runtimeEnv.identityUrl;
const APP_KEY = 'cms-demo-resident' as const;

// --- Response shapes --------------------------------------------------------

export interface TokenPayload {
  sub: string;
  customerId: string;
  engagementId: string;
  programs: string[];
  policyId: string;
  firstName: string;
  lastName: string;
  roles: string[];
  permissions?: string[];
}

export interface LoginSession {
  sessionId: string;
  personId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  customerId: string;
  engagementId: string;
  programs: string[];
  issuedAt: string;
  expiresAt: string;
  status: string;
}

export interface LoginResponse {
  success: true;
  payload: TokenPayload;
  session: LoginSession;
}

export interface RegisterResponse {
  success: true;
  personId: string;
  identityId: string;
}

interface IdentityErrorBody {
  error: string;
  message: string;
  field?: string | null;
}

export class IdentityClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly field?: string | null,
  ) {
    super(message);
    this.name = 'IdentityClientError';
  }
}

const REQUEST_TIMEOUT_MS = 30_000;

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${IDENTITY_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app': APP_KEY },
      credentials: 'include',
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new IdentityClientError('request_timeout', 'Request timed out', 0);
    }
    if (e instanceof TypeError) {
      throw new IdentityClientError('network_error', 'Network error', 0);
    }
    throw e;
  }

  if (!response.ok) {
    let errorBody: IdentityErrorBody;
    try {
      errorBody = (await response.json()) as IdentityErrorBody;
    } catch {
      throw new IdentityClientError('network_error', 'An unexpected error occurred', response.status);
    }
    throw new IdentityClientError(errorBody.error, errorBody.message, response.status, errorBody.field);
  }

  return (await response.json()) as T;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return post<LoginResponse>('/api/auth/login', { email, password });
}

/**
 * Create the resident account. Returns `{ personId, identityId }` but does NOT
 * log in — callers follow with `login()` (which sets the session cookie) and
 * take `personId` from `session.personId` on that response.
 */
export async function register(args: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  customerId: string;
}): Promise<RegisterResponse> {
  return post<RegisterResponse>('/api/auth/register', args);
}

export interface EnrollResponse {
  success: true;
  engagement: { engagementId: string; personId: string; customerId: string; status: string };
}

/**
 * Enroll the authenticated participant in a program. Creates the Engagement
 * row that updatePerson and other tenant-scoped operations require.
 * Must be called AFTER login (auth cookie set).
 */
export async function enroll(personId: string, program: string): Promise<EnrollResponse> {
  return post<EnrollResponse>('/api/enrollment', { personId, program });
}

export interface LogoutResponse {
  success: true;
}

export async function logout(): Promise<LogoutResponse> {
  return post<LogoutResponse>('/api/auth/logout', {});
}

interface RefreshResponse {
  success: true;
  expiresIn: number;
}

/**
 * Extend the current session (`POST /api/auth/refresh`). Sessions last 7 days
 * so nothing calls this on a timer; kept for parity with the contract.
 */
export async function refresh(): Promise<{ expiresIn: number } | null> {
  try {
    const result = await post<RefreshResponse>('/api/auth/refresh', {});
    return { expiresIn: result.expiresIn };
  } catch (err) {
    if (err instanceof IdentityClientError) return null;
    throw err;
  }
}

export { APP_KEY };
