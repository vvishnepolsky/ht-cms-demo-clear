import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatNumber,
  formatCurrency,
  formatPhone,
  formatWeekday,
  formatTime,
  formatTimeRange,
  formatHoursByWeekday,
  formatDateOnly,
  formatDayList,
} from '../src/formatting.js';

describe('formatDate', () => {
  const date = new Date('2024-03-15T12:00:00Z');

  it('formats Date with default locale', () => {
    const result = formatDate(date);
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2024/);
  });

  it('formats number (timestamp)', () => {
    const result = formatDate(date.getTime());
    expect(result).toMatch(/2024/);
  });

  it('formats ISO string', () => {
    const result = formatDate('2024-03-15');
    expect(result).toMatch(/2024/);
  });

  it('respects locale option', () => {
    const en = formatDate(date, { locale: 'en-US' });
    const es = formatDate(date, { locale: 'es-ES' });
    expect(en).not.toBe(es);
    expect(es).toMatch(/2024/);
  });

  it('accepts Intl options', () => {
    const result = formatDate(date, { month: 'long', year: 'numeric' });
    expect(result).toMatch(/March|marzo|Mars/);
    expect(result).toMatch(/2024/);
  });
});

describe('formatNumber', () => {
  it('formats integer', () => {
    expect(formatNumber(1234)).toBe('1,234');
  });

  it('formats with locale', () => {
    expect(formatNumber(1234.5, { locale: 'de-DE' })).toMatch(/1\.234/);
  });

  it('accepts Intl options', () => {
    expect(formatNumber(0.5, { style: 'percent' })).toMatch(/50/);
  });
});

describe('formatCurrency', () => {
  it('formats as USD by default', () => {
    const result = formatCurrency(99.99);
    expect(result).toMatch(/\$|99\.99|99,99/);
  });

  it('respects currency option', () => {
    const result = formatCurrency(99.99, { currency: 'EUR', locale: 'de-DE' });
    expect(result).toMatch(/99|€/);
  });

  it('respects locale', () => {
    const result = formatCurrency(1000, { locale: 'es-ES', currency: 'USD' });
    expect(result).toMatch(/1|000|1\.000/);
  });
});

describe('formatPhone', () => {
  it('formats 10-digit string as (XXX) XXX-XXXX', () => {
    expect(formatPhone('5045551234')).toBe('(504) 555-1234');
  });

  it('strips non-digits and uses last 10 digits', () => {
    expect(formatPhone('1-504-555-1234')).toBe('(504) 555-1234');
  });

  it('returns input when fewer than 10 digits', () => {
    expect(formatPhone('123')).toBe('123');
  });

  it('returns input when not 10 digits after strip', () => {
    expect(formatPhone('')).toBe('');
  });

  it('accepts optional locale (format is NANP (XXX) XXX-XXXX)', () => {
    const result = formatPhone('5045551234', 'en-US');
    expect(result).toBe('(504) 555-1234');
  });
});

describe('formatTime', () => {
  it('formats a wall-clock HH:mm as a locale-aware time', () => {
    expect(formatTime('09:00')).toBe('9:00 AM');
    expect(formatTime('13:00')).toBe('1:00 PM');
    expect(formatTime('00:00')).toBe('12:00 AM');
  });

  it('is UTC-pinned so the clock face is rendered back unchanged', () => {
    // 08:00 must stay 08:00 regardless of the runner's local zone.
    expect(formatTime('08:00')).toBe('8:00 AM');
    expect(formatTime('19:00')).toBe('7:00 PM');
  });

  it('returns an unparseable value verbatim', () => {
    expect(formatTime('not-a-time')).toBe('not-a-time');
    expect(formatTime('25:00')).toBe('25:00');
  });

  it('requires the zero-padded HH:mm shape, not a single-digit hour or HH:mm:ss', () => {
    // The stored/written contract is always zero-padded HH:mm; these
    // near-miss shapes must fall through to the unparseable-verbatim path
    // rather than partially matching.
    expect(formatTime('9:00')).toBe('9:00');
    expect(formatTime('09:00:00')).toBe('09:00:00');
  });
});

describe('formatTimeRange', () => {
  // AC-001
  it('formats an openTime/closeTime pair into a display range', () => {
    const result = formatTimeRange('09:00', '13:00');
    expect(result).not.toBe('');
    expect(result).toBe('9:00 AM – 1:00 PM');
  });

  it('joins the two ends with a spaced en-dash', () => {
    expect(formatTimeRange('08:00', '12:00')).toBe('8:00 AM – 12:00 PM');
    expect(formatTimeRange('16:00', '19:00')).toBe('4:00 PM – 7:00 PM');
  });
});

describe('formatHoursByWeekday', () => {
  // The Sunday-first order the FMNP callers pass. Declared here rather than
  // imported: the helper takes the order as a parameter precisely so `@ht/i18n`
  // needs no dependency on the domain package that owns the real constant.
  const WEEK_ORDER = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;

  it('renders one row for a day with a single range', () => {
    expect(
      formatHoursByWeekday([{ dayOfWeek: 'SATURDAY', openTime: '08:00', closeTime: '12:00' }], WEEK_ORDER),
    ).toEqual([['Sat', '8:00 AM – 12:00 PM']]);
  });

  it('joins a split shift into ONE row for that day, in openTime order', () => {
    // Deliberately supplied afternoon-first: the join order must come from
    // `openTime`, not from the caller's array order.
    const rows = formatHoursByWeekday(
      [
        { dayOfWeek: 'SATURDAY', openTime: '16:00', closeTime: '19:00' },
        { dayOfWeek: 'SATURDAY', openTime: '08:00', closeTime: '12:00' },
      ],
      WEEK_ORDER,
    );
    expect(rows).toEqual([['Sat', '8:00 AM – 12:00 PM, 4:00 PM – 7:00 PM']]);
  });

  it('orders rows by the supplied weekOrder, not the input order', () => {
    const rows = formatHoursByWeekday(
      [
        { dayOfWeek: 'SATURDAY', openTime: '09:00', closeTime: '13:00' },
        { dayOfWeek: 'WEDNESDAY', openTime: '16:30', closeTime: '18:30' },
        { dayOfWeek: 'SUNDAY', openTime: '10:00', closeTime: '14:00' },
      ],
      WEEK_ORDER,
    );
    expect(rows).toEqual([
      ['Sun', '10:00 AM – 2:00 PM'],
      ['Wed', '4:30 PM – 6:30 PM'],
      ['Sat', '9:00 AM – 1:00 PM'],
    ]);
  });

  it('follows a caller-supplied order that differs from the i18n weekday index', () => {
    // Monday-first proves the ORDER is the parameter's, not the module's own
    // Sunday-first `WEEKDAY_INDEX` (which still supplies the LABELS).
    const rows = formatHoursByWeekday(
      [
        { dayOfWeek: 'SUNDAY', openTime: '10:00', closeTime: '14:00' },
        { dayOfWeek: 'MONDAY', openTime: '09:00', closeTime: '12:00' },
      ],
      ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
    );
    expect(rows.map(([label]) => label)).toEqual(['Mon', 'Sun']);
  });

  it('returns no rows for an empty input', () => {
    expect(formatHoursByWeekday([], WEEK_ORDER)).toEqual([]);
  });

  it('drops a day the caller left out of weekOrder', () => {
    const rows = formatHoursByWeekday(
      [
        { dayOfWeek: 'SATURDAY', openTime: '08:00', closeTime: '12:00' },
        { dayOfWeek: 'NOT_A_DAY', openTime: '08:00', closeTime: '12:00' },
      ],
      WEEK_ORDER,
    );
    expect(rows).toEqual([['Sat', '8:00 AM – 12:00 PM']]);
  });

  it('renders both the label and the times in the requested locale', () => {
    const rows = formatHoursByWeekday([{ dayOfWeek: 'SATURDAY', openTime: '16:00', closeTime: '19:00' }], WEEK_ORDER, {
      locale: 'de-DE',
    });
    const [[label, value]] = rows as [[string, string]];
    // German: 'Sa' for the weekday and a 24-hour clock with no AM/PM marker.
    expect(label).toBe('Sa');
    expect(value).toBe('16:00 – 19:00');
    expect(value).not.toBe(
      formatHoursByWeekday([{ dayOfWeek: 'SATURDAY', openTime: '16:00', closeTime: '19:00' }], WEEK_ORDER)[0]?.[1],
    );
  });
});

describe('formatDateOnly', () => {
  it('formats a UTC-midnight DateTime string as its calendar day', () => {
    expect(formatDateOnly('2026-06-13T00:00:00.000Z')).toBe('Jun 13, 2026');
    expect(formatDateOnly('2026-09-27T00:00:00.000Z')).toBe('Sep 27, 2026');
  });

  it('does not shift the calendar day (UTC-pinned)', () => {
    // A UTC-midnight value must render the same calendar day everywhere.
    expect(formatDateOnly('2026-05-03T00:00:00.000Z')).toBe('May 3, 2026');
  });

  it('respects the locale option', () => {
    const es = formatDateOnly('2026-06-13T00:00:00.000Z', { locale: 'es-ES' });
    expect(es).toMatch(/2026/);
    expect(es).not.toBe(formatDateOnly('2026-06-13T00:00:00.000Z'));
  });

  it('returns an unparseable value verbatim', () => {
    expect(formatDateOnly('not-a-date')).toBe('not-a-date');
  });
});

describe('formatWeekday', () => {
  it('formats each DayOfWeek key as its English short abbreviation by default', () => {
    expect(formatWeekday('SUNDAY')).toBe('Sun');
    expect(formatWeekday('MONDAY')).toBe('Mon');
    expect(formatWeekday('TUESDAY')).toBe('Tue');
    expect(formatWeekday('WEDNESDAY')).toBe('Wed');
    expect(formatWeekday('THURSDAY')).toBe('Thu');
    expect(formatWeekday('FRIDAY')).toBe('Fri');
    expect(formatWeekday('SATURDAY')).toBe('Sat');
  });

  it('localizes into a non-English locale', () => {
    const result = formatWeekday('SUNDAY', { locale: 'es-ES' });
    expect(result.toLowerCase()).toMatch(/dom/);
  });

  it('respects the weekday style option', () => {
    const result = formatWeekday('SUNDAY', { weekday: 'long' });
    expect(result).toBe('Sunday');
  });

  it('returns the key unchanged for an unrecognized day', () => {
    expect(formatWeekday('NOT_A_DAY')).toBe('NOT_A_DAY');
  });
});

describe('formatDayList', () => {
  it('joins two items with the English short conjunction', () => {
    expect(formatDayList(['Wed', 'Sat'])).toBe('Wed & Sat');
  });

  it('joins three-or-more items with an Oxford comma before the conjunction', () => {
    expect(formatDayList(['Mon', 'Wed', 'Fri'])).toBe('Mon, Wed, & Fri');
  });

  it('returns a single item unchanged', () => {
    expect(formatDayList(['Sat'])).toBe('Sat');
  });

  it('returns an empty string for an empty list', () => {
    expect(formatDayList([])).toBe('');
  });

  it('translates the conjunction word per locale, not a literal &', () => {
    expect(formatDayList(['Mié', 'Sáb'], { locale: 'es-ES' })).toBe('Mié y Sáb');
    expect(formatDayList(['Mi', 'Sa'], { locale: 'de-DE' })).toBe('Mi und Sa');
  });
});
