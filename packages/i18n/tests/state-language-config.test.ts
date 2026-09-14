import { describe, it, expect } from 'vitest';
import { parseStateLanguageConfig, StateLanguageConfigSchema } from '../src/config/state-language-config.js';

describe('parseStateLanguageConfig', () => {
  it('parses valid config', () => {
    const config = parseStateLanguageConfig({
      state_code: 'LA',
      active_languages: ['en', 'es'],
      default_language: 'en',
    });
    expect(config).toEqual({
      state_code: 'LA',
      active_languages: ['en', 'es'],
      default_language: 'en',
    });
  });

  it('rejects state_code with wrong length', () => {
    expect(() =>
      parseStateLanguageConfig({
        state_code: 'L',
        active_languages: ['en'],
        default_language: 'en',
      }),
    ).toThrow();
    expect(() =>
      parseStateLanguageConfig({
        state_code: 'LAR',
        active_languages: ['en'],
        default_language: 'en',
      }),
    ).toThrow();
  });

  it('rejects empty active_languages', () => {
    expect(() =>
      parseStateLanguageConfig({
        state_code: 'LA',
        active_languages: [],
        default_language: 'en',
      }),
    ).toThrow();
  });

  it('rejects invalid locale (too short) in active_languages', () => {
    expect(() =>
      parseStateLanguageConfig({
        state_code: 'LA',
        active_languages: ['e'],
        default_language: 'en',
      }),
    ).toThrow();
  });

  it('rejects default_language too short', () => {
    expect(() =>
      parseStateLanguageConfig({
        state_code: 'LA',
        active_languages: ['en', 'es'],
        default_language: 'e',
      }),
    ).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => parseStateLanguageConfig({})).toThrow();
    expect(() => parseStateLanguageConfig({ state_code: 'LA' })).toThrow();
    expect(() => parseStateLanguageConfig(null)).toThrow();
    expect(() => parseStateLanguageConfig(undefined)).toThrow();
  });
});

describe('StateLanguageConfigSchema', () => {
  it('accepts multiple languages', () => {
    const result = StateLanguageConfigSchema.parse({
      state_code: 'TX',
      active_languages: ['en', 'es', 'vi'],
      default_language: 'en',
    });
    expect(result.active_languages).toHaveLength(3);
  });
});
