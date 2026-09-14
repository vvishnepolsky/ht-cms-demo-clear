/**
 * Shared test fixtures for cms-demo admin page tests.
 *
 * Import only from test files — do not import from production code.
 */
import type { AdminUser } from '../lib/auth-store';
import { LIST_EE_CASES_QUERY } from '../lib/ee-operations';

export { LIST_EE_CASES_QUERY };

/**
 * Standard caseworker fixture used across workspace page tests.
 * Defined here (not re-exported from __mocks__) so the production
 * tsc build can resolve this file — __mocks__ is excluded from the
 * Docker build context via .dockerignore.
 */
export const AUDITOR: AdminUser = {
  id: 'admin-1',
  email: 'auditor@state-x.gov',
  firstName: 'Sarah',
  lastName: 'Johnson',
  customerId: 'cust-001',
  permissions: ['audit_logs:read', 'cases:write'],
};

/** Empty-result Apollo mock for LIST_EE_CASES_QUERY. */
export const LIST_CASES_EMPTY_MOCK = {
  request: {
    query: LIST_EE_CASES_QUERY,
    variables: { pagination: { page: 1, limit: 100 } },
  },
  result: {
    data: {
      medicaidEeCases: {
        data: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalCount: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      },
    },
  },
};
