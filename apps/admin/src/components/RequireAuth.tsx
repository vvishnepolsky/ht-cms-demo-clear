import { Navigate, Outlet } from 'react-router-dom';
import { useAdmin } from '../lib/auth-store';

/**
 * Gate for staff-only routes. The httpOnly session cookie is the real auth
 * source of truth (the server rejects unauthenticated GraphQL with
 * UNAUTHENTICATED, which lib/apollo.ts turns into a login redirect); this
 * component only checks the local auth-store mirror so unauthenticated tabs
 * land on the login page without a round trip. `<Navigate>` is basename-aware.
 */
export default function RequireAuth() {
  const admin = useAdmin();

  if (!admin) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
