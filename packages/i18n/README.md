# @ht/i18n — Language Translation (MVP)

i18n framework and components for member-facing apps. Supports Section 1557 / LEP with state-level language config, Spanish translations, and Section 1557 taglines.

## MVP scope

- **i18n**: i18next + react-i18next, namespace separation per module, locale-aware formatting (dates, numbers, currency, phone).
- **State config**: JSON per state (`state_code`, `active_languages`, `default_language`). No admin UI; engineers manage config.
- **Language selector**: Header component "English | Español", preference in cookie (unauthenticated) or user profile (authenticated).
- **Section 1557 tagline**: Multi-language notice block on key pages.
- **Glossary**: Types and example for ~200-term Medicaid glossary (spreadsheet → AI prompt). No Translation Memory at MVP.

## Install

In the app:

```bash
pnpm add @ht/i18n
```

## Usage

### 1. State config

Create or load state language config (e.g. from loader or static import):

```ts
import { parseStateLanguageConfig } from '@ht/i18n';

const stateConfig = parseStateLanguageConfig({
  state_code: 'LA',
  active_languages: ['en', 'es'],
  default_language: 'en',
});
```

### 2. Initialize i18n (client entry)

Preload translation JSON and init before rendering:

```ts
import { initI18n } from '@ht/i18n';
import enCommon from '@ht/i18n/locales/en/common.json';
import esCommon from '@ht/i18n/locales/es/common.json';

const stateConfig = { state_code: 'LA', active_languages: ['en', 'es'], default_language: 'en' };

await initI18n({
  stateConfig,
  resources: {
    en: { common: enCommon },
    es: { common: esCommon },
  },
});
```

**SSR / Remix:** `initI18n` runs only in the client entry (e.g. `entry.client.tsx`). Any component that uses `useTranslation()` or the package’s `LanguageSelector` / `Section1557Tagline` must be rendered inside a client-only boundary (e.g. `<ClientOnly>`) so it never runs during SSR. Otherwise you get hydration mismatches (server has no i18n, client has different content).

### 3. Language selector in header

```tsx
import { LanguageSelector } from '@ht/i18n';

<LanguageSelector
  stateConfig={stateConfig}
  onLanguageChange={(locale) => {
    /* persist to profile */
  }}
/>;
```

### 4. Section 1557 tagline on priority pages

```tsx
import { Section1557Tagline } from '@ht/i18n';

<Section1557Tagline stateConfig={stateConfig} />;
```

### 5. Translations in components

```tsx
import { useTranslation } from '@ht/i18n';

const { t } = useTranslation('common');
return <p>{t('section1557_tagline')}</p>;
```

### 6. Formatting

```ts
import { formatDate, formatCurrency, formatPhone } from '@ht/i18n';

formatDate(new Date(), { locale: 'es' });
formatCurrency(99.99, { locale: 'es', currency: 'USD' });
formatPhone('5045551234', 'en-US');
```

## Translation production pipeline (offline)

MVP flow:

1. **Extract** English strings (e.g. from code or a flat JSON per namespace).
2. **AI translate** with Claude API, injecting glossary via prompt (use `glossaryToPromptContext` from this package).
3. **Human review** in Google Sheets or similar.
4. **Export** reviewed `es.json` (and other namespaces) into `locales/es/`.
5. **Deploy** with the next release.

No runtime translation API at MVP; all translations are static JSON.

## Namespaces

Suggested namespaces (one per priority page / module):

- `common` — shared (tagline, language label, etc.)
- `dashboard` — Member Benefits Dashboard
- `eligibility` — Eligibility & Enrollment Portal
- `provider-directory` — Find a Provider
- `login` — Login / Registration
- `help` — Help Center / FAQ

Add JSON files under `locales/<locale>/<namespace>.json` and pass them in `initI18n({ resources })`.

## Glossary

See `glossary/medicaid-glossary.example.json`. Maintain a spreadsheet of ~200 Medicaid terms with approved Spanish translations; export to JSON and pass to `glossaryToPromptContext(glossary)` when building the AI translation prompt.

## Config files

Example state config: `configs/state-LA.example.json`. Duplicate and adjust per state; load at runtime or build time in the app.
