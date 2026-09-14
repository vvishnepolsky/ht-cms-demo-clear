/**
 * Locale-aware formatting for dates, numbers, currency, and phone numbers.
 * Uses Intl APIs so formatting respects the current i18n locale.
 */

export type FormatDateOptions = Intl.DateTimeFormatOptions & {
  locale?: string;
  date?: Date | number | string;
};

/**
 * Format a date in the given locale (defaults to short date style).
 */
export function formatDate(
  date: Date | number | string,
  options: Intl.DateTimeFormatOptions & { locale?: string } = {},
): string {
  const { locale = 'en-US', ...opts } = options;
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...opts,
  }).format(d);
}

/** `DayOfWeek` enum member (`SUNDAY`…`SATURDAY`) understood by `formatWeekday`. */
const WEEKDAY_INDEX: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

// 2023-01-01 is a Sunday — `formatWeekday` anchors to it, day 1 + index,
// because `Intl.DateTimeFormat` can only name the weekday of a real Date.
const REFERENCE_SUNDAY_DATE = 1;
if (new Date(2023, 0, REFERENCE_SUNDAY_DATE).getDay() !== 0) {
  throw new Error('formatWeekday reference date is no longer a Sunday');
}

export type FormatWeekdayOptions = {
  locale?: string;
  weekday?: Intl.DateTimeFormatOptions['weekday'];
};

/**
 * Format a `DayOfWeek` enum member (`SUNDAY`…`SATURDAY`) as a locale-aware
 * weekday abbreviation, e.g. `formatWeekday('SUNDAY')` -> `'Sun'` in English.
 * Unknown/unrecognized day keys return the key unchanged.
 */
export function formatWeekday(dayOfWeek: string, options: FormatWeekdayOptions = {}): string {
  const { locale = 'en-US', weekday = 'short' } = options;
  const index = WEEKDAY_INDEX[dayOfWeek];
  if (index === undefined) return dayOfWeek;
  const date = new Date(2023, 0, REFERENCE_SUNDAY_DATE + index);
  return new Intl.DateTimeFormat(locale, { weekday }).format(date);
}

export type FormatTimeOptions = {
  locale?: string;
};

/** `HH:mm` in 24-hour form. Anything else is returned unchanged (see `formatTime`). */
const WALL_CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Format a wall-clock `HH:mm` time (e.g. `'09:00'`) as a locale-aware display
 * string (e.g. `'9:00 AM'` in English).
 *
 * The input is a clock face, not an instant: a market opens at 8am local
 * regardless of DST, and a recurring `openTime`/`closeTime` has no single UTC
 * offset. Anchoring it to `Date.UTC(1970, 0, 1, h, m)` and formatting in UTC
 * renders that clock face back unchanged — routing it through a real zone would
 * shift it by that zone's offset (the same UTC-pin discipline `formatWallClockTime`
 * in `apps/montana/admin/src/lib/format-date.ts` applies). An unparseable value is
 * returned verbatim, mirroring `formatWeekday`'s "unknown key unchanged" contract.
 */
export function formatTime(time: string, options: FormatTimeOptions = {}): string {
  const { locale = 'en-US' } = options;
  const match = WALL_CLOCK_PATTERN.exec(time);
  if (!match) return time;
  const anchored = new Date(Date.UTC(1970, 0, 1, Number(match[1]), Number(match[2])));
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(anchored);
}

/**
 * Format a wall-clock `openTime`/`closeTime` pair into a single display range,
 * e.g. `formatTimeRange('09:00', '13:00')` -> `'9:00 AM – 1:00 PM'`. The two
 * ends are joined with a spaced en-dash. A caller with several ranges for one
 * day (a split shift) formats each pair and joins the results with `', '`.
 */
export function formatTimeRange(openTime: string, closeTime: string, options: FormatTimeOptions = {}): string {
  return `${formatTime(openTime, options)} – ${formatTime(closeTime, options)}`;
}

/**
 * One flat recurring wall-clock entry `formatHoursByWeekday` groups: a weekday
 * key plus an `openTime`/`closeTime` `HH:mm` pair.
 *
 * Declared STRUCTURALLY, not imported. The callers holding these records
 * (`@ht/wic-fmnp-shared`'s `FarmerLocationHour`) satisfy this shape by
 * construction, and keeping the parameter structural is what lets this
 * formatting module stay dependency-free — a locale-aware display helper must
 * not pull a domain package in behind it.
 */
export type WeekdayHourEntry = {
  dayOfWeek: string;
  openTime: string;
  closeTime: string;
};

export type FormatHoursByWeekdayOptions = {
  locale?: string;
};

/**
 * Group a flat list of recurring hour records into one display row per day, in
 * the caller's `weekOrder`.
 *
 * A day with several records (a split shift, e.g. 8–12 and 16–19 the same
 * Saturday) becomes ONE row whose value is each range formatted via
 * `formatTimeRange` and comma-joined. Each row is
 * `[formatWeekday(day), joinedRanges]` — the `[label, value]` pair the farmer
 * location screens' `HoursRows` renders, keyed by day.
 *
 * `weekOrder` is a PARAMETER, not this module's own `WEEKDAY_INDEX`: the row
 * ORDER is the caller's domain decision (Sunday-first for Montana FMNP), while
 * `WEEKDAY_INDEX` exists only to name a weekday in a locale. Days absent from
 * `hours` produce no row; days present in `hours` but absent from `weekOrder`
 * are dropped, so the caller's array is the complete statement of which days
 * can appear and in what sequence.
 *
 * Ranges within a day are sorted by `openTime` (a zero-padded `HH:mm` string,
 * so lexicographic order is chronological) rather than trusting server response
 * order — the server happens to return rows in `openTime` order today, but
 * nothing about this function's contract should depend on that staying true
 * upstream.
 */
export function formatHoursByWeekday(
  hours: WeekdayHourEntry[],
  weekOrder: readonly string[],
  options: FormatHoursByWeekdayOptions = {},
): [string, string][] {
  const { locale } = options;
  const byDay = new Map<string, WeekdayHourEntry[]>();
  for (const hour of hours) {
    const existing = byDay.get(hour.dayOfWeek) ?? [];
    existing.push(hour);
    byDay.set(hour.dayOfWeek, existing);
  }
  return weekOrder
    .filter((day) => byDay.has(day))
    .map((day): [string, string] => {
      const ranges = [...(byDay.get(day) ?? [])].sort((a, b) => a.openTime.localeCompare(b.openTime));
      return [
        formatWeekday(day, { locale }),
        ranges.map((r) => formatTimeRange(r.openTime, r.closeTime, { locale })).join(', '),
      ];
    });
}

export type FormatDayListOptions = {
  locale?: string;
};

/**
 * Locale-correct conjunction join of already-formatted day labels, e.g.
 * `formatDayList(['Wed', 'Sat'])` -> `'Wed & Sat'` in English.
 *
 * Backed by `Intl.ListFormat` rather than a hand-rolled `', '`/`' & '` join —
 * the hand-rolled version emits a literal, untranslated `&` in every locale
 * (e.g. `'Mié & Sáb'` in Spanish instead of `'Mié y Sáb'`), and hardcodes a
 * Western comma even for locales that use different list punctuation (e.g.
 * Chinese's `、`). `Intl.ListFormat` translates the conjunction word and
 * punctuation per locale; the one English-visible difference is an Oxford
 * comma before the conjunction on 3+ items (`'Mon, Wed, & Fri'`, not
 * `'Mon, Wed & Fri'`) — `style: 'short'` still gives the same `' & '`
 * conjunction rather than spelling out `'and'`.
 *
 * `Intl.ListFormat` is not universally implemented: Hermes and other RN/mobile
 * hosts ship no native `Intl.Locale` or `Intl.ListFormat`. Such a host MUST
 * load the `@formatjs/intl-locale` and `@formatjs/intl-listformat` polyfills
 * (plus its locales' list-format data), in that order, at bootstrap before
 * calling this function — otherwise the `new Intl.ListFormat(...)` below throws.
 */
export function formatDayList(labels: string[], options: FormatDayListOptions = {}): string {
  const { locale = 'en-US' } = options;
  return new Intl.ListFormat(locale, { style: 'short', type: 'conjunction' }).format(labels);
}

/**
 * Date-only display, pinned to **UTC**.
 *
 * For `@db.Date`-sourced values serialized as UTC-midnight `DateTime` strings
 * (a season start/end date, a date of birth): the calendar day is the whole
 * meaning and the instant is a fiction. Rendering in a local zone shifts the
 * day for any viewer west of Greenwich, turning a correct date into a wrong one
 * — so pin to UTC, the same convention as `formatDate`/`DATE_FORMAT` in
 * `apps/montana/admin/src/lib/format-date.ts`. An unparseable value is returned
 * verbatim. Never format a season date without this UTC pin.
 */
export function formatDateOnly(iso: string, options: { locale?: string } = {}): string {
  const { locale = 'en-US' } = options;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

export type FormatNumberOptions = Intl.NumberFormatOptions & {
  locale?: string;
};

/**
 * Format a number in the given locale.
 */
export function formatNumber(value: number, options: Intl.NumberFormatOptions & { locale?: string } = {}): string {
  const { locale = 'en-US', ...opts } = options;
  return new Intl.NumberFormat(locale, opts).format(value);
}

export type FormatCurrencyOptions = Intl.NumberFormatOptions & {
  locale?: string;
  currency?: string;
};

/**
 * Format a value as currency (USD by default).
 */
export function formatCurrency(value: number, options: FormatCurrencyOptions = {}): string {
  const { locale = 'en-US', currency = 'USD', ...opts } = options;
  return new Intl.NumberFormat(locale, { style: 'currency', currency, ...opts }).format(value);
}

/**
 * Format a phone number for display. Uses locale only for grouping;
 * for full NANP formatting you may want a library like libphonenumber.
 */
export function formatPhone(value: string, _locale?: string): string {
  const digits = value.replace(/\D/g, '').slice(-10);
  if (digits.length === 10) {
    return digits.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
  }
  return value;
}
