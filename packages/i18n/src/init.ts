import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Resource } from 'i18next';
import type { StateLanguageConfig } from './config/state-language-config.js';
import { CookieStorageAdapter, type StorageAdapter } from './storage.js';

export type InitI18nOptions = {
  /** State language config (active languages, default). */
  stateConfig: StateLanguageConfig;
  /**
   * Preloaded translation resources by locale and namespace.
   * If not provided, you must register an i18next backend (e.g. i18next-http-backend) to load from URL.
   */
  resources?: Resource;
  /** Optional fallback locale when a key is missing. */
  fallbackLng?: string;
  /** Default namespace(s) to use when none specified. */
  defaultNS?: string | string[];
  /** Storage adapter for persisting language preference. Defaults to CookieStorageAdapter (web). */
  storage?: StorageAdapter;
};

const defaultStorage = new CookieStorageAdapter();

/**
 * Locales that render right-to-left. Montana (ENG-2520) adds Dari (`prs`) and
 * Pashto (`ps`) to the base set. Typed `readonly string[]` so the existing
 * `.includes()` direction checks in `initI18n` keep compiling untouched (an
 * `as const` tuple would reject a `string` argument) while the array is safe to
 * re-export as read-only from the barrel.
 */
export const RTL_LANGUAGES: readonly string[] = ['ar', 'he', 'fa', 'ur', 'prs', 'ps'];

/**
 * True iff the (base) locale renders right-to-left. Regional variants resolve by
 * their base subtag (`ar-EG` → `ar`). Web direction flipping keys off the same
 * `RTL_LANGUAGES` list inside `initI18n`; mobile components call
 * `isRTL(i18n.language)` where layout direction matters.
 */
export function isRTL(locale: string): boolean {
  const base = locale.toLowerCase().split('-')[0];
  return RTL_LANGUAGES.includes(base);
}

let docAttrListenerRegistered = false;

/**
 * Marker prefix used in non-EN locale files for keys awaiting professional
 * translation. Locale values that start with `__TODO_TRANSLATE__ ` carry the
 * EN source value after the prefix; the runtime post-processor strips the
 * prefix so users see the EN fallback rather than literal `__TODO_TRANSLATE__`
 * leaking into the UI.
 *
 * The CI script `scripts/check-i18n-todo-markers.sh` flags when these markers
 * appear so the translation backlog is loud during PR review.
 *
 * See ENG-1307 for the locale-parity sweep that introduced these markers.
 */
const TODO_TRANSLATE_MARKER = '__TODO_TRANSLATE__ ';

/**
 * Strip the `__TODO_TRANSLATE__` prefix from interpolated values so users
 * never see the marker in the UI. The substring after the marker is the EN
 * source value, so stripping returns a clean English fallback.
 */
function stripTodoTranslateMarker(value: unknown): string {
  if (typeof value !== 'string') return String(value ?? '');
  return value.startsWith(TODO_TRANSLATE_MARKER) ? value.slice(TODO_TRANSLATE_MARKER.length) : value;
}

/**
 * Get stored language preference using the provided adapter (or default cookie adapter).
 *
 * **Note:** This is a synchronous helper. Async storage adapters (e.g. AsyncStorage on
 * React Native) will return `null` here. Use `initI18n()` for async adapter support —
 * it awaits the adapter internally.
 */
export function getStoredLanguage(storage: StorageAdapter = defaultStorage): string | null {
  const result = storage.getLanguage();
  if (result instanceof Promise) return null;
  return result;
}

/**
 * Persist language preference using the provided adapter (or default cookie adapter).
 */
export function setStoredLanguage(locale: string, storage: StorageAdapter = defaultStorage): void {
  storage.setLanguage(locale);
}

/**
 * Initialize i18next with state config and optional preloaded resources.
 * Call once in the app entry (client). For SSR, use the same options and ensure
 * the same initial language is used on server and client (e.g. from cookie/header).
 */
export async function initI18n(options: InitI18nOptions): Promise<typeof i18n> {
  const { stateConfig, resources, fallbackLng = 'en', defaultNS = 'common' } = options;
  const storage = options.storage ?? defaultStorage;

  const storedResult = storage.getLanguage();
  const stored = storedResult instanceof Promise ? await storedResult : storedResult;
  const initialLng = stored && stateConfig.active_languages.includes(stored) ? stored : stateConfig.default_language;
  // Intentionally do NOT overwrite storage when the stored locale is invalid/stale.
  // The user may switch states/tenants temporarily; we only persist on explicit language selection.

  const derivedNs = resources ? Object.keys(Object.values(resources)[0] ?? {}) : [];
  const ns = derivedNs.length > 0 ? derivedNs : ['common'];

  await i18n
    .use(initReactI18next)
    .use({
      type: 'postProcessor',
      name: 'stripTodoTranslate',
      process: (value: unknown) => stripTodoTranslateMarker(value),
    })
    .init({
      lng: initialLng,
      fallbackLng,
      defaultNS,
      ns,
      resources,
      // ENG-1307: apply the strip postProcessor to every t() call so the
      // __TODO_TRANSLATE__ markers in non-EN locale files (awaiting
      // professional translation) never reach the rendered UI — users see
      // the EN source value instead.
      postProcess: ['stripTodoTranslate'],
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: true,
      },
    });

  if (typeof document !== 'undefined') {
    document.documentElement.lang = initialLng;
    // Direction flips via `isRTL()` (not a raw `RTL_LANGUAGES.includes()`) so a
    // regional variant — e.g. `ar-EG` — resolves by its base subtag exactly as
    // `isRTL()` does everywhere else; the two can no longer diverge (ENG-2520 follow-up).
    document.documentElement.dir = isRTL(initialLng) ? 'rtl' : 'ltr';
    if (!docAttrListenerRegistered) {
      i18n.on('languageChanged', (lng: string) => {
        document.documentElement.lang = lng;
        document.documentElement.dir = isRTL(lng) ? 'rtl' : 'ltr';
      });
      docAttrListenerRegistered = true;
    }
  }

  return i18n;
}

export { i18n };
