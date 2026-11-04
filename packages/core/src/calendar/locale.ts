import { parseIsoDate, type IsoDate, type IsoMonth, type Weekday } from './date-math';

/**
 * Locale handling of `Calendar` (spec §1.13.3). The locale comes from the `locale` prop, else the
 * runtime default: `undefined` is passed to `Intl`, which in a browser is the user's language and on
 * a server the process locale. The library never reads `navigator.language`. An invalid tag degrades
 * to the runtime default, never an exception.
 */
export function resolveLocale(locale: string | undefined): string | undefined {
  if (locale === undefined) return undefined;
  try {
    // Throws a RangeError on a structurally invalid tag ("en_US", "", "!!").
    return new Intl.Locale(locale).toString();
  } catch {
    return undefined;
  }
}

/**
 * Regions whose week does not start on Monday, from CLDR `weekData.firstDay` (supplemental data).
 * Used only when the engine has no `Intl.Locale#getWeekInfo`/`weekInfo`; every other region starts on
 * Monday (ISO 8601).
 */
const SUNDAY_REGIONS =
  ' AG AS BD BR BS BT BW BZ CA CN CO DM DO ET GT GU HK HN ID IL IN JM JP KE KH KR LA MH MM MO MT MX MZ NI NP PA PE PH PK PR PT PY SA SG SV TH TT TW UM US VE VI WS YE ZA ZW ';
const SATURDAY_REGIONS = ' AE AF BH DJ DZ EG IQ IR JO KW LY OM QA SD SY ';

/** First day of the week of a region (ISO 3166 alpha-2), per the CLDR table above; Monday otherwise. */
export function weekStartForRegion(region: string | undefined): Weekday {
  if (!region || !/^[A-Z]{2}$/.test(region)) return 1;
  // Space-delimited lookup: a whole two-letter code, never a substring across two codes.
  if (SUNDAY_REGIONS.includes(` ${region} `)) return 0;
  if (SATURDAY_REGIONS.includes(` ${region} `)) return 6;
  if (region === 'MV') return 5;
  return 1;
}

interface WeekInfo {
  firstDay?: unknown;
}
interface LocaleWithWeekInfo extends Intl.Locale {
  getWeekInfo?: () => WeekInfo;
  weekInfo?: WeekInfo;
}

/**
 * First day of the week for `locale`, in this order (spec §1.13.3): (1) `Intl.Locale#getWeekInfo()`
 * or the older `weekInfo` accessor, where the engine has one; (2) the CLDR region table above, on the
 * maximized locale's region (`ja` → `JP`, `en` → `US`); (3) Monday. `locale` `undefined` means the
 * runtime default.
 */
export function getWeekStartsOn(locale: string | undefined): Weekday {
  let loc: LocaleWithWeekInfo;
  try {
    loc = new Intl.Locale(resolveLocale(locale) ?? new Intl.DateTimeFormat().resolvedOptions().locale) as LocaleWithWeekInfo;
  } catch {
    return 1;
  }
  let info: WeekInfo | undefined;
  try {
    info = typeof loc.getWeekInfo === 'function' ? loc.getWeekInfo() : loc.weekInfo;
  } catch {
    info = undefined;
  }
  const first = info?.firstDay;
  // weekInfo numbers the days 1 (Monday) ... 7 (Sunday).
  if (typeof first === 'number' && Number.isInteger(first) && first >= 1 && first <= 7) return (first % 7) as Weekday;
  let region = loc.region;
  if (!region) {
    try {
      region = loc.maximize().region;
    } catch {
      region = undefined;
    }
  }
  return weekStartForRegion(region);
}

/** Localized texts of a calendar, all computed with `Intl.DateTimeFormat` in UTC (never shifts). */
export interface CalendarFormatters {
  /** "March 2026" (`YYYY-MM`). */
  month: (month: IsoMonth) => string;
  /** Short weekday name ("Mon"), 0 = Sunday. */
  weekdayShort: (weekday: Weekday) => string;
  /** Full weekday name ("Monday"), 0 = Sunday. */
  weekdayLong: (weekday: Weekday) => string;
  /** Day of the month, in the locale's digits ("3", "٣"). */
  day: (date: IsoDate) => string;
  /** Full date, the accessible name of a day ("Tuesday, March 3, 2026"). */
  fullDate: (date: IsoDate) => string;
}

/** A `Date` at noon UTC of a calendar date: formatted with `timeZone: 'UTC'` it is always that day. */
export function toUtcDate(date: IsoDate): Date {
  const d = parseIsoDate(date);
  if (!d) throw new RangeError(`toUtcDate: invalid ISO date ${JSON.stringify(date)}`);
  const out = new Date(0);
  // setUTCFullYear, not Date.UTC: Date.UTC maps years 0-99 to 1900-1999.
  out.setUTCFullYear(d.year, d.month - 1, d.day);
  out.setUTCHours(12, 0, 0, 0);
  return out;
}

function formatter(locale: string | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
}

/** Formatters for `locale` (already resolved with `resolveLocale`). */
export function createCalendarFormatters(locale: string | undefined): CalendarFormatters {
  const monthFormat = formatter(locale, { month: 'long', year: 'numeric' });
  const shortFormat = formatter(locale, { weekday: 'short' });
  const longFormat = formatter(locale, { weekday: 'long' });
  const dayFormat = formatter(locale, { day: 'numeric' });
  const fullFormat = formatter(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  // 2023-01-01 was a Sunday: weekday `n` is 2023-01-(1 + n).
  const weekday = (n: Weekday) => toUtcDate(`2023-01-0${n + 1}`);
  return {
    month: (month) => monthFormat.format(toUtcDate(`${month}-01`)),
    weekdayShort: (n) => shortFormat.format(weekday(n)),
    weekdayLong: (n) => longFormat.format(weekday(n)),
    day: (date) => dayFormat.format(toUtcDate(date)),
    fullDate: (date) => fullFormat.format(toUtcDate(date)),
  };
}
