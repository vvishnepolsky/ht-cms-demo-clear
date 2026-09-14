import { describe, it, expect } from 'vitest';
import { formatPhone, stripPhone } from '../phone';

describe('formatPhone', () => {
  it('returns empty for undefined', () => expect(formatPhone()).toBe(''));
  it('returns empty for empty string', () => expect(formatPhone('')).toBe(''));
  it('returns raw digits for ≤3 digits', () => expect(formatPhone('515')).toBe('515'));
  it('formats partial number (4–6 digits)', () => expect(formatPhone('5155')).toBe('(515) 5'));
  it('formats full 10-digit number', () => expect(formatPhone('5155550142')).toBe('(515) 555-0142'));
  it('strips non-digits before formatting', () => expect(formatPhone('(515) 555-0142')).toBe('(515) 555-0142'));
  it('truncates beyond 10 digits', () => expect(formatPhone('51555501429999')).toBe('(515) 555-0142'));
});

describe('stripPhone', () => {
  it('strips non-digit characters', () => expect(stripPhone('(515) 555-0142')).toBe('5155550142'));
  it('caps at 10 digits', () => expect(stripPhone('51555501429999')).toBe('5155550142'));
  it('returns empty string for no digits', () => expect(stripPhone('abc')).toBe(''));
  it('returns digits unchanged when already raw', () => expect(stripPhone('5155550142')).toBe('5155550142'));
});
