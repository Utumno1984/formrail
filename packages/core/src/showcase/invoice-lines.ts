// Story-only: the invoice line items as the form sees them (text as typed) and the rules on them. Not exported
// by the package.
import type { StoredLineItem } from './invoice-store';

/** A line in the form: quantity and unit price are text as typed, like the invoice `amount`. */
export interface LineValues {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

export const toLineValues = (line: StoredLineItem): LineValues => ({
  id: line.id,
  description: line.description,
  quantity: String(line.quantity),
  unitPrice: line.unitPrice.toFixed(2),
});

export const toStoredLine = (line: LineValues): StoredLineItem => ({
  id: line.id,
  description: line.description,
  quantity: Number(line.quantity),
  unitPrice: Number(line.unitPrice),
});

// "150" and "150.00" are the same number; two empty texts are equal, an empty and a filled one are not.
const sameNumberText = (a: string, b: string): boolean =>
  a === b || (a.trim() !== '' && b.trim() !== '' && Number(a) === Number(b));

/** Same lines, in the same order, with the same ids and values (quantity and price compared numerically). */
export const sameLines = (a: readonly LineValues[], b: readonly LineValues[]): boolean =>
  a.length === b.length &&
  a.every((line, i) => {
    const other = b[i]!;
    return (
      line.id === other.id &&
      line.description === other.description &&
      sameNumberText(line.quantity, other.quantity) &&
      sameNumberText(line.unitPrice, other.unitPrice)
    );
  });

const INTEGER = /^\d+$/;
const DECIMAL = /^\d+(\.\d+)?$/;

/** Errors keyed by dotted path (`lineItems.2.quantity`). */
export function validateLines(lines: readonly LineValues[]): Record<string, string> {
  const errors: Record<string, string> = {};
  lines.forEach((line, i) => {
    if (line.description.trim() === '') errors[`lineItems.${i}.description`] = 'Description is required.';
    const quantity = line.quantity.trim();
    if (!INTEGER.test(quantity) || Number(quantity) <= 0) {
      errors[`lineItems.${i}.quantity`] = 'Quantity must be a whole number greater than 0.';
    }
    const price = line.unitPrice.trim();
    if (!DECIMAL.test(price) || Number(price) <= 0) {
      errors[`lineItems.${i}.unitPrice`] = 'Unit price must be greater than 0.';
    }
  });
  return errors;
}

/** Quantity × unit price with 2 decimals, or `null` while either text is not a number. */
export function lineTotal(line: LineValues): string | null {
  const quantity = line.quantity.trim();
  const price = line.unitPrice.trim();
  if (!DECIMAL.test(quantity) || !DECIMAL.test(price)) return null;
  return (Number(quantity) * Number(price)).toFixed(2);
}

/**
 * The next id for a new line: `new-<n>` with `n` past every `new-<n>` in `taken`, so an id is never the index
 * and never repeats within the record, also after add -> remove -> add or after a reload of saved lines.
 */
export function nextLineId(taken: ReadonlySet<string>, counter: number): { id: string; counter: number } {
  let n = counter;
  do n += 1;
  while (taken.has(`new-${n}`));
  return { id: `new-${n}`, counter: n };
}
