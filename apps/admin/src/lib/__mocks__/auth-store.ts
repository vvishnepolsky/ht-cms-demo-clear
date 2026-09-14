/**
 * Vitest manual mock for auth-store.
 *
 * Activated automatically when a test calls `vi.mock('../lib/auth-store')` (no factory).
 * Exposes the standard AUDITOR fixture used across workspace page tests.
 */
import { vi } from 'vitest';
import type { AdminUser } from '../auth-store';

export const AUDITOR: AdminUser = {
  id: 'admin-1',
  email: 'auditor@state-x.gov',
  firstName: 'Sarah',
  lastName: 'Johnson',
  customerId: 'cust-001',
  permissions: ['audit_logs:read', 'cases:write'],
};

export const useAdmin = vi.fn(() => AUDITOR);

export const hasPermission = vi.fn((user: AdminUser | null, needed: string): boolean => {
  if (!user) return false;
  if (!user.permissions) return true;
  return user.permissions.includes(needed);
});

export const setAdmin = vi.fn();

export const getAdmin = vi.fn(() => AUDITOR);
