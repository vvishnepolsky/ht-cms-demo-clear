import { describe, it, expect } from 'vitest';
import { resolveLocale } from '../src/index.js';

describe('resolveLocale', () => {
  describe('ISO 639-1 codes', () => {
    it("returns 'en' for 'en'", () => {
      expect(resolveLocale('en')).toBe('en');
    });

    it("returns 'es' for 'es'", () => {
      expect(resolveLocale('es')).toBe('es');
    });

    it("returns 'en' for uppercase 'EN'", () => {
      expect(resolveLocale('EN')).toBe('en');
    });

    it("returns 'es' for uppercase 'ES'", () => {
      expect(resolveLocale('ES')).toBe('es');
    });

    it("returns 'en' for mixed-case 'En'", () => {
      expect(resolveLocale('En')).toBe('en');
    });

    it('trims whitespace', () => {
      expect(resolveLocale('  en  ')).toBe('en');
      expect(resolveLocale('\tes\n')).toBe('es');
    });
  });

  describe('legacy display labels', () => {
    it("returns 'en' for 'English'", () => {
      expect(resolveLocale('English')).toBe('en');
    });

    it("returns 'en' for 'english' (lowercase)", () => {
      expect(resolveLocale('english')).toBe('en');
    });

    it("returns 'es' for 'Spanish'", () => {
      expect(resolveLocale('Spanish')).toBe('es');
    });

    it("returns 'es' for 'spanish' (lowercase)", () => {
      expect(resolveLocale('spanish')).toBe('es');
    });

    it("returns 'es' for 'Español'", () => {
      expect(resolveLocale('Español')).toBe('es');
    });

    it("returns 'es' for 'español' (lowercase)", () => {
      expect(resolveLocale('español')).toBe('es');
    });
  });

  describe('null/undefined/empty', () => {
    it("returns 'en' for null", () => {
      expect(resolveLocale(null)).toBe('en');
    });

    it("returns 'en' for undefined", () => {
      expect(resolveLocale(undefined)).toBe('en');
    });

    it("returns 'en' for empty string", () => {
      expect(resolveLocale('')).toBe('en');
    });

    it("returns 'en' for whitespace-only string", () => {
      expect(resolveLocale('   ')).toBe('en');
    });
  });

  describe('Missouri UI "other" language keys fall back to en', () => {
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
    ])("returns 'en' for %s (no template coverage yet)", (key) => {
      expect(resolveLocale(key)).toBe('en');
    });
  });

  describe('unknown inputs', () => {
    it("returns 'en' for unrecognized string", () => {
      expect(resolveLocale('foo')).toBe('en');
    });

    it("returns 'en' for a BCP-47 region code we don't support", () => {
      expect(resolveLocale('fr-CA')).toBe('en');
    });
  });
});
