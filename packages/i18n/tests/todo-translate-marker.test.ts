import { describe, it, expect } from 'vitest';
import { initI18n } from '../src/init.js';
import type { StateLanguageConfig } from '../src/config/state-language-config.js';

/**
 * Guards the `__TODO_TRANSLATE__` marker contract that ENG-1307 introduced and
 * ENG-4387 relies on for `farmer.tos.sections` in `apps/montana/locales/es`.
 *
 * The convention only holds if BOTH are true:
 *   1. the prefix is stripped from plain-string lookups, and
 *   2. it is also stripped from strings nested inside a `returnObjects: true`
 *      lookup, WITHOUT collapsing the surrounding array.
 *
 * (2) is the load-bearing one. `stripTodoTranslateMarker` returns
 * `String(value ?? '')` for non-strings, so if the post-processor were ever handed
 * the array itself, it would stringify to `'[object Object]'`. Every consumer
 * guards with `Array.isArray(...) ? ... : []` (montana/resident
 * `FarmerFlowPage.useTosTerms`, montana/mobile `FarmerFlowScreen`), so that
 * regression would not throw — the Electronic Signature consent gate would
 * silently render with ZERO terms. A marked locale must degrade to the EN
 * fallback, never to an empty consent screen.
 */

const stateConfig: StateLanguageConfig = {
  state_code: 'MT',
  active_languages: ['en'],
  default_language: 'en',
};

const MARKED_SECTIONS = [
  {
    heading: '__TODO_TRANSLATE__ Consent to Use Electronic Records and Signatures.',
    body: '__TODO_TRANSLATE__ You agree to accept all communications electronically.',
  },
  { heading: '', body: '__TODO_TRANSLATE__ Effective: October 15, 2022' },
];

async function fixedT() {
  const i18n = await initI18n({
    stateConfig,
    resources: {
      en: {
        connect: {
          farmer: { tos: { sections: MARKED_SECTIONS } },
          plainMarked: '__TODO_TRANSLATE__ Something went wrong.',
          unmarked: 'Already translated.',
        },
      },
    },
    defaultNS: ['connect'],
  });
  return i18n.getFixedT('en', 'connect');
}

type TosSection = { heading: string; body: string };

describe('__TODO_TRANSLATE__ marker stripping', () => {
  it('strips the marker from a plain string lookup', async () => {
    const t = await fixedT();
    expect(t('plainMarked')).toBe('Something went wrong.');
  });

  it('leaves an unmarked string untouched', async () => {
    const t = await fixedT();
    expect(t('unmarked')).toBe('Already translated.');
  });

  it('preserves the array shape through returnObjects — never stringifies it', async () => {
    const t = await fixedT();
    const sections: unknown = t('farmer.tos.sections', { returnObjects: true });
    // A regression here makes every consumer's `Array.isArray` guard fall through
    // to `[]`, silently emptying the e-signature consent screen.
    expect(Array.isArray(sections)).toBe(true);
    expect(sections).toHaveLength(2);
  });

  it('strips the marker from strings nested inside returnObjects', async () => {
    const t = await fixedT();
    const sections = t('farmer.tos.sections', { returnObjects: true }) as TosSection[];
    expect(sections[0].heading).toBe('Consent to Use Electronic Records and Signatures.');
    expect(sections[0].body).toBe('You agree to accept all communications electronically.');
    expect(sections[1].body).toBe('Effective: October 15, 2022');
    for (const section of sections) {
      expect(section.heading).not.toContain('__TODO_TRANSLATE__');
      expect(section.body).not.toContain('__TODO_TRANSLATE__');
    }
  });

  it('keeps an intentionally empty heading empty', async () => {
    const t = await fixedT();
    const sections = t('farmer.tos.sections', { returnObjects: true }) as TosSection[];
    expect(sections[1].heading).toBe('');
  });
});
