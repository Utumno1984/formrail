// Calendar dates of the demo universe: ISO `yyyy-mm-dd` strings and whole-day arithmetic on the
// proleptic Gregorian calendar. No `Date`, no time of day, no time zone, so a daylight-saving change
// (e.g. 2026-03-29 in the EU) or the runtime's zone can never shift a date by one day.

/** "Today" in the demo universe. Every generated date is relative to it, never to the clock. */
export const DEMO_TODAY = '2026-10-15';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** Days in `month` (1-12) of `year`. */
export function daysInMonth(year: number, month: number): number {
  return month === 2 ? (isLeapYear(year) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Parses a strict, existing ISO date (`2026-02-29` is rejected, `2028-02-29` accepted). */
export function parseIsoDate(iso: string): { year: number; month: number; day: number } {
  const match = ISO_DATE.exec(iso);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)) return { year, month, day };
  }
  throw new RangeError(`Expected an existing ISO date (yyyy-mm-dd), got ${JSON.stringify(iso)}`);
}

// Day numbers since 1970-01-01 (H. Hinnant's `days_from_civil` / `civil_from_days`), integers only.
function toDayNumber(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

const pad2 = (value: number): string => (value < 10 ? `0${value}` : String(value));

function fromDayNumber(dayNumber: number): string {
  const z = dayNumber + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Whole days since 1970-01-01 of an ISO date (negative before it). */
export function isoToDayNumber(iso: string): number {
  const { year, month, day } = parseIsoDate(iso);
  return toDayNumber(year, month, day);
}

/** The ISO date `days` whole days after `iso` (before it when negative). */
export function addDays(iso: string, days: number): string {
  if (!Number.isInteger(days)) throw new RangeError(`addDays: days must be an integer, got ${days}`);
  return fromDayNumber(isoToDayNumber(iso) + days);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return isoToDayNumber(to) - isoToDayNumber(from);
}

const TODAY_DAY_NUMBER = isoToDayNumber(DEMO_TODAY);

/** The ISO date `days` days before `DEMO_TODAY` (after it when negative). */
export function daysAgo(days: number): string {
  if (!Number.isInteger(days)) throw new RangeError(`daysAgo: days must be an integer, got ${days}`);
  // The generators ask for a few thousand distinct days over and over: share the strings.
  let iso = DAYS_AGO_CACHE.get(days);
  if (iso === undefined) {
    iso = fromDayNumber(TODAY_DAY_NUMBER - days);
    DAYS_AGO_CACHE.set(days, iso);
  }
  return iso;
}

const DAYS_AGO_CACHE = new Map<number, string>();
