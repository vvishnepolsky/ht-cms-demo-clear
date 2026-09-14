import { describe, it, expect } from 'vitest';
import { glossaryToPromptContext } from '../src/glossary.js';
import type { Glossary } from '../src/glossary.js';

describe('glossaryToPromptContext', () => {
  it('formats entries as "term => translation" per line', () => {
    const glossary: Glossary = {
      locale: 'es',
      entries: [
        { term: 'prior authorization', translation: 'autorización previa' },
        { term: 'copayment', translation: 'copago' },
      ],
    };
    const result = glossaryToPromptContext(glossary);
    expect(result).toBe('prior authorization => autorización previa\ncopayment => copago');
  });

  it('includes context in parentheses when provided', () => {
    const glossary: Glossary = {
      locale: 'es',
      entries: [{ term: 'EOB', translation: 'explicación de beneficios', context: 'explanation of benefits' }],
    };
    const result = glossaryToPromptContext(glossary);
    expect(result).toBe('EOB => explicación de beneficios (explanation of benefits)');
  });

  it('handles empty entries', () => {
    const glossary: Glossary = { locale: 'es', entries: [] };
    const result = glossaryToPromptContext(glossary);
    expect(result).toBe('');
  });

  it('handles single entry', () => {
    const glossary: Glossary = {
      locale: 'es',
      entries: [{ term: 'formulary', translation: 'formulario' }],
    };
    const result = glossaryToPromptContext(glossary);
    expect(result).toBe('formulary => formulario');
  });
});
