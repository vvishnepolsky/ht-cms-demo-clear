import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('runtimeEnv', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (window as { __ENV__?: unknown }).__ENV__;
  });

  it('uses window.__ENV__ when set', async () => {
    (window as { __ENV__?: unknown }).__ENV__ = {
      VITE_GATEWAY_URL: 'https://runtime-gateway',
      VITE_IDENTITY_URL: 'https://runtime-identity',
      VITE_CUSTOMER_ID: 'cust-runtime',
    };
    const { runtimeEnv } = await import('../src/index');
    expect(runtimeEnv.gatewayUrl).toBe('https://runtime-gateway');
    expect(runtimeEnv.identityUrl).toBe('https://runtime-identity');
    expect(runtimeEnv.customerId).toBe('cust-runtime');
  });

  it('falls back to import.meta.env when window.__ENV__ absent', async () => {
    vi.stubEnv('VITE_GATEWAY_URL', 'https://build-gateway');
    vi.stubEnv('VITE_IDENTITY_URL', 'https://build-identity');
    const { runtimeEnv } = await import('../src/index');
    expect(runtimeEnv.gatewayUrl).toBe('https://build-gateway');
    expect(runtimeEnv.identityUrl).toBe('https://build-identity');
    vi.unstubAllEnvs();
  });

  it('falls back to same-origin defaults when neither source is set', async () => {
    vi.stubEnv('VITE_GATEWAY_URL', '');
    vi.stubEnv('VITE_IDENTITY_URL', '');
    const { runtimeEnv } = await import('../src/index');
    expect(runtimeEnv.gatewayUrl).toBe('/graphql');
    expect(runtimeEnv.identityUrl).toBe('');
    vi.unstubAllEnvs();
  });

  it('empty-string window.__ENV__ falls through to import.meta.env', async () => {
    (window as { __ENV__?: unknown }).__ENV__ = { VITE_GATEWAY_URL: '', VITE_IDENTITY_URL: '' };
    vi.stubEnv('VITE_GATEWAY_URL', 'https://build-gateway');
    vi.stubEnv('VITE_IDENTITY_URL', 'https://build-identity');
    const { runtimeEnv } = await import('../src/index');
    expect(runtimeEnv.gatewayUrl).toBe('https://build-gateway');
    expect(runtimeEnv.identityUrl).toBe('https://build-identity');
    vi.unstubAllEnvs();
  });

  it('undefined window.__ENV__ fields fall through to same-origin defaults', async () => {
    (window as { __ENV__?: unknown }).__ENV__ = {};
    vi.stubEnv('VITE_GATEWAY_URL', '');
    vi.stubEnv('VITE_IDENTITY_URL', '');
    const { runtimeEnv } = await import('../src/index');
    expect(runtimeEnv.gatewayUrl).toBe('/graphql');
    expect(runtimeEnv.identityUrl).toBe('');
    vi.unstubAllEnvs();
  });

  it('partial window.__ENV__ — only VITE_GATEWAY_URL set', async () => {
    (window as { __ENV__?: unknown }).__ENV__ = { VITE_GATEWAY_URL: 'https://runtime-gateway' };
    vi.stubEnv('VITE_IDENTITY_URL', 'https://build-identity');
    const { runtimeEnv } = await import('../src/index');
    expect(runtimeEnv.gatewayUrl).toBe('https://runtime-gateway');
    expect(runtimeEnv.identityUrl).toBe('https://build-identity');
    vi.unstubAllEnvs();
  });

  // HTP-bzd.1: customerId precedence + undefined fallback (no localhost
  // default — without a real customerId the SSO availability probe must
  // collapse to disabled rather than probing a fake tenant).
  describe('customerId (HTP-bzd.1)', () => {
    it('reads from window.__ENV__ at runtime', async () => {
      (window as { __ENV__?: unknown }).__ENV__ = { VITE_CUSTOMER_ID: 'cust-runtime' };
      const { runtimeEnv } = await import('../src/index');
      expect(runtimeEnv.customerId).toBe('cust-runtime');
    });

    it('falls back to import.meta.env at build time', async () => {
      vi.stubEnv('VITE_CUSTOMER_ID', 'cust-build');
      const { runtimeEnv } = await import('../src/index');
      expect(runtimeEnv.customerId).toBe('cust-build');
      vi.unstubAllEnvs();
    });

    it('runtime overrides build', async () => {
      (window as { __ENV__?: unknown }).__ENV__ = { VITE_CUSTOMER_ID: 'cust-runtime' };
      vi.stubEnv('VITE_CUSTOMER_ID', 'cust-build');
      const { runtimeEnv } = await import('../src/index');
      expect(runtimeEnv.customerId).toBe('cust-runtime');
      vi.unstubAllEnvs();
    });

    it('returns undefined (NOT a default) when neither source is set', async () => {
      vi.stubEnv('VITE_CUSTOMER_ID', '');
      const { runtimeEnv } = await import('../src/index');
      expect(runtimeEnv.customerId).toBeUndefined();
      vi.unstubAllEnvs();
    });

    it('empty-string runtime value falls through to build', async () => {
      (window as { __ENV__?: unknown }).__ENV__ = { VITE_CUSTOMER_ID: '' };
      vi.stubEnv('VITE_CUSTOMER_ID', 'cust-build');
      const { runtimeEnv } = await import('../src/index');
      expect(runtimeEnv.customerId).toBe('cust-build');
      vi.unstubAllEnvs();
    });
  });
  // ENG-4542: the Mapbox token follows customerId's shape, not the URLs' —
  // `undefined` when unset rather than a default, because a placeholder token
  // would produce 401s instead of the manual-entry fallback the consumer needs.
  describe('mapboxAccessToken (ENG-4542)', () => {
    it('reads from window.__ENV__ at runtime', async () => {
      (window as { __ENV__?: unknown }).__ENV__ = { VITE_MAPBOX_ACCESS_TOKEN: 'pk.runtime' };
      const { runtimeEnv } = await import('../src/index');
      expect(runtimeEnv.mapboxAccessToken).toBe('pk.runtime');
    });

    it('falls back to import.meta.env at build time', async () => {
      vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'pk.build');
      const { runtimeEnv } = await import('../src/index');
      expect(runtimeEnv.mapboxAccessToken).toBe('pk.build');
      vi.unstubAllEnvs();
    });

    it('runtime overrides build', async () => {
      (window as { __ENV__?: unknown }).__ENV__ = { VITE_MAPBOX_ACCESS_TOKEN: 'pk.runtime' };
      vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'pk.build');
      const { runtimeEnv } = await import('../src/index');
      expect(runtimeEnv.mapboxAccessToken).toBe('pk.runtime');
      vi.unstubAllEnvs();
    });

    it('returns undefined (NOT a default) when neither source is set', async () => {
      vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', '');
      const { runtimeEnv } = await import('../src/index');
      expect(runtimeEnv.mapboxAccessToken).toBeUndefined();
      vi.unstubAllEnvs();
    });

    it('empty-string runtime value falls through to build', async () => {
      (window as { __ENV__?: unknown }).__ENV__ = { VITE_MAPBOX_ACCESS_TOKEN: '' };
      vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'pk.build');
      const { runtimeEnv } = await import('../src/index');
      expect(runtimeEnv.mapboxAccessToken).toBe('pk.build');
      vi.unstubAllEnvs();
    });
  });
});
