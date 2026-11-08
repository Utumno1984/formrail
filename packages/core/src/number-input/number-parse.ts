// Pure parsing, formatting and stepping of `NumberInput` (spec §1.13.2, §1.13.3). No React here.

/** What the field needs from a locale: a formatter for the text and the rules to read it back. */
export interface NumberLocale {
  /** The value as the field shows it: the locale's decimal separator and digits, no grouping. */
  format: (value: number) => string;
  /** The locale's decimal separator (`,` in `it-IT`, `.` in `en-US`). */
  decimal: string;
  /** Reads typed text back. See `parseNumber`. */
  parse: (text: string) => ParseResult;
}

export type ParseResult = { kind: 'empty' } | { kind: 'invalid' } | { kind: 'number'; value: number };

const chars = (...codes: number[]) => String.fromCharCode(...codes);
// `-`, U+2212 MINUS SIGN, U+2012..U+2014 dashes, U+FE63 / U+FF0D: what some locales format or keyboards type.
const MINUS_SIGNS = '-' + chars(0x2212, 0x2012, 0x2013, 0x2014, 0xfe63, 0xff0d);
const ASCII_DIGITS = '0123456789';
// Spaces a paste may carry around the number: NBSP (U+00A0) and narrow NBSP (U+202F) included.
const SPACES = chars(0xa0, 0x202f);
const EDGE_SPACE = new RegExp(`^[\\s${SPACES}]+|[\\s${SPACES}]+$`, 'g');
// Directional marks some locales put around the sign: ALM (U+061C, `ar-EG`), LRM/RLM (U+200E/F).
const BIDI_MARKS = new RegExp(`[${chars(0x061c, 0x200e, 0x200f)}]`, 'g');

/**
 * Builds the locale rules. `locale` must already be resolved (`resolveLocale`): `undefined` is the
 * runtime default. Formatting uses `useGrouping: false`, so the text never carries a thousands
 * separator and parsing never has to guess one.
 */
export function createNumberLocale(locale: string | undefined): NumberLocale {
  const formatter = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 20 });
  const decimal = formatter.formatToParts(1.1).find((part) => part.type === 'decimal')?.value ?? '.';
  // The locale's own digits (e.g. Arabic-Indic in `ar-EG`) map back to ASCII; ASCII is always accepted.
  const digits = new Map<string, string>();
  for (let d = 0; d <= 9; d++) {
    const localized = formatter.format(d);
    if (localized !== String(d)) digits.set(localized, String(d));
  }
  return {
    format: (value) => formatter.format(value),
    decimal,
    parse: (text) => parseNumber(text, decimal, digits),
  };
}

/**
 * Reads `text` as a number. Accepted: an optional leading minus (ASCII `-` or a typographic minus),
 * digits, and at most one decimal separator, which is either the locale's or `.`. Rejected: a
 * leading `+`, exponents (`1e3`), grouping (`1.234,56` in `it-IT`, `1,234` in `en-US`), any other
 * character, and a lone `-`. Surrounding whitespace is ignored; only whitespace is `empty`.
 */
export function parseNumber(text: string, decimal: string, digits: ReadonlyMap<string, string> = new Map()): ParseResult {
  let s = text.replace(BIDI_MARKS, '').replace(EDGE_SPACE, '');
  if (s === '') return { kind: 'empty' };
  let negative = false;
  if (MINUS_SIGNS.includes(s[0]!)) {
    negative = true;
    s = s.slice(1);
  }
  let normalized = '';
  let separators = 0;
  for (const ch of s) {
    if (ASCII_DIGITS.includes(ch)) normalized += ch;
    else if (digits.has(ch)) normalized += digits.get(ch);
    else if (ch === decimal || ch === '.') {
      separators++;
      normalized += '.';
    } else return { kind: 'invalid' };
  }
  if (separators > 1 || !/\d/.test(normalized)) return { kind: 'invalid' };
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { kind: 'invalid' };
  // `-0` is reported as `0`.
  return { kind: 'number', value: negative && value !== 0 ? -value : value };
}

/** Number of digits after the decimal point in the shortest representation of `n` (`1e-7` → 7). */
export function decimalPlaces(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const [mantissa = '', exponent] = String(n).split('e');
  const fraction = mantissa.split('.')[1]?.length ?? 0;
  const exp = exponent === undefined ? 0 : Number(exponent);
  return Math.max(0, fraction - exp);
}

/** Rounds `n` to `places` decimals through the decimal string, so `0.30000000000000004` → `0.3`. */
export function roundTo(n: number, places: number): number {
  return Number(n.toFixed(Math.min(100, Math.max(0, places))));
}

/** `value` limited to `[min, max]`. When `min > max`, `min` wins. */
export function clamp(value: number, min: number | undefined, max: number | undefined): number {
  let v = value;
  if (max !== undefined && v > max) v = max;
  if (min !== undefined && v < min) v = min;
  return v;
}

/**
 * One step from `from`: `from + direction × step × multiplier`, rounded to the decimals of `from`
 * and of `step` (no floating-point noise), then limited to `[min, max]`. The result is not snapped
 * to a multiple of `step`: the step starts from the current value.
 */
export function stepFrom(
  from: number,
  step: number,
  direction: 1 | -1,
  multiplier: number,
  min: number | undefined,
  max: number | undefined,
): number {
  const places = Math.max(decimalPlaces(from), decimalPlaces(step));
  return clamp(roundTo(from + direction * step * multiplier, places), min, max);
}

/** A usable `step`: finite and > 0, else `1`. */
export function normalizeStep(step: number | undefined): number {
  return typeof step === 'number' && Number.isFinite(step) && step > 0 ? step : 1;
}

/** A usable limit: a finite number, else `undefined` (no limit). */
export function normalizeLimit(limit: number | undefined | null): number | undefined {
  return typeof limit === 'number' && Number.isFinite(limit) ? limit : undefined;
}

/** A displayable value: a finite number, else `undefined` (empty). `null`/`NaN`/`±Infinity` included. */
export function normalizeValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** The value written to the hidden native input: `"1.5"` whatever the locale, `""` when empty. */
export function canonicalString(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}
