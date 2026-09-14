import { describe, it, expect } from 'vitest';
import { classifyPreferredLanguage } from '../src/index.js';

/**
 * `classifyPreferredLanguage` partitions any `preferredLanguage` value into
 * 'en' | 'es' | 'other' for the Missouri-style three-way language picker.
 * Complements the narrower `resolveLocale` (always 'en' | 'es').
 */
describe('classifyPreferredLanguage', () => {
  describe('ISO 639-1 codes', () => {
    it("returns 'en' for 'en'", () => {
      expect(classifyPreferredLanguage('en')).toBe('en');
    });

    it("returns 'es' for 'es'", () => {
      expect(classifyPreferredLanguage('es')).toBe('es');
    });

    it('case-insensitive', () => {
      expect(classifyPreferredLanguage('EN')).toBe('en');
      expect(classifyPreferredLanguage('Es')).toBe('es');
    });

    it('trims whitespace', () => {
      expect(classifyPreferredLanguage('  en  ')).toBe('en');
      expect(classifyPreferredLanguage('\tes\n')).toBe('es');
    });
  });

  describe('legacy display labels', () => {
    it("returns 'en' for 'English'", () => {
      expect(classifyPreferredLanguage('English')).toBe('en');
    });

    it("returns 'es' for 'Spanish'", () => {
      expect(classifyPreferredLanguage('Spanish')).toBe('es');
    });

    it("returns 'es' for 'Español'", () => {
      expect(classifyPreferredLanguage('Español')).toBe('es');
    });
  });

  describe('falsy / empty inputs → default to English radio', () => {
    it("returns 'en' for null", () => {
      expect(classifyPreferredLanguage(null)).toBe('en');
    });

    it("returns 'en' for undefined", () => {
      expect(classifyPreferredLanguage(undefined)).toBe('en');
    });

    it("returns 'en' for empty string", () => {
      expect(classifyPreferredLanguage('')).toBe('en');
    });

    it("returns 'en' for whitespace-only", () => {
      expect(classifyPreferredLanguage('   ')).toBe('en');
    });
  });

  describe("'other' bucket", () => {
    it.each([
      'bosnian',
      'vietnamese',
      'somali',
      'arabic',
      'burmese',
      'swahili',
      'chinese',
      'korean',
      'french',
      'nepali',
    ])("returns 'other' for Missouri refugee-language key %s", (key) => {
      expect(classifyPreferredLanguage(key)).toBe('other');
    });

    it("returns 'other' for unknown ISO codes", () => {
      expect(classifyPreferredLanguage('fr')).toBe('other');
      expect(classifyPreferredLanguage('de')).toBe('other');
    });

    it("returns 'other' for free-text custom languages", () => {
      expect(classifyPreferredLanguage('Welsh')).toBe('other');
      expect(classifyPreferredLanguage('Klingon')).toBe('other');
    });
  });
});
