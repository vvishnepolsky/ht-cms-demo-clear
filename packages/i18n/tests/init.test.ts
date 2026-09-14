import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getStoredLanguage, setStoredLanguage, initI18n } from '../src/init.js';
import { CookieStorageAdapter, NoopStorageAdapter } from '../src/storage.js';
import type { StorageAdapter } from '../src/storage.js';
import type { StateLanguageConfig } from '../src/config/state-language-config.js';

const defaultStateConfig: StateLanguageConfig = {
  state_code: 'LA',
  active_languages: ['en', 'es'],
  default_language: 'en',
};

describe('getStoredLanguage', () => {
  const originalCookie = document.cookie;

  beforeEach(() => {
    document.cookie = '';
  });

  afterEach(() => {
    document.cookie = originalCookie;
  });

  it('returns null when no language cookie is set', () => {
    expect(getStoredLanguage()).toBeNull();
  });

  it('returns the stored locale when cookie is set', () => {
    document.cookie = 'ht_preferred_language=es;path=/;max-age=31536000';
    expect(getStoredLanguage()).toBe('es');
  });

  it('decodes URI-encoded cookie value', () => {
    document.cookie = 'ht_preferred_language=' + encodeURIComponent('en-US') + ';path=/';
    expect(getStoredLanguage()).toBe('en-US');
  });

  it('returns stored locale when cookie is among others', () => {
    setStoredLanguage('es');
    document.cookie = document.cookie + '; other=value';
    expect(getStoredLanguage()).toBe('es');
  });

  it('uses provided storage adapter', () => {
    const custom: StorageAdapter = {
      getLanguage: () => 'fr',
      setLanguage: () => {},
    };
    expect(getStoredLanguage(custom)).toBe('fr');
  });

  it('returns null for async storage adapters (sync caller)', () => {
    const asyncAdapter: StorageAdapter = {
      getLanguage: () => Promise.resolve('vi'),
      setLanguage: () => Promise.resolve(),
    };
    expect(getStoredLanguage(asyncAdapter)).toBeNull();
  });
});

describe('setStoredLanguage', () => {
  const originalCookie = document.cookie;

  beforeEach(() => {
    document.cookie = '';
  });

  afterEach(() => {
    document.cookie = originalCookie;
  });

  it('sets cookie with locale', () => {
    setStoredLanguage('es');
    expect(document.cookie).toContain('ht_preferred_language=es');
    // Cookie string may omit path/max-age in some jsdom; value is what we assert
    expect(getStoredLanguage()).toBe('es');
  });

  it('encodes locale in cookie', () => {
    setStoredLanguage('en-US');
    expect(document.cookie).toMatch(/ht_preferred_language=[^;]+/);
    expect(getStoredLanguage()).toBe('en-US');
  });

  it('delegates to provided storage adapter', () => {
    let stored = '';
    const custom: StorageAdapter = {
      getLanguage: () => stored,
      setLanguage: (locale: string) => {
        stored = locale;
      },
    };
    setStoredLanguage('zh', custom);
    expect(stored).toBe('zh');
  });
});

describe('initI18n', () => {
  const originalCookie = document.cookie;

  beforeEach(() => {
    document.cookie = '';
  });

  afterEach(() => {
    document.cookie = originalCookie;
  });

  it('uses stored language when it is in active_languages', async () => {
    document.cookie = 'ht_preferred_language=es;path=/';
    const i18n = await initI18n({
      stateConfig: defaultStateConfig,
      resources: {
        en: { common: { key: 'en' } },
        es: { common: { key: 'es' } },
      },
    });
    expect(i18n.language).toBe('es');
    expect(document.documentElement.lang).toBe('es');
  });

  it('falls back to default_language when stored language is not in active_languages', async () => {
    document.cookie = 'ht_preferred_language=fr;path=/';
    const i18n = await initI18n({
      stateConfig: defaultStateConfig,
      resources: {
        en: { common: {} },
        es: { common: {} },
      },
    });
    expect(i18n.language).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('uses default_language when no cookie is set', async () => {
    const i18n = await initI18n({
      stateConfig: defaultStateConfig,
      resources: {
        en: { common: {} },
        es: { common: {} },
      },
    });
    expect(i18n.language).toBe('en');
  });

  it('accepts custom fallbackLng and defaultNS', async () => {
    const i18n = await initI18n({
      stateConfig: defaultStateConfig,
      resources: { en: { common: {} } },
      fallbackLng: 'es',
      defaultNS: 'dashboard',
    });
    const fallback = i18n.options.fallbackLng;
    expect(Array.isArray(fallback) ? fallback[0] : fallback).toBe('es');
    expect(i18n.options.defaultNS).toBe('dashboard');
  });

  it('uses custom storage adapter', async () => {
    const custom: StorageAdapter = {
      getLanguage: () => 'es',
      setLanguage: () => {},
    };
    const i18n = await initI18n({
      stateConfig: defaultStateConfig,
      resources: {
        en: { common: {} },
        es: { common: {} },
      },
      storage: custom,
    });
    expect(i18n.language).toBe('es');
  });

  it('uses async storage adapter', async () => {
    const asyncAdapter: StorageAdapter = {
      getLanguage: () => Promise.resolve('es'),
      setLanguage: () => Promise.resolve(),
    };
    const i18n = await initI18n({
      stateConfig: defaultStateConfig,
      resources: {
        en: { common: {} },
        es: { common: {} },
      },
      storage: asyncAdapter,
    });
    expect(i18n.language).toBe('es');
  });

  it('falls back to default when async adapter returns invalid language', async () => {
    const asyncAdapter: StorageAdapter = {
      getLanguage: () => Promise.resolve('xx'),
      setLanguage: () => Promise.resolve(),
    };
    const i18n = await initI18n({
      stateConfig: defaultStateConfig,
      resources: {
        en: { common: {} },
        es: { common: {} },
      },
      storage: asyncAdapter,
    });
    expect(i18n.language).toBe('en');
  });

  it('uses NoopStorageAdapter without errors', async () => {
    const i18n = await initI18n({
      stateConfig: defaultStateConfig,
      resources: { en: { common: {} } },
      storage: new NoopStorageAdapter(),
    });
    expect(i18n.language).toBe('en');
  });
});
