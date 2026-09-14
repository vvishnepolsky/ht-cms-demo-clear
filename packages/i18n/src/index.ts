/**
 * @ht/i18n — Language translation for member-facing apps (Section 1557 / LEP)
 *
 * MVP: i18next + state config, language selector, Section 1557 tagline,
 * locale-aware formatting, glossary types for translation pipeline.
 */

// Config
export {
  StateLanguageConfigSchema,
  parseStateLanguageConfig,
  type StateLanguageConfig,
} from './config/state-language-config.js';

// Storage adapters
export { CookieStorageAdapter, NoopStorageAdapter } from './storage.js';
export type { StorageAdapter } from './storage.js';

// Init and storage
export { initI18n, getStoredLanguage, setStoredLanguage, i18n, isRTL, RTL_LANGUAGES } from './init.js';
export type { InitI18nOptions } from './init.js';

// Formatting
export {
  formatDate,
  formatNumber,
  formatCurrency,
  formatPhone,
  formatWeekday,
  formatTime,
  formatTimeRange,
  formatHoursByWeekday,
  formatDateOnly,
  formatDayList,
} from './formatting.js';
export type {
  FormatDateOptions,
  FormatNumberOptions,
  FormatCurrencyOptions,
  FormatWeekdayOptions,
  FormatTimeOptions,
  FormatHoursByWeekdayOptions,
  WeekdayHourEntry,
  FormatDayListOptions,
} from './formatting.js';

// Glossary (for AI translation pipeline)
export { glossaryToPromptContext, type Glossary, type GlossaryEntry } from './glossary.js';

// Locale display labels
export { LOCALE_LABELS } from './locale-labels.js';

/**
 * Locales supported across member-facing apps and the transactional email
 * pipeline.
 *
 * Kept here (rather than re-declared per consumer) so broadcast-service's
 * transactional email worker (ENG-1099), summer-ebt's outbox drainer
 * (ENG-1100), and the Missouri template copy loaders (ENG-1101) all refer
 * to the same union — add a locale once and every consumer picks it up.
 *
 * resolveLocale / classifyPreferredLanguage live in locale.ts so they can
 * be imported by the server entry (server.ts) without pulling in react-i18next.
 */
export type { SupportedLocale, PreferredLanguageSelection } from './locale.js';
export { resolveLocale, classifyPreferredLanguage } from './locale.js';

// Components moved to @ht/ui (ENG-572): LanguageSelector, Section1557Tagline

// Re-export for convenience
export { useTranslation, Trans } from 'react-i18next';
