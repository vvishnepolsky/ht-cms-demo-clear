/**
 * Medicaid glossary — curated terms with approved translations.
 * At MVP: spreadsheet-based (~200 terms), fed into AI translation prompt.
 * Schema is forward-compatible with a future DB-backed glossary.
 */

export type GlossaryEntry = {
  /** English term (source). */
  term: string;
  /** Approved translation in target language. */
  translation: string;
  /** Optional context or usage note. */
  context?: string;
};

export type Glossary = {
  /** Target locale (e.g. "es"). */
  locale: string;
  entries: GlossaryEntry[];
};

/**
 * Build a glossary string for injection into AI translation prompts.
 * Format: "term => translation" per line.
 */
export function glossaryToPromptContext(glossary: Glossary): string {
  return glossary.entries.map((e) => `${e.term} => ${e.translation}${e.context ? ` (${e.context})` : ''}`).join('\n');
}
