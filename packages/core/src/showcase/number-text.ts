// Story-only: number-as-text rules shared by the invoice form and its line items. Not exported by the package.

export const INTEGER = /^\d+$/;
export const DECIMAL = /^\d+(\.\d+)?$/;

// "150" and "150.00" are the same number; two identical texts are equal. Two different texts are compared
// numerically only when BOTH have the valid decimal form: "2e0" or "0x2" are not "2", so an invalid text left in a
// field always counts as a change.
export const sameNumberText = (a: string, b: string): boolean =>
  a === b || (DECIMAL.test(a.trim()) && DECIMAL.test(b.trim()) && Number(a) === Number(b));

// `Number#toFixed` and `String(number)` switch to exponential notation ("1e+21") from 1e21 up, and a saved number
// is reloaded through them: a value at or past this bound would reload as text that no longer passes
// `INTEGER`/`DECIMAL`. So every number field rejects it up front (amount, quantity, unit price, line total).
export const MAX_PLAIN_NUMBER = 1e21;

/** True when `text` has the plain digit form but its number is 1e21 or more (also digit strings that coerce to Infinity). */
export const isTooLarge = (text: string, pattern: RegExp): boolean => {
  const t = text.trim();
  return pattern.test(t) && !(Number(t) < MAX_PLAIN_NUMBER);
};

/** A positive number in plain digit form, below the bound. */
export const isPlainPositive = (text: string, pattern: RegExp): boolean => {
  const t = text.trim();
  return pattern.test(t) && Number(t) > 0 && Number(t) < MAX_PLAIN_NUMBER;
};
