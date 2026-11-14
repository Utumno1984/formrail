// The lines of sales and purchase orders. A list of 100,000 orders needs every order's total (it is a
// column) but not its lines, so the lines of a row are produced in two ways from ONE procedure:
// `drawLines` writes plain numbers into module-level scratch arrays (no object per line) and returns
// the total, which the list row keeps; `buildLines` turns the same scratch into frozen line records,
// when a detail is asked for. The same random source gives the same lines both times, so the sum of
// the lines of a detail is the total of its list row by construction (and by a test).
import { DEMO_REFERENCE_POOL } from './dataset';
import type { DemoCurrency } from './currency';
import { makeProducts, type DemoProduct } from './products';
import type { Rng } from './rng';

/** A line of a sales or purchase order. All money in minor units of the order's currency. */
export interface DemoOrderLine {
  /** Stable id, `<order id>-line-<n>`, e.g. `so-12-line-3`: lines can be edited and compared by identity. */
  readonly id: string;
  /** A product among the first `DEMO_REFERENCE_POOL.products`; one line per product within an order. */
  readonly productId: string;
  /** At least 1. */
  readonly quantity: number;
  /** Price of one unit: the list price (sales) or the unit cost (purchases) in the order's currency. */
  readonly unitPriceMinor: number;
  /** Whole percent, 0 to 30. */
  readonly discountPercent: number;
  /** `quantity x unitPriceMinor` minus the discount (see `discountMinor`), at least 1. */
  readonly lineTotalMinor: number;
}

/**
 * The discount on `grossMinor` (quantity x unit price) at `percent`, in minor units: **half-up**
 * (the exact half rounds away from zero, towards the larger discount). One rule for every line of
 * every order, so a line total never depends on how the order is summed.
 */
export function discountMinor(grossMinor: number, percent: number): number {
  // floor((2 * gross * percent + 100) / 200) is gross * percent / 100 rounded half-up, in integers.
  return Math.floor((2 * grossMinor * percent + 100) / 200);
}

/** `quantity x unit price` minus the half-up discount. */
export function lineTotalMinor(quantity: number, unitPriceMinor: number, discountPercent: number): number {
  const gross = quantity * unitPriceMinor;
  return gross - discountMinor(gross, discountPercent);
}

/** Most lines an order can have (sizes the scratch arrays). */
export const MAX_ORDER_LINES = 24;

const scratchProduct = new Int32Array(MAX_ORDER_LINES);
const scratchQuantity = new Int32Array(MAX_ORDER_LINES);
const scratchDiscount = new Int32Array(MAX_ORDER_LINES);
const scratchUnitPrice = new Float64Array(MAX_ORDER_LINES);
const scratchTotal = new Float64Array(MAX_ORDER_LINES);

export type WeightTable = readonly (readonly [number, number])[];

/** What an order draws its lines from. */
export interface LineSource {
  /** Indexes into the product pool the order may use (at least `MAX_ORDER_LINES`). */
  readonly eligible: readonly number[];
  /** The unit price of a product: list price for sales, unit cost for purchases. */
  readonly unitPrice: (product: DemoProduct, currency: DemoCurrency) => number;
  readonly quantities: WeightTable;
  readonly discounts: WeightTable;
}

/**
 * Draws `count` lines (distinct products) from `source` into the scratch arrays and returns the
 * order total in minor units. Not reentrant: read the scratch (`buildLines`) before drawing again.
 */
export function drawLines(rng: Rng, count: number, source: LineSource, currency: DemoCurrency): number {
  if (!Number.isInteger(count) || count < 1 || count > MAX_ORDER_LINES) {
    throw new RangeError(`drawLines: expected 1 to ${MAX_ORDER_LINES} lines, got ${count}`);
  }
  const pool = makeProducts(DEMO_REFERENCE_POOL.products);
  const { eligible } = source;
  if (eligible.length < count) throw new RangeError(`drawLines: ${count} distinct products asked, ${eligible.length} eligible`);
  let total = 0;
  for (let k = 0; k < count; k++) {
    let productIndex = eligible[rng.int(0, eligible.length - 1)]!;
    // One line per product: draw again on a repeat (the pool is far larger than any order).
    for (let j = 0; j < k; j++) {
      if (scratchProduct[j] === productIndex) {
        productIndex = eligible[rng.int(0, eligible.length - 1)]!;
        j = -1;
      }
    }
    const quantity = rng.weighted(source.quantities);
    const discount = rng.weighted(source.discounts);
    const unit = source.unitPrice(pool[productIndex]!, currency);
    const lineTotal = lineTotalMinor(quantity, unit, discount);
    scratchProduct[k] = productIndex;
    scratchQuantity[k] = quantity;
    scratchDiscount[k] = discount;
    scratchUnitPrice[k] = unit;
    scratchTotal[k] = lineTotal;
    total += lineTotal;
  }
  return total;
}

/** The first `count` lines of the last `drawLines` call, as frozen records with ids `<orderId>-line-<n>`. */
export function buildLines(orderId: string, count: number): readonly DemoOrderLine[] {
  const lines: DemoOrderLine[] = new Array<DemoOrderLine>(count);
  for (let k = 0; k < count; k++) {
    lines[k] = Object.freeze({
      id: `${orderId}-line-${k + 1}`,
      productId: `prd-${scratchProduct[k]! + 1}`,
      quantity: scratchQuantity[k]!,
      unitPriceMinor: scratchUnitPrice[k]!,
      discountPercent: scratchDiscount[k]!,
      lineTotalMinor: scratchTotal[k]!,
    });
  }
  return Object.freeze(lines);
}

/** Indexes (into the product pool) of the products `select` accepts. */
export function poolIndexes(select: (product: DemoProduct) => boolean): readonly number[] {
  const pool = makeProducts(DEMO_REFERENCE_POOL.products);
  const out: number[] = [];
  for (let i = 0; i < pool.length; i++) if (select(pool[i]!)) out.push(i);
  return out;
}

/** Days from `DEMO_TODAY` back to a customer's or supplier's `createdOn`, memoized per list index. */
export function ageCache(list: readonly { readonly createdOn: string }[], daysFrom: (iso: string) => number): (index: number) => number {
  const ages = new Int32Array(list.length).fill(-1);
  return (index: number) => {
    let age = ages[index]!;
    if (age < 0) {
      age = daysFrom(list[index]!.createdOn);
      ages[index] = age;
    }
    return age;
  };
}
