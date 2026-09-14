/**
 * sessionStorage-backed admin auth state for cms-demo.
 *
 * Populated from the identity-service `/api/auth/login` response payload.
 * Replaces the previous `ME_QUERY` (admin-identity-service GraphQL) reads
 * with a synchronous client-side store — identity-service tokens carry the
 * same identity fields directly in the JWT/tokenPayload, so an extra round
 * trip just to fetch `me` is redundant.
 *
 * The httpOnly access-token cookie remains the auth source of truth — this
 * store is purely for rendering the user's name/initials and resolving
 * `customerId` for Apollo's tenant-scoping header.
 */

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'ht-cms-demo-admin-auth';

export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  customerId: string;
  /**
   * Casbin permissions from the JWT `permissions` claim (e.g. `audit_logs:read`).
   * Used for UI affordance gating — server-side `requirePermission` remains the
   * actual authority. Optional because pre-ENG-1667 sessions persisted without
   * this field; consumers should default-deny when the field is present but
   * missing the needed permission, and fall back to showing the affordance
   * when the field is undefined (stale session — server still gates).
   */
  permissions?: string[];
}

/**
 * Map an identity-service token payload to the AdminUser shape. Shared by
 * LoginPage (login response) and the Apollo refresh callback (refresh
 * response) so the two hydration paths can't drift. The JWT payload carries
 * no email — callers pass the session email (or the previously stored one).
 */
export function adminFromTokenPayload(
  payload: {
    sub: string;
    customerId: string;
    firstName: string;
    lastName: string;
    permissions?: string[];
  },
  email: string | null | undefined,
): AdminUser {
  return {
    id: payload.sub,
    email: email ?? '',
    firstName: payload.firstName,
    lastName: payload.lastName,
    customerId: payload.customerId,
    // ENG-1667: persist permissions for client-side affordance gating
    // (e.g. hide the Activity Log tab for users without `audit_logs:read`).
    permissions: payload.permissions ?? [],
  };
}

/**
 * Convenience helper for "should we show this affordance?" checks. Returns
 * `true` if the admin object explicitly carries the permission, OR if
 * permissions are not populated at all (stale session — fall back to
 * server-side gating to avoid hiding affordances from existing sessions).
 */
export function hasPermission(user: AdminUser | null, needed: string): boolean {
  if (!user) return false;
  if (!user.permissions) return true; // stale session — defer to server gate
  return user.permissions.includes(needed);
}

type Listener = () => void;
const listeners = new Set<Listener>();

function readStorage(): AdminUser | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AdminUser;
  } catch {
    return null;
  }
}

let current: AdminUser | null = readStorage();

function emit(): void {
  for (const l of listeners) l();
}

export function setAdmin(user: AdminUser | null): void {
  current = user;
  if (user) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
  emit();
}

export function getAdmin(): AdminUser | null {
  return current;
}

function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot(): AdminUser | null {
  return current;
}

function getServerSnapshot(): AdminUser | null {
  return null;
}

export function useAdmin(): AdminUser | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
