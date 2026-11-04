import { daysInMonth, formatIsoDate, isIsoDate, MIN_YEAR, type IsoDate } from '../calendar/date-math';

/**
 * The numeric text format of a date field for a locale (spec §1.13.3): the order of day, month
 * and year and the separator, both read from `Intl.DateTimeFormat#formatToParts` (`en-US` →
 * `MM/DD/YYYY`, `it-IT` → `DD/MM/YYYY`, `de-DE` → `DD.MM.YYYY`, `ja-JP` → `YYYY/MM/DD`). The text
 * is always written with ASCII digits, whatever the locale's numbering system: it is what the user
 * types back.
 */
export interface DateTextFormat {
  /** The three fields, in the order the locale writes them. */
  order: readonly DatePart[];
  /** What goes between two fields (`/`, `.`, `-`, `. `...). */
  separator: string;
  /** The placeholder, e.g. `MM/DD/YYYY`. */
  pattern: string;
}

export type DatePart = 'day' | 'month' | 'year';

const TOKEN: Record<DatePart, string> = { day: 'DD', month: 'MM', year: 'YYYY' };
const DEFAULT_ORDER: readonly DatePart[] = ['month', 'day', 'year'];
// Direction marks some locales put around the separator (they would end up in the typed text).
const BIDI_MARKS = /[؜‎‏‪-‮⁦-⁩]/g;
// A separator made of punctuation and spaces only; anything else (letters, digits) is not one.
const SEPARATOR = /^[\s./\-,]+$/;

/**
 * The text format of `locale` (already resolved: `undefined` = the runtime's). Never throws: an
 * engine that gives no usable parts falls back to `MM/DD/YYYY`-like order with `/`.
 */
export function getDateTextFormat(locale: string | undefined): DateTextFormat {
  let order: DatePart[] = [];
  let separator = '/';
  try {
    const parts = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' }).formatToParts(
      new Date(Date.UTC(2026, 2, 15, 12)),
    );
    let firstLiteral: string | undefined;
    for (const part of parts) {
      if (part.type === 'day' || part.type === 'month' || part.type === 'year') {
        if (!order.includes(part.type)) order.push(part.type);
      } else if (part.type === 'literal' && order.length === 1 && firstLiteral === undefined) {
        firstLiteral = part.value.replace(BIDI_MARKS, '');
      }
    }
    if (firstLiteral !== undefined && SEPARATOR.test(firstLiteral)) separator = firstLiteral;
  } catch {
    order = [];
  }
  if (order.length !== 3) order = [...DEFAULT_ORDER];
  return { order, separator, pattern: order.map((part) => TOKEN[part]).join(separator) };
}

/** `2026-03-15` → `03/15/2026` (en-US): zero-padded, 4-digit year, ASCII digits. */
export function formatDateText(date: IsoDate, format: DateTextFormat): string {
  const fields: Record<DatePart, string> = { year: date.slice(0, 4), month: date.slice(5, 7), day: date.slice(8, 10) };
  return format.order.map((part) => fields[part]).join(format.separator);
}

export type ParsedDateText = { kind: 'empty' } | { kind: 'date'; date: IsoDate } | { kind: 'invalid' };

const ISO_TEXT = /^\d{4}-\d{2}-\d{2}$/;
// Three groups of ASCII digits separated by punctuation/space runs (any of them, not only the
// locale's separator: `15.3.2026` is accepted in `it-IT` too).
const NUMERIC_TEXT = /^(\d+)[\s./\-,]+(\d+)[\s./\-,]+(\d+)[\s.]*$/;

/**
 * Parses what the user typed, in the order of `format`:
 * - blank (spaces only) → `empty`;
 * - an ISO date `YYYY-MM-DD` (a pasted value) → that date, in every locale;
 * - three groups of digits in the locale's order, separated by `/`, `.`, `-`, `,` or spaces: day
 *   and month 1 or 2 digits, year **exactly 4 digits** (no two-digit year guessing), a day that
 *   exists (`02/30/2026` is invalid), year 0001-9999;
 * - anything else (letters, two-digit years, out-of-range numbers) → `invalid`.
 * Limits (`min`/`max`/disabled dates) are not checked here.
 */
export function parseDateText(text: string, format: DateTextFormat): ParsedDateText {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'empty' };
  if (ISO_TEXT.test(trimmed)) return isIsoDate(trimmed) ? { kind: 'date', date: trimmed } : { kind: 'invalid' };
  const m = NUMERIC_TEXT.exec(trimmed);
  if (!m) return { kind: 'invalid' };
  const groups = [m[1], m[2], m[3]] as string[];
  const fields = {} as Record<DatePart, string>;
  format.order.forEach((part, i) => {
    fields[part] = groups[i] as string;
  });
  if (fields.year.length !== 4 || fields.month.length > 2 || fields.day.length > 2) return { kind: 'invalid' };
  const year = Number(fields.year);
  const month = Number(fields.month);
  const day = Number(fields.day);
  if (year < MIN_YEAR || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return { kind: 'invalid' };
  return { kind: 'date', date: formatIsoDate({ year, month, day }) };
}
