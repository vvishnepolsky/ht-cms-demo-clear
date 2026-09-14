import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initI18n, isRTL } from '../src/init.js';
import type { StateLanguageConfig } from '../src/config/state-language-config.js';

// ENG-2520 (ST-B1): RTL locale support. Montana adds Dari (`prs`) and Pashto
// (`ps`) to the existing RTL set (`ar`, `he`, `fa`, `ur`).
//
// Note on file location: the plan names this `src/init.test.ts`, but this
// package's `vitest.config.ts` only collects `tests/**/*.test.ts` (a src-located
// test would silently never run), and `tsconfig.json` compiles `src/**/*` into
// `dist/`. Placing the suite here — alongside the existing `tests/init.test.ts`
// — is the config-correct home so both `test:unit` and `build` stay green.

describe('isRTL', () => {
  it.each(['ar', 'prs', 'ps', 'he', 'fa', 'ur'])('returns true for RTL locale %s', (locale) => {
    expect(isRTL(locale)).toBe(true);
  });

  it.each(['en', 'es', 'hmn'])('returns false for LTR locale %s', (locale) => {
    expect(isRTL(locale)).toBe(false);
  });

  it('resolves regional variants by base subtag', () => {
    expect(isRTL('ar-EG')).toBe(true);
    expect(isRTL('en-US')).toBe(false);
  });
});

describe('initI18n RTL direction', () => {
  const originalCookie = document.cookie;

  beforeEach(() => {
    document.cookie = '';
  });

  afterEach(() => {
    document.cookie = originalCookie;
  });

  const rtlStateConfig = (defaultLng: string): StateLanguageConfig => ({
    state_code: 'MT',
    active_languages: ['en', 'prs', 'ps'],
    default_language: defaultLng,
  });

  const resources = {
    en: { common: {} },
    prs: { common: {} },
    ps: { common: {} },
  };

  it("sets document.documentElement.dir='rtl' for Dari (prs)", async () => {
    const i18n = await initI18n({ stateConfig: rtlStateConfig('prs'), resources });
    expect(i18n.language).toBe('prs');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it("sets document.documentElement.dir='rtl' for Pashto (ps)", async () => {
    const i18n = await initI18n({ stateConfig: rtlStateConfig('ps'), resources });
    expect(i18n.language).toBe('ps');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it("restores dir='ltr' when languageChanged switches back to en", async () => {
    const i18n = await initI18n({ stateConfig: rtlStateConfig('prs'), resources });
    expect(document.documentElement.dir).toBe('rtl');

    await i18n.changeLanguage('en');
    expect(document.documentElement.dir).toBe('ltr');
  });

  // ENG-2520 follow-up: `initI18n`'s dir logic must resolve a regional variant by
  // its base subtag, exactly as `isRTL()` does — it now calls `isRTL()` internally
  // rather than a raw `RTL_LANGUAGES.includes()`. Before the fix these two tests
  // failed: `includes('ar-EG')` is `false`, so dir wrongly stayed 'ltr'.
  const regionalConfig: StateLanguageConfig = {
    state_code: 'MT',
    active_languages: ['en', 'ar-EG'],
    default_language: 'ar-EG',
  };
  const regionalResources = { en: { common: {} }, 'ar-EG': { common: {} } };

  it("sets initial dir='rtl' for a regional RTL default language (ar-EG)", async () => {
    const i18n = await initI18n({ stateConfig: regionalConfig, resources: regionalResources });
    expect(i18n.language).toBe('ar-EG');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it("flips dir to 'rtl' when languageChanged switches to a regional RTL variant", async () => {
    // Start LTR, then switch to a regional Arabic variant via languageChanged.
    const i18n = await initI18n({
      stateConfig: { ...regionalConfig, default_language: 'en' },
      resources: regionalResources,
    });
    expect(document.documentElement.dir).toBe('ltr');

    await i18n.changeLanguage('ar-EG');
    expect(document.documentElement.dir).toBe('rtl');
  });
});
