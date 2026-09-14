/**
 * Server-safe entry for @ht/i18n — no React or react-i18next dependency.
 *
 * Backend services (summer-ebt, broadcast-service, etc.) import from
 * '@ht/i18n/server' to get locale utilities without pulling in the React
 * i18n stack, which is not installed in backend Docker images.
 *
 * Frontend apps import from '@ht/i18n' (the default entry) which includes
 * useTranslation, Trans, initI18n, and the full React i18n setup.
 */

export type { SupportedLocale, PreferredLanguageSelection } from './locale.js';
export { resolveLocale, classifyPreferredLanguage } from './locale.js';

export {
  StateLanguageConfigSchema,
  parseStateLanguageConfig,
  type StateLanguageConfig,
} from './config/state-language-config.js';

export { formatDate, formatNumber, formatCurrency, formatPhone } from './formatting.js';
export type { FormatDateOptions, FormatNumberOptions, FormatCurrencyOptions } from './formatting.js';

export { glossaryToPromptContext, type Glossary, type GlossaryEntry } from './glossary.js';

export { LOCALE_LABELS } from './locale-labels.js';
