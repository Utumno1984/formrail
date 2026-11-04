/**
 * Pure calendar-date arithmetic for `Calendar` (and the DatePicker built on it).
 *
 * A calendar date is a day on the proleptic Gregorian calendar, NOT an instant: it is written as an
 * ISO string `YYYY-MM-DD` and every computation here is integer arithmetic on year/month/day (a
 * day number counted from 1970-01-01), never on local hours. Nothing in this module reads the
 * runtime time zone, so a selection can never shift by one day across time zones or a daylight
 * saving change. Supported years: 0001 to 9999 (four digits, so ISO strings compare as strings).
 */

/** A calendar date, `YYYY-MM-DD` (no time, no time zone). */
export type IsoDate = string;
/** A calendar month, `YYYY-MM`. */
export type IsoMonth = string;
/** Day of the week: 0 = Sunday ... 6 = Saturday (same numbering as `Date#getUTCDay`). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface CalendarDate {
  year: number;
  /** 1 to 12. */
  month: number;
  /** 1 to 31. */
  day: number;
}

export const MIN_YEAR = 1;
export const MAX_YEAR = 9999;
export const FIRST_DATE: IsoDate = '0001-01-01';
export const LAST_DATE: IsoDate = '9999-12-31';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Number of days of `month` (1-12) in `year`. */
export function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : (MONTH_DAYS[month - 1] as number);
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** `{ year, month, day }` → `YYYY-MM-DD`. The parts are assumed valid. */
export function formatIsoDate({ year, month, day }: CalendarDate): IsoDate {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** `YYYY-MM` of `year`/`month`. */
export function formatIsoMonth(year: number, month: number): IsoMonth {
  return `${pad(year, 4)}-${pad(month, 2)}`;
}

/**
 * Strict parser: exactly `YYYY-MM-DD`, year 0001-9999, a day that exists (`2026-02-30`, `2100-02-29`
 * are invalid). Anything else (other formats, a `Date`, `''`, `null`) returns `null`.
 */
export function parseIsoDate(value: unknown): CalendarDate | null {
  if (typeof value !== 'string') return null;
  const m = ISO_DATE.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < MIN_YEAR || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** Strict parser for `YYYY-MM` (year 0001-9999). */
export function parseIsoMonth(value: unknown): { year: number; month: number } | null {
  if (typeof value !== 'string') return null;
  const m = ISO_MONTH.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < MIN_YEAR || month < 1 || month > 12) return null;
  return { year, month };
}

export const isIsoDate = (value: unknown): value is IsoDate => parseIsoDate(value) !== null;
export const isIsoMonth = (value: unknown): value is IsoMonth => parseIsoMonth(value) !== null;

/**
 * Days since 1970-01-01 (negative before), proleptic Gregorian. Integer-only algorithm ("days from
 * civil", H. Hinnant), valid for any year.
 */
export function toDayNumber({ year, month, day }: CalendarDate): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12; // March = 0
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of `toDayNumber`. */
export function fromDayNumber(days: number): CalendarDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

const inRange = (d: CalendarDate) => d.year >= MIN_YEAR && d.year <= MAX_YEAR;

/** `date` + `n` days, or `null` when the result falls outside 0001-01-01..9999-12-31 (or `date` is invalid). */
export function addDays(date: IsoDate, n: number): IsoDate | null {
  const d = parseIsoDate(date);
  if (!d) return null;
  const next = fromDayNumber(toDayNumber(d) + n);
  return inRange(next) ? formatIsoDate(next) : null;
}

/**
 * `date` + `n` months; the day is clamped to the last valid day of the target month (January 31 + 1
 * month = February 28/29, never March). `null` outside the supported years.
 */
export function addMonths(date: IsoDate, n: number): IsoDate | null {
  const d = parseIsoDate(date);
  if (!d) return null;
  const index = d.year * 12 + (d.month - 1) + n;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  return formatIsoDate({ year, month, day: Math.min(d.day, daysInMonth(year, month)) });
}

/** `month` + `n` months, or `null` outside the supported years. */
export function addMonthsToMonth(month: IsoMonth, n: number): IsoMonth | null {
  const m = parseIsoMonth(month);
  if (!m) return null;
  const index = m.year * 12 + (m.month - 1) + n;
  const year = Math.floor(index / 12);
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  return formatIsoMonth(year, (index % 12) + 1);
}

/** Day of the week of a valid date (0 = Sunday). */
export function dayOfWeek(date: IsoDate): Weekday {
  const d = parseIsoDate(date);
  if (!d) throw new RangeError(`dayOfWeek: invalid ISO date ${JSON.stringify(date)}`);
  // 1970-01-01 was a Thursday (4).
  return ((((toDayNumber(d) + 4) % 7) + 7) % 7) as Weekday;
}

/** `YYYY-MM` of a `YYYY-MM-DD`. */
export const monthOf = (date: IsoDate): IsoMonth => date.slice(0, 7);

export const firstDayOfMonth = (month: IsoMonth): IsoDate => `${month}-01`;

export function lastDayOfMonth(month: IsoMonth): IsoDate {
  const m = parseIsoMonth(month);
  if (!m) throw new RangeError(`lastDayOfMonth: invalid ISO month ${JSON.stringify(month)}`);
  return formatIsoDate({ year: m.year, month: m.month, day: daysInMonth(m.year, m.month) });
}

/** The day numbered `day` of `month`, clamped to the month's length (31 in February → 28/29). */
export function dayInMonth(month: IsoMonth, day: number): IsoDate {
  const m = parseIsoMonth(month);
  if (!m) throw new RangeError(`dayInMonth: invalid ISO month ${JSON.stringify(month)}`);
  return formatIsoDate({ year: m.year, month: m.month, day: Math.max(1, Math.min(day, daysInMonth(m.year, m.month))) });
}

/** First day of the week containing `date` (may be in the previous month); `null` before 0001-01-01. */
export function startOfWeek(date: IsoDate, weekStartsOn: Weekday): IsoDate | null {
  return addDays(date, -((dayOfWeek(date) - weekStartsOn + 7) % 7));
}

/** Last day of the week containing `date`; `null` after 9999-12-31. */
export function endOfWeek(date: IsoDate, weekStartsOn: Weekday): IsoDate | null {
  return addDays(date, 6 - ((dayOfWeek(date) - weekStartsOn + 7) % 7));
}

/** Number of rows of every month grid: months of 4, 5 or 6 weeks all get 6 rows (stable height). */
export const GRID_ROWS = 6;

/**
 * The days of `month` laid out in 6 rows × 7 columns, the first column being `weekStartsOn`. Cells
 * outside the month are `null`. Every day of the month appears exactly once, in order.
 */
export function getMonthGrid(month: IsoMonth, weekStartsOn: Weekday): (IsoDate | null)[][] {
  const m = parseIsoMonth(month);
  if (!m) throw new RangeError(`getMonthGrid: invalid ISO month ${JSON.stringify(month)}`);
  const length = daysInMonth(m.year, m.month);
  const offset = (dayOfWeek(firstDayOfMonth(month)) - weekStartsOn + 7) % 7;
  const rows: (IsoDate | null)[][] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const row: (IsoDate | null)[] = [];
    for (let c = 0; c < 7; c++) {
      const day = r * 7 + c - offset + 1;
      row.push(day >= 1 && day <= length ? formatIsoDate({ year: m.year, month: m.month, day }) : null);
    }
    rows.push(row);
  }
  return rows;
}

/** Selection limits, already validated (every string is a valid `IsoDate`). */
export interface DateLimits {
  min?: IsoDate | undefined;
  max?: IsoDate | undefined;
  isDateDisabled?: ((date: IsoDate) => boolean) | undefined;
}

/** `min > max`: no date can be selected. */
export const limitsConflict = ({ min, max }: DateLimits): boolean => min !== undefined && max !== undefined && min > max;

/** True when `date` is within `min`/`max` (inclusive), `min <= max`, and not `isDateDisabled`. */
export function isDateSelectable(date: IsoDate, limits: DateLimits): boolean {
  const { min, max, isDateDisabled } = limits;
  if (limitsConflict(limits)) return false;
  if (min !== undefined && date < min) return false;
  if (max !== undefined && date > max) return false;
  return !isDateDisabled?.(date);
}

/**
 * True when at least one day of `month` lies within `min`/`max` (the disabled dates are not
 * considered): only such months can be reached with the month buttons and PageUp/PageDown. When
 * `min > max` the limits are ignored for navigation (nothing is selectable anyway).
 */
export function isMonthNavigable(month: IsoMonth, { min, max }: DateLimits): boolean {
  if (!isIsoMonth(month)) return false;
  if (limitsConflict({ min, max })) return true;
  if (max !== undefined && firstDayOfMonth(month) > max) return false;
  if (min !== undefined && lastDayOfMonth(month) < min) return false;
  return true;
}

/**
 * Whether the user may go from the visible month `from` to `to` (month buttons, PageUp/PageDown,
 * arrows crossing a month). Always when `to` is navigable. When `from` itself is outside `min`/`max`
 * (an external `value`/`month`/`defaultMonth` out of range), also any step TOWARDS the range that does
 * not overshoot it, so the user is never stuck on an out-of-range month. Never away from the range.
 */
export function canNavigateMonth(from: IsoMonth, to: IsoMonth, limits: DateLimits): boolean {
  if (!isIsoMonth(to)) return false;
  if (isMonthNavigable(to, limits)) return true;
  if (isMonthNavigable(from, limits)) return false;
  const { min, max } = limits;
  if (min !== undefined && from < monthOf(min)) return to > from && (max === undefined || to <= monthOf(max));
  if (max !== undefined && from > monthOf(max)) return to < from && (min === undefined || to >= monthOf(min));
  return false;
}

/** `month` moved inside the navigable range of `min`/`max` (unchanged when already inside). */
export function clampMonth(month: IsoMonth, { min, max }: DateLimits): IsoMonth {
  if (limitsConflict({ min, max })) return month;
  if (min !== undefined && month < monthOf(min)) return monthOf(min);
  if (max !== undefined && month > monthOf(max)) return monthOf(max);
  return month;
}

/**
 * The single tab stop of the grid of `month` when the user has not moved the focus yet: the
 * selected date if it is in the month, else today if it is in the month, else the first selectable
 * day of the month, else the first day of the month (never no tab stop).
 */
export function getFocusableDate(
  month: IsoMonth,
  { selected, today, limits }: { selected?: IsoDate | null | undefined; today?: IsoDate | undefined; limits: DateLimits },
): IsoDate {
  if (selected && monthOf(selected) === month) return selected;
  if (today && monthOf(today) === month) return today;
  const last = lastDayOfMonth(month);
  for (let date: IsoDate | null = firstDayOfMonth(month); date && date <= last; date = addDays(date, 1)) {
    if (isDateSelectable(date, limits)) return date;
  }
  return firstDayOfMonth(month);
}

/** Keys that move the focus inside the grid. */
export type GridNavigationKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End' | 'PageUp' | 'PageDown';

const NAVIGATION_KEYS = new Set<string>(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
export const isGridNavigationKey = (key: string): key is GridNavigationKey => NAVIGATION_KEYS.has(key);

/**
 * Where a navigation key moves the focus from `date`: arrows ±1 day (left/right swapped when `rtl`)
 * and ±7 days, Home/End to the start/end of the week (per `weekStartsOn`), PageUp/PageDown ±1 month
 * and with `shift` ±1 year (both clamped to the last valid day: January 31 → February 28/29).
 * `null` when the target is outside 0001-01-01..9999-12-31.
 */
export function getKeyboardTarget(
  date: IsoDate,
  key: GridNavigationKey,
  { shift = false, rtl = false, weekStartsOn }: { shift?: boolean; rtl?: boolean; weekStartsOn: Weekday },
): IsoDate | null {
  switch (key) {
    case 'ArrowLeft':
      return addDays(date, rtl ? 1 : -1);
    case 'ArrowRight':
      return addDays(date, rtl ? -1 : 1);
    case 'ArrowUp':
      return addDays(date, -7);
    case 'ArrowDown':
      return addDays(date, 7);
    case 'Home':
      return startOfWeek(date, weekStartsOn);
    case 'End':
      return endOfWeek(date, weekStartsOn);
    case 'PageUp':
      return addMonths(date, shift ? -12 : -1);
    case 'PageDown':
      return addMonths(date, shift ? 12 : 1);
  }
}

/** Today's calendar date in the runtime's local time zone (what the user's wall clock shows). */
export function localToday(now: Date = new Date()): IsoDate {
  return formatIsoDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}
