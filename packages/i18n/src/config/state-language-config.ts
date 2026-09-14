import { z } from 'zod';

/**
 * State language configuration — forward-compatible with full PRD spec.
 * No admin UI at MVP; engineers manage JSON config per state.
 */
export const StateLanguageConfigSchema = z.object({
  state_code: z.string().length(2).describe('Two-letter state code (e.g. LA)'),
  active_languages: z.array(z.string().min(2)).min(1).describe('Locale codes enabled for this state'),
  default_language: z.string().min(2).describe('Default locale when no user preference'),
});

export type StateLanguageConfig = z.infer<typeof StateLanguageConfigSchema>;

/**
 * Load and parse state language config. At MVP, config is provided by the app
 * (e.g. from loader, env, or static import). Use this to validate.
 */
export function parseStateLanguageConfig(data: unknown): StateLanguageConfig {
  return StateLanguageConfigSchema.parse(data);
}
