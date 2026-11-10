// Story-only: number-as-text rules shared by the invoice form and its line items. Not exported by the package.

export const INTEGER = /^\d+$/;
export const DECIMAL = /^\d+(\.\d+)?$/;

// "150" and "150.00" are the same number; two identical texts are equal. Two different texts are compared
// numerically only when BOTH have the valid decimal form: "2e0" or "0x2" are not "2", so an invalid text left in a
// field always counts as a change.
export const sameNumberText = (a: string, b: string): boolean =>
  a === b || (DECIMAL.test(a.trim()) && DECIMAL.test(b.trim()) && Number(a) === Number(b));
