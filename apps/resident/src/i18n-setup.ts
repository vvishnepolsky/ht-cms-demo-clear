/**
 * i18next initialization for the State-X resident app.
 * Must be called before ReactDOM.createRoot() so translations are available on first render.
 */

import { initI18n } from '@ht/i18n';

// Locale resources — each namespace is a separate JSON file.
// Shared via the vendored @ht/cms-demo-locales workspace package (packages/locales).
import enCommon from '@ht/cms-demo-locales/en/common.json';
import enWelcome from '@ht/cms-demo-locales/en/welcome.json';
import enEnrollment from '@ht/cms-demo-locales/en/enrollment.json';
import enIncome from '@ht/cms-demo-locales/en/income.json';
import enExpenses from '@ht/cms-demo-locales/en/expenses.json';
import enHealth from '@ht/cms-demo-locales/en/health.json';
import enResources from '@ht/cms-demo-locales/en/resources.json';
import enReview from '@ht/cms-demo-locales/en/review.json';
import enDashboard from '@ht/cms-demo-locales/en/dashboard.json';

import esWelcome from '@ht/cms-demo-locales/es/welcome.json';

export const i18nReady = initI18n({
  stateConfig: {
    state_code: 'SX',
    active_languages: ['en', 'es'],
    default_language: 'en',
  },
  resources: {
    en: {
      common: enCommon,
      welcome: enWelcome,
      enrollment: enEnrollment,
      income: enIncome,
      expenses: enExpenses,
      health: enHealth,
      resources: enResources,
      review: enReview,
      dashboard: enDashboard,
    },
    es: {
      welcome: esWelcome,
    },
  },
  defaultNS: 'common',
});
