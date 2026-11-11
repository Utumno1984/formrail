// Story-only: the invoice line items as the form sees them (text as typed) and the rules on them. Not exported
// by the package.
import type { StoredLineItem } from './invoice-store';
import { DECIMAL, INTEGER, MAX_PLAIN_NUMBER, isPlainPositive, isTooLarge, sameNumberText } from './number-text';

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

/** A field of a line that has a validation error. */
export type LineErrorField = 'description' | 'quantity' | 'unitPrice';
/** Dotted path of a line error (`lineItems.2.quantity`). */
export type LineErrorKey = `lineItems.${number}.${LineErrorField}`;

const lineErrorKey = (index: number, field: LineErrorField): LineErrorKey => `lineItems.${index}.${field}`;

// A valid quantity is a whole number in (0, 1e21); a valid unit price is a decimal in (0, 1e21). The bound
// (`MAX_PLAIN_NUMBER`, see number-text.ts) also bounds `lineTotal`, see below.
const isValidQuantity = (text: string): boolean => isPlainPositive(text, INTEGER);
const isValidPrice = (text: string): boolean => isPlainPositive(text, DECIMAL);

/** Errors keyed by dotted path (`lineItems.2.quantity`). */
export function validateLines(lines: readonly LineValues[]): Partial<Record<LineErrorKey, string>> {
  const errors: Partial<Record<LineErrorKey, string>> = {};
  lines.forEach((line, i) => {
    if (line.description.trim() === '') errors[lineErrorKey(i, 'description')] = 'Description is required.';
    if (!isValidQuantity(line.quantity)) {
      errors[lineErrorKey(i, 'quantity')] = isTooLarge(line.quantity, INTEGER)
        ? 'Quantity must be less than 1e21.'
        : 'Quantity must be a whole number greater than 0.';
    }
    if (!isValidPrice(line.unitPrice)) {
      errors[lineErrorKey(i, 'unitPrice')] = isTooLarge(line.unitPrice, DECIMAL)
        ? 'Unit price must be less than 1e21.'
        : 'Unit price must be greater than 0.';
    }
  });
  return errors;
}

/** Quantity × unit price with 2 decimals, or `null` while the quantity or the unit price is not valid (see `validateLines`) or the product reaches 1e21. */
export function lineTotal(line: LineValues): string | null {
  if (!isValidQuantity(line.quantity) || !isValidPrice(line.unitPrice)) return null;
  const total = Number(line.quantity.trim()) * Number(line.unitPrice.trim());
  // Two valid factors can still multiply past the bound: no total is better than a "1e+21" one.
  return total < MAX_PLAIN_NUMBER ? total.toFixed(2) : null;
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
