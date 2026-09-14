/**
 * Apollo client for the demo admin app.
 *
 * Plain same-origin HTTP link against apps/server's `/graphql` (the ht-platform
 * federation client + token-refresh plumbing is gone — demo sessions are opaque
 * httpOnly cookies that last 7 days). Every request carries the `x-app`
 * header so the server reads the admin cookie and enforces the staff role.
 *
 * An UNAUTHENTICATED GraphQL error clears the local auth store and sends the
 * browser to the login page. This runs outside React Router, so the redirect
 * must prepend the SPA base (`/admin/`) itself — `import.meta.env.BASE_URL`
 * is Vite's `base`, which matches BrowserRouter's basename in App.tsx.
 */

import { ApolloClient, ApolloLink, HttpLink, InMemoryCache, CombinedGraphQLErrors } from '@apollo/client';
import { ErrorLink } from '@apollo/client/link/error';
import { runtimeEnv } from '@ht/runtime-env';
import { setAdmin } from './auth-store';
import { APP_KEY } from './identity-client';

/** Absolute URL path of the login page, including the SPA base. */
export function loginHref(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/$/, '')}/login`;
}

/** Client-side redirect to the login page (basename-aware). */
export function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname.startsWith(loginHref())) return;
  window.location.assign(loginHref());
}

const httpLink = new HttpLink({
  uri: runtimeEnv.gatewayUrl,
  credentials: 'include',
  headers: { 'x-app': APP_KEY },
});

const errorLink = new ErrorLink(({ error }) => {
  if (CombinedGraphQLErrors.is(error)) {
    const unauthenticated = error.errors.some((e) => e.extensions?.code === 'UNAUTHENTICATED');
    if (unauthenticated) {
      setAdmin(null);
      redirectToLogin();
    }
  }
});

export const client = new ApolloClient({
  link: ApolloLink.from([errorLink, httpLink]),
  cache: new InMemoryCache(),
});
