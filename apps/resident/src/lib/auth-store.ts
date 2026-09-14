/**
 * sessionStorage-backed resident auth state for cms-demo.
 *
 * Mirrors apps/cms-demo/admin/src/lib/auth-store.ts. Populated from the
 * identity-service `/api/auth/login` response payload. The httpOnly
 * access-token cookie is the auth source of truth — this store is purely
 * for rendering the user's name/initials and resolving `customerId`.
 */

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'ht-cms-demo-resident-auth';

export interface ResidentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  customerId: string | null;
  /** ENG-1703: identity-service Person UUID. Null for pre-ENG-1703 accounts. */
  personId?: string | null;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function readStorage(): ResidentUser | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ResidentUser;
  } catch {
    return null;
  }
}

let current: ResidentUser | null = readStorage();

function emit(): void {
  for (const l of listeners) l();
}

export function setResident(user: ResidentUser | null): void {
  current = user;
  if (user) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
  emit();
}

export function getResident(): ResidentUser | null {
  return current;
}

function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot(): ResidentUser | null {
  return current;
}

function getServerSnapshot(): ResidentUser | null {
  return null;
}

export function useResident(): ResidentUser | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

interface AuthStoreState {
  user: ResidentUser | null;
  login: (user: Partial<ResidentUser> & { id: string }) => void;
  logout: () => void;
}

function getAuthState(): AuthStoreState {
  return {
    user: current,
    login: (u) =>
      setResident({
        id: u.id,
        email: u.email ?? '',
        firstName: u.firstName ?? '',
        lastName: u.lastName ?? '',
        customerId: u.customerId ?? null,
        personId: u.personId ?? null,
      }),
    logout: () => setResident(null),
  };
}

interface UseAuthStore {
  <T>(selector: (s: AuthStoreState) => T): T;
  getState: () => AuthStoreState;
}

export const useAuthStore: UseAuthStore = Object.assign(
  function useAuthStoreImpl<T>(selector: (s: AuthStoreState) => T): T {
    useResident();
    return selector(getAuthState());
  } as <T>(selector: (s: AuthStoreState) => T) => T,
  { getState: getAuthState },
);
