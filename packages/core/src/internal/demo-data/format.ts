// Formatters of the demo universe. The locale is always explicit (`en-US`), never the runtime's, so a
// story, a test and a visual baseline print the same text on any machine, CI runner or browser.
import { CURRENCY_MINOR_DIGITS, type DemoCurrency } from './currency';
import { parseIsoDate } from './dates';

/** The one locale every demo formatter uses. */
export const DEMO_LOCALE = 'en-US';

const moneyFormats = new Map<DemoCurrency, Intl.NumberFormat>();

function moneyFormat(currency: DemoCurrency): Intl.NumberFormat {
  let format = moneyFormats.get(currency);
  if (!format) {
    const digits = CURRENCY_MINOR_DIGITS[currency];
    if (digits === undefined) throw new RangeError(`formatMoney: unsupported currency ${JSON.stringify(currency)}`);
    format = new Intl.NumberFormat(DEMO_LOCALE, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    moneyFormats.set(currency, format);
  }
  return format;
}

/**
 * An amount in minor units, formatted in `en-US` whatever the runtime locale: `formatMoney(123456,
 * 'EUR')` is `€1,234.56`, `formatMoney(123456, 'JPY')` is `¥123,456` (no decimals), a negative
 * amount is `-€12.50`. Throws on a non-integer or unsafe amount (money is never a float here).
 */
export function formatMoney(minor: number, currency: DemoCurrency): string {
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`formatMoney: expected an integer amount of minor units, got ${minor}`);
  }
  const format = moneyFormat(currency);
  // `-0` would print as "-€0.00".
  return format.format(minor === 0 ? 0 : minor / 10 ** CURRENCY_MINOR_DIGITS[currency]);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * An ISO date (`yyyy-mm-dd`) as `Mar 29, 2026` (the `en-US` medium date). Pure string work: no `Date`,
 * no time zone, so the day never shifts (a daylight-saving change or the runtime zone cannot move it).
 * Throws on anything that is not an existing ISO date.
 */
export function formatDate(iso: string): string {
  const { year, month, day } = parseIsoDate(iso);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}
