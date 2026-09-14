/// <reference types="vite/client" />

declare global {
  interface Window {
    __ENV__?: {
      VITE_GATEWAY_URL?: string;
      VITE_IDENTITY_URL?: string;
      VITE_CUSTOMER_ID?: string;
      VITE_MAPBOX_ACCESS_TOKEN?: string;
      VITE_MESSAGING_WS_URL?: string;
      DD_RUM_APPLICATION_ID?: string;
      DD_RUM_CLIENT_TOKEN?: string;
      DD_ENV?: string;
    };
  }
}

// Priority: window.__ENV__ (runtime injection) → import.meta.env (build-time) → same-origin default.
// Uses || not ?? so empty-string values fall through to the next source.
//
// cms-demo-clear: the demo apps talk to ONE same-origin server (`apps/server`)
// that exposes `/graphql` and `/api/*`. So the defaults are relative paths —
// `/graphql` for the gateway and `''` (same origin) for the identity/Verify
// Assist REST base — instead of the old federation localhost ports. Vite's dev
// proxy forwards both to :4000; prod serves the bundle from the same origin.
//
// HTP-bzd.1: customerId is per-tenant-app and varies per environment (dev /
// uat / prod each map to a different SsoConfiguration row). Included here so
// it goes through the same ECS-runtime → build-time → undefined precedence
// as the URLs. `undefined` (not localhost-default) when unset because there
// is no sensible fallback — without a customerId, the SSO availability probe
// must collapse to disabled.
export const runtimeEnv = {
  gatewayUrl: window.__ENV__?.VITE_GATEWAY_URL || import.meta.env.VITE_GATEWAY_URL || '/graphql',
  identityUrl: window.__ENV__?.VITE_IDENTITY_URL || import.meta.env.VITE_IDENTITY_URL || '',
  customerId: (window.__ENV__?.VITE_CUSTOMER_ID || import.meta.env.VITE_CUSTOMER_ID || undefined) as string | undefined,
  // ENG-4542: Mapbox Search Box access token. A public `pk.*` token — Mapbox
  // tokens are browser-exposed by design and are scoped with URL restrictions
  // on the Mapbox account, not by hiding them. `undefined` (not a default)
  // when unset: consumers must degrade to manual entry rather than issue
  // requests that will 401.
  mapboxAccessToken: (window.__ENV__?.VITE_MAPBOX_ACCESS_TOKEN ||
    import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ||
    undefined) as string | undefined,
  // ENG-4484: messaging-service terminates its own WebSocket (RFC-0004 §3.3a —
  // direct-to-subgraph, NOT through the router), so this is a separate origin
  // from `gatewayUrl` and cannot be derived from it. `undefined` when unset
  // rather than a localhost default: a deployed app quietly dialling localhost
  // would look identical to one with no live updates at all, and
  // ConversationsLiveProvider needs to tell those two apart.
  messagingWsUrl: (window.__ENV__?.VITE_MESSAGING_WS_URL || import.meta.env.VITE_MESSAGING_WS_URL || undefined) as
    | string
    | undefined,
  datadogApplicationId: (window.__ENV__?.DD_RUM_APPLICATION_ID ||
    import.meta.env.VITE_DD_RUM_APPLICATION_ID ||
    undefined) as string | undefined,
  datadogClientToken: (window.__ENV__?.DD_RUM_CLIENT_TOKEN || import.meta.env.VITE_DD_RUM_CLIENT_TOKEN || undefined) as
    | string
    | undefined,
  datadogEnv: (window.__ENV__?.DD_ENV || import.meta.env.VITE_DD_ENV || undefined) as string | undefined,
  appVersion: (import.meta.env.VITE_APP_VERSION || undefined) as string | undefined,
};
