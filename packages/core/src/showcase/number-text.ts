// Story-only: number-as-text rules shared by the invoice form and its line items. Not exported by the package.

export const INTEGER = /^\d+$/;
export const DECIMAL = /^\d+(\.\d+)?$/;

// "150" and "150.00" are the same number; two empty texts are equal, an empty and a filled one are not.
export const sameNumberText = (a: string, b: string): boolean =>
  a === b || (a.trim() !== '' && b.trim() !== '' && Number(a) === Number(b));
