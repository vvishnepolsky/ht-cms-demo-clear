/**
 * StorageAdapter interface for persisting language preference.
 * Web apps use CookieStorageAdapter (default). React Native apps use AsyncStorageAdapter
 * from @ht/ui-native. SSR/tests use NoopStorageAdapter.
 */

export interface StorageAdapter {
  getLanguage(): Promise<string | null> | string | null;
  setLanguage(locale: string): Promise<void> | void;
}

const COOKIE_NAME = 'ht_preferred_language';

/**
 * Persists language preference in an HTTP cookie (web browsers).
 * Cookie: ht_preferred_language, 1-year max-age, SameSite=Lax, Secure on HTTPS.
 */
export class CookieStorageAdapter implements StorageAdapter {
  getLanguage(): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  setLanguage(locale: string): void {
    if (typeof document === 'undefined') return;
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? ';Secure' : '';
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(locale)};path=/;max-age=31536000;SameSite=Lax${secure}`;
  }
}

/**
 * No-op adapter for SSR and testing — never reads or writes.
 */
export class NoopStorageAdapter implements StorageAdapter {
  getLanguage(): null {
    return null;
  }

  setLanguage(): void {
    // no-op
  }
}
