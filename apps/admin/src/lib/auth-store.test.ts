/**
 * Unit tests for the `hasPermission` helper. ENG-1667.
 *
 * The three branches matter: a null user is unauthenticated and must not
 * see the affordance; a populated `permissions` array drives explicit
 * server-side gating; an undefined `permissions` array is a stale session
 * from before ENG-1667 and must fall back to showing the affordance so
 * server-side `requirePermission` remains the actual authority.
 */

import { describe, it, expect } from 'vitest';
import { adminFromTokenPayload, hasPermission, type AdminUser } from './auth-store';

const BASE_USER: AdminUser = {
  id: 'user-1',
  email: 'admin@state-x.gov',
  firstName: 'Sarah',
  lastName: 'Johnson',
  customerId: '00000000-0000-4000-a000-000000000003',
  permissions: ['audit_logs:read', 'cases:write'],
};

describe('hasPermission', () => {
  it('returns false when user is null', () => {
    expect(hasPermission(null, 'audit_logs:read')).toBe(false);
  });

  it('returns true when the permission is present in the array', () => {
    expect(hasPermission(BASE_USER, 'audit_logs:read')).toBe(true);
  });

  it('returns false when the permission is absent from a populated array', () => {
    expect(hasPermission(BASE_USER, 'super_secret:do')).toBe(false);
  });

  it('returns false when the permissions array is explicitly empty', () => {
    // Persona explicitly authed but with no granted permissions — e.g. a role
    // whose Casbin permissions list is empty. (Pre-ENG-1738 this comment
    // referenced CASEWORKER specifically; CASEWORKER now has audit_logs:read.)
    expect(hasPermission({ ...BASE_USER, permissions: [] }, 'audit_logs:read')).toBe(false);
  });

  it('returns true when permissions is undefined (stale pre-ENG-1667 session)', () => {
    // Defer to server-side gating rather than silently stripping affordances
    // from sessions that were minted before the permissions claim shipped.
    const stale: AdminUser = { ...BASE_USER, permissions: undefined };
    expect(hasPermission(stale, 'audit_logs:read')).toBe(true);
  });
});

describe('adminFromTokenPayload', () => {
  const PAYLOAD = {
    sub: 'admin-001',
    customerId: 'cust-001',
    firstName: 'Demo',
    lastName: 'Admin',
    permissions: ['audit_logs:read'],
  };

  it('maps payload fields and the provided email', () => {
    const admin = adminFromTokenPayload(PAYLOAD, 'admin@state-x.gov');
    expect(admin).toEqual({
      id: 'admin-001',
      email: 'admin@state-x.gov',
      firstName: 'Demo',
      lastName: 'Admin',
      customerId: 'cust-001',
      permissions: ['audit_logs:read'],
    });
  });

  it('defaults email to empty string and permissions to [] when absent', () => {
    const admin = adminFromTokenPayload({ ...PAYLOAD, permissions: undefined }, undefined);
    expect(admin.email).toBe('');
    expect(admin.permissions).toEqual([]);
  });
});
