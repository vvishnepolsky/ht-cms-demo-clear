/**
 * REST client for the demo server's identity endpoints (`/api/auth/*`).
 *
 * Shapes are copied from ht-platform's identity-service so the login flow and
 * auth-store hydration work unchanged. Requests go to the same origin as the
 * SPA (dev: Vite proxies `/api` → apps/server on :4000) and carry the
 * `x-app: cms-demo-admin` header, which tells the server to read/write the
 * admin session cookie and to enforce the caseworker|admin role.
 */

import { runtimeEnv } from '@ht/runtime-env';

// Same-origin by default ('' from @ht/runtime-env); a full URL can be injected
// via VITE_IDENTITY_URL / window.__ENV__ when the API lives elsewhere.
const IDENTITY_URL = runtimeEnv.identityUrl.replace(/\/$/, '');
const APP_KEY = 'cms-demo-admin' as const;

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

export interface LogoutResponse {
  success: true;
}

export async function logout(): Promise<LogoutResponse> {
  return post<LogoutResponse>('/api/auth/logout', {});
}

export interface RefreshResponse {
  success: true;
  payload: TokenPayload;
  expiresIn: number;
  session: LoginSession & { aal: 'AAL1' | 'AAL2' };
}

/**
 * Extend the current session. Not wired into the Apollo client any more
 * (sessions last 7 days); kept for callers that want to re-hydrate the
 * auth store from a fresh tab. Returns null when there is no valid session.
 */
export async function refresh(): Promise<RefreshResponse | null> {
  try {
    return await post<RefreshResponse>('/api/auth/refresh', {});
  } catch (err) {
    if (err instanceof IdentityClientError) return null;
    throw err;
  }
}

export { APP_KEY };
