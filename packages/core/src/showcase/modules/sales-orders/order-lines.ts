// Story-only (#520): the lines of a sales order as the form sees them (text as typed) and the rules on them. Money
// is typed in the major unit of the order's currency (`12.50`, whole yen for JPY) and kept in minor units. Not
// exported by the package.
import { CURRENCY_MINOR_DIGITS, getProduct, lineTotalMinor, type DemoCurrency } from '../../../internal/demo-data';
import { INTEGER } from '../../number-text';
import type { StoredOrderLine } from '../../sales-order-store';

/** A line in the form: every number is text as typed, so an invalid text can be shown and reported. */
export interface OrderLineValues {
  id: string;
  /** `''`: no product chosen yet. */
  productId: string;
  quantity: string;
  /** Major unit of the order's currency, with exactly its decimals (`12.50`, `1200` for JPY). */
  unitPrice: string;
  /** Whole percent. */
  discount: string;
}

export const MAX_QUANTITY = 99_999;
export const MAX_UNIT_PRICE_MINOR = 99_999_999;

const digitsOf = (currency: DemoCurrency): number => CURRENCY_MINOR_DIGITS[currency];

/** Minor units as the text of the major unit: `1250` EUR is `12.50`, `1250` JPY is `1250`. */
export function minorToText(minor: number, currency: DemoCurrency): string {
  const digits = digitsOf(currency);
  if (digits === 0) return String(minor);
  const text = String(minor).padStart(digits + 1, '0');
  return `${text.slice(0, -digits)}.${text.slice(-digits)}`;
}

/**
 * The minor units of a typed amount, or `null` when the text is not an amount of this currency: digits only,
 * with at most the currency's decimals (none for JPY). Exact (a string split, never a float product).
 */
export function textToMinor(text: string, currency: DemoCurrency): number | null {
  const digits = digitsOf(currency);
  const pattern = digits === 0 ? INTEGER : new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`);
  const t = text.trim();
  if (!pattern.test(t)) return null;
  const [whole = '', fraction = ''] = t.split('.');
  const minor = Number(whole + fraction.padEnd(digits, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}

export const toLineValues = (line: StoredOrderLine, currency: DemoCurrency): OrderLineValues => ({
  id: line.id,
  productId: line.productId,
  quantity: String(line.quantity),
  unitPrice: minorToText(line.unitPriceMinor, currency),
  discount: String(line.discountPercent),
});

/** The stored line of valid values (`validateLines` ran first): numbers parsed, never rounded. */
export const toStoredLine = (line: OrderLineValues, currency: DemoCurrency): StoredOrderLine => ({
  id: line.id,
  productId: line.productId,
  quantity: Number(line.quantity),
  unitPriceMinor: textToMinor(line.unitPrice, currency) ?? 0,
  discountPercent: Number(line.discount),
});

// Two texts are the same number only when BOTH are valid for the rule of the field (a whole number, an amount of the
// currency): `5` and `05` are the same quantity, but `5.0` is not valid for a quantity, so it is never "unchanged"
// (an invalid text left in a field always counts as a change, the contract of `number-text.ts`).
const sameInteger = (a: string, b: string): boolean => {
  if (a === b) return true;
  const [x, y] = [a.trim(), b.trim()];
  return INTEGER.test(x) && INTEGER.test(y) && Number.isSafeInteger(Number(x)) && Number(x) === Number(y);
};
const sameAmount = (a: string, b: string, currency: DemoCurrency): boolean => {
  if (a === b) return true;
  const [x, y] = [textToMinor(a, currency), textToMinor(b, currency)];
  return x !== null && x === y;
};

/** Same lines, in the same order, with the same ids and values (`5` is `05`; `5.0` is not `5`: it is not a valid quantity). */
export const sameLines = (a: readonly OrderLineValues[], b: readonly OrderLineValues[], currency: DemoCurrency): boolean =>
  a.length === b.length &&
  a.every((line, i) => {
    const other = b[i]!;
    return (
      line.id === other.id &&
      line.productId === other.productId &&
      sameInteger(line.quantity, other.quantity) &&
      sameAmount(line.unitPrice, other.unitPrice, currency) &&
      sameInteger(line.discount, other.discount)
    );
  });

export type LineErrorField = 'productId' | 'quantity' | 'unitPrice' | 'discount';
/** Dotted path of a line error (`lines.2.quantity`). */
export type LineErrorKey = `lines.${number}.${LineErrorField}`;
const key = (index: number, field: LineErrorField): LineErrorKey => `lines.${index}.${field}`;

const isQuantity = (text: string): boolean => INTEGER.test(text.trim()) && Number(text) >= 1 && Number(text) <= MAX_QUANTITY;
const isDiscount = (text: string): boolean => INTEGER.test(text.trim()) && Number(text) <= 100;

const unitPriceError = (text: string, currency: DemoCurrency): string | null => {
  const digits = digitsOf(currency);
  const minor = textToMinor(text, currency);
  if (minor === null) {
    return digits === 0
      ? `Unit price must be a whole amount greater than 0 (${currency} has no decimals).`
      : `Unit price must be an amount greater than 0 with at most ${digits} decimals.`;
  }
  if (minor < 1) return 'Unit price must be greater than 0.';
  if (minor > MAX_UNIT_PRICE_MINOR) return 'Unit price is too large.';
  return null;
};

/** Errors keyed by dotted path (`lines.2.quantity`); the rule "at least one line" belongs to the order (`lines`). */
export function validateLines(lines: readonly OrderLineValues[], currency: DemoCurrency): Partial<Record<LineErrorKey, string>> {
  const errors: Partial<Record<LineErrorKey, string>> = {};
  lines.forEach((line, i) => {
    if (line.productId === '') errors[key(i, 'productId')] = 'Choose a product.';
    if (!isQuantity(line.quantity)) errors[key(i, 'quantity')] = `Quantity must be a whole number from 1 to ${MAX_QUANTITY.toLocaleString('en-US')}.`;
    const price = unitPriceError(line.unitPrice, currency);
    if (price) errors[key(i, 'unitPrice')] = price;
    if (!isDiscount(line.discount)) errors[key(i, 'discount')] = 'Discount must be a whole percent from 0 to 100.';
  });
  return errors;
}

/** The line total in minor units, or `null` while any of its three numbers is not valid. */
export function lineTotal(line: OrderLineValues, currency: DemoCurrency): number | null {
  const unit = textToMinor(line.unitPrice, currency);
  if (!isQuantity(line.quantity) || unit === null || unit > MAX_UNIT_PRICE_MINOR || !isDiscount(line.discount)) return null;
  return lineTotalMinor(Number(line.quantity), unit, Number(line.discount));
}

/** The order total in minor units, or `null` while any line has no total (an empty list totals 0). */
export function orderTotal(lines: readonly OrderLineValues[], currency: DemoCurrency): number | null {
  let sum = 0;
  for (const line of lines) {
    const total = lineTotal(line, currency);
    if (total === null) return null;
    sum += total;
  }
  return sum;
}

/**
 * The next id for a new line: `new-<n>` with `n` past every `new-<n>` in `taken`, so an id is never the index
 * and never repeats within the order, also after add -> remove -> add.
 */
export function nextLineId(taken: ReadonlySet<string>, counter: number): { id: string; counter: number } {
  let n = counter;
  do n += 1;
  while (taken.has(`new-${n}`));
  return { id: `new-${n}`, counter: n };
}

/**
 * The lines of an order whose currency changed from `from` to `to` (the creation page, a customer chosen after
 * another): every unit price was typed in `from`, so it is re-priced, never converted. A line with a product takes
 * the product's list price in `to`; a line with no product (or an unknown one) has no price. The same currency
 * returns `lines` itself, untouched (nothing to re-price, no change for the form to see).
 */
export function repriceLines(lines: readonly OrderLineValues[], from: DemoCurrency, to: DemoCurrency): OrderLineValues[] {
  if (from === to) return lines as OrderLineValues[];
  return lines.map((line) => {
    const listPrice = getProduct(line.productId)?.listPriceMinor[to];
    return { ...line, unitPrice: listPrice === undefined ? '' : minorToText(listPrice, to) };
  });
}
