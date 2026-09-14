import { describe, it, expect } from 'vitest';
import { formatRecipientLine } from './ArgyleSendDialog';

describe('formatRecipientLine', () => {
  it('returns phone line when phone is provided', () => {
    expect(formatRecipientLine('(515) 555-0660', null)).toBe('(515) 555-0660 · SMS');
  });

  it('falls back to email when phone is null', () => {
    expect(formatRecipientLine(null, 'g.washington@email.com')).toBe('g.washington@email.com · Email');
  });

  it('returns null when both are null', () => {
    expect(formatRecipientLine(null, null)).toBeNull();
  });

  it('prefers phone over email when both are provided', () => {
    expect(formatRecipientLine('(515) 555-0660', 'g.washington@email.com')).toBe('(515) 555-0660 · SMS');
  });
});
