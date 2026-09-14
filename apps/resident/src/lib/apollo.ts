/**
 * Apollo client for the State-X demo resident app.
 *
 * Talks to the same-origin `/graphql` endpoint (`runtimeEnv.gatewayUrl`; Vite
 * proxies it to apps/server on :4000 in dev). Auth is the httpOnly
 * `cms-demo-resident_session` cookie the server sets at login — so every
 * request goes out with `credentials: 'include'` and the `x-app` header the
 * server uses to pick that cookie and enforce the resident role.
 *
 * Sessions last 7 days and there is no short-lived JWT to refresh, so the
 * only auth handling needed is: on an UNAUTHENTICATED GraphQL error, drop the
 * local resident snapshot and send the user back to the wizard start.
 */
import { ApolloClient, ApolloLink, HttpLink, InMemoryCache, CombinedGraphQLErrors } from '@apollo/client';
import { ErrorLink } from '@apollo/client/link/error';
import { runtimeEnv } from '@ht/runtime-env';
import { APP_KEY } from './identity-client';
import { setResident } from './auth-store';

export const CUSTOMER_ID: string = import.meta.env.VITE_CUSTOMER_ID || '00000000-0000-4000-a000-000000000003';

const LOGIN_REDIRECT_PATH = '/';

const httpLink = new HttpLink({
  uri: runtimeEnv.gatewayUrl,
  credentials: 'include',
  headers: {
    'x-app': APP_KEY,
    'x-customer-id': CUSTOMER_ID,
  },
});

const authErrorLink = new ErrorLink(({ error }) => {
  const unauthenticated =
    CombinedGraphQLErrors.is(error) && error.errors.some((e) => e.extensions?.code === 'UNAUTHENTICATED');
  if (!unauthenticated) return;
  setResident(null);
  if (typeof window !== 'undefined' && window.location.pathname !== LOGIN_REDIRECT_PATH) {
    window.location.assign(LOGIN_REDIRECT_PATH);
  }
});

export const client = new ApolloClient({
  link: ApolloLink.from([authErrorLink, httpLink]),
  cache: new InMemoryCache(),
});
