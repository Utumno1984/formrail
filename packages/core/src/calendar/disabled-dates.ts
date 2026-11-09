import { isIsoDate, type IsoDate } from './date-math';

/**
 * Turns a list of disabled dates into an `isDateDisabled` predicate for `Calendar` / `DatePicker`.
 * Each entry is either a single ISO date (`'2026-06-15'`) or a closed range `'from|to'`
 * (`'2026-06-18|2026-07-01'`, both ends included). Consumer-side helper for the demos: not exported
 * from the package, copy it if it fits.
 *
 * Throws on a malformed entry or a reversed range instead of silently disabling nothing.
 */
export function parseDisabledDates(entries: readonly string[]): (date: IsoDate) => boolean {
  const singles = new Set<IsoDate>();
  const ranges: Array<readonly [IsoDate, IsoDate]> = [];
  for (const entry of entries) {
    const parts = entry.split('|');
    if (parts.length > 2 || !parts.every((part) => isIsoDate(part))) {
      throw new Error(`parseDisabledDates: invalid entry "${entry}" (expected "YYYY-MM-DD" or "YYYY-MM-DD|YYYY-MM-DD")`);
    }
    const [from, to] = parts as [IsoDate, IsoDate | undefined];
    if (to === undefined) singles.add(from);
    else if (from > to) throw new Error(`parseDisabledDates: reversed range "${entry}" (from is after to)`);
    else ranges.push([from, to]);
  }
  // Valid ISO dates (zero-padded) sort lexicographically in calendar order.
  return (date) => singles.has(date) || ranges.some(([from, to]) => date >= from && date <= to);
}
