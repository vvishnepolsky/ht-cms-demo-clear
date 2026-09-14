import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CookieStorageAdapter, NoopStorageAdapter } from '../src/storage.js';

describe('CookieStorageAdapter', () => {
  const adapter = new CookieStorageAdapter();
  const originalCookie = document.cookie;

  beforeEach(() => {
    document.cookie = '';
  });

  afterEach(() => {
    document.cookie = originalCookie;
  });

  it('returns null when no cookie is set', () => {
    expect(adapter.getLanguage()).toBeNull();
  });

  it('stores and retrieves a locale', () => {
    adapter.setLanguage('es');
    expect(adapter.getLanguage()).toBe('es');
  });

  it('overwrites previous locale', () => {
    adapter.setLanguage('es');
    adapter.setLanguage('en');
    expect(adapter.getLanguage()).toBe('en');
  });

  it('handles URI-encoded locales', () => {
    adapter.setLanguage('en-US');
    expect(adapter.getLanguage()).toBe('en-US');
  });
});

describe('NoopStorageAdapter', () => {
  const adapter = new NoopStorageAdapter();

  it('always returns null', () => {
    expect(adapter.getLanguage()).toBeNull();
  });

  it('setLanguage does not throw', () => {
    expect(() => adapter.setLanguage('es')).not.toThrow();
  });
});
