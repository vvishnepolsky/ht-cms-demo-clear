/**
 * Server-safe locale utilities — no React or react-i18next dependency.
 * Extracted from index.ts so backend Docker images can import resolveLocale
 * without pulling in the React i18n stack (pnpm prunes react-i18next when
 * React is absent from the pruned workspace).
 *
 * Imported by both the browser entry (index.ts) and the server entry
 * (server.ts) so backend services can use resolveLocale without pulling
 * in the React i18n stack.
 */

export type SupportedLocale = 'en' | 'es';

export function resolveLocale(preferredLanguage: string | null | undefined): SupportedLocale {
  if (preferredLanguage == null) return 'en';
  const normalized = preferredLanguage.trim().toLowerCase();
  if (normalized === 'en' || normalized === 'english') return 'en';
  if (normalized === 'es' || normalized === 'spanish' || normalized === 'español') return 'es';
  return 'en';
}

export type PreferredLanguageSelection = SupportedLocale | 'other';

export function classifyPreferredLanguage(preferredLanguage: string | null | undefined): PreferredLanguageSelection {
  if (!preferredLanguage) return 'en';
  const normalized = preferredLanguage.trim().toLowerCase();
  if (!normalized) return 'en';
  if (['en', 'english', 'es', 'spanish', 'español'].includes(normalized)) {
    return resolveLocale(preferredLanguage);
  }
  return 'other';
}
