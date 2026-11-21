// Shopping carts of the company's webshop: a contact of a customer fills a cart with active products at
// list price, in the customer's currency. A list row carries its lines (a cart is small: 0 to 15) and
// the total, the sum of the line totals. A coupon takes the same whole percent off every line.
import type { StatusBadgeTone } from '../../status-badge/StatusBadge';
import { makeCustomers } from './customers';
import type { DemoCurrency } from './currency';
import { createDataset, DEMO_REFERENCE_POOL, indexFromId } from './dataset';
import { daysAgo, daysBetween, DEMO_TODAY } from './dates';
import { buildLines, drawLines, poolIndexes, type DemoOrderLine, type LineSource, type WeightTable } from './order-lines';
import { createRowRng, hashSeed } from './rng';

/** `active`: updated in the last days; `abandoned`: left with items, untouched for longer; `checked-out`: ordered. */
export type DemoCartStatus = 'active' | 'abandoned' | 'checked-out';

export interface DemoCart {
  /** Stable id, e.g. `cart-12`. */
  readonly id: string;
  /** `CART-<n>`, e.g. `CART-10012`. Unique. */
  readonly number: string;
  /** A customer among the first `DEMO_REFERENCE_POOL.customers`; an archived customer only has `checked-out` carts. */
  readonly customerId: string;
  /** The full name of a contact of the customer. */
  readonly buyerName: string;
  /** The customer's currency: every amount of the cart and of its lines is in it. */
  readonly currency: DemoCurrency;
  readonly status: DemoCartStatus;
  /** ISO date, never before the customer's `createdOn`; before `DEMO_TODAY` when `checked-out`; at most 3 days back when `active`. */
  readonly updatedAt: string;
  /** A coupon such as `SPRING10` (the number is the percent off each line), or `null`. */
  readonly couponCode: string | null;
  /** 0 to 15 lines of active products at list price; one line per product. A `checked-out` cart has at least one. */
  readonly lines: readonly DemoOrderLine[];
  /** Sum of the line totals (after the coupon), in minor units of `currency`. 0 for an empty cart. */
  readonly totalMinor: number;
}

export const CART_STATUS_LABEL: Readonly<Record<DemoCartStatus, string>> = Object.freeze({
  active: 'Active',
  abandoned: 'Abandoned',
  'checked-out': 'Checked out',
});

export const CART_STATUS_TONE: Readonly<Record<DemoCartStatus, StatusBadgeTone>> = Object.freeze({
  active: 'info',
  abandoned: 'warning',
  'checked-out': 'success',
});

const STATUS_WEIGHTS: readonly (readonly [DemoCartStatus, number])[] = [
  ['active', 22],
  ['abandoned', 33],
  ['checked-out', 45],
];
/** [youngest, oldest] age in days of `updatedAt`, by status. */
const UPDATED_AGE: Readonly<Record<DemoCartStatus, readonly [number, number]>> = {
  active: [0, 3],
  abandoned: [4, 90],
  'checked-out': [1, 180],
};
const LINE_COUNTS: WeightTable = [
  [0, 10],
  [1, 20],
  [2, 20],
  [3, 15],
  [4, 10],
  [5, 8],
  [7, 6],
  [10, 6],
  [15, 5],
];
const QUANTITIES: WeightTable = [
  [1, 30],
  [2, 25],
  [5, 20],
  [10, 15],
  [20, 7],
  [50, 3],
];
const NO_DISCOUNT: WeightTable = [[0, 1]];
const COUPONS: readonly string[] = ['WELCOME5', 'SPRING10', 'TRADE15', 'RESTOCK10', 'SAFETY20', 'ACADEMY5'];
const COUPON_CHANCE = 0.18;

const SEED = hashSeed('demo-data/carts');
const LINES_SEED = hashSeed('demo-data/carts/lines');

/** The whole percent a coupon takes off, read from the digits of its code. */
const couponPercent = (code: string): number => Number(code.replace(/\D+/g, ''));

const sources = new Map<number, LineSource>();
function lineSource(percent: number): LineSource {
  let source = sources.get(percent);
  if (!source) {
    source = {
      eligible: poolIndexes((product) => product.status === 'active'),
      unitPrice: (product, currency) => product.listPriceMinor[currency],
      quantities: QUANTITIES,
      discounts: percent === 0 ? NO_DISCOUNT : [[percent, 1]],
    };
    sources.set(percent, source);
  }
  return source;
}

let nonArchived: readonly number[] | undefined;
let customerAges: Int32Array | undefined;

function makeCart(index: number): DemoCart {
  const customers = makeCustomers(DEMO_REFERENCE_POOL.customers);
  const rng = createRowRng(SEED, index);
  const status = rng.weighted(STATUS_WEIGHTS);
  // An archived account has no open cart.
  nonArchived ??= customers.flatMap((c, i) => (c.status === 'archived' ? [] : [i]));
  const customerIndex = status === 'checked-out' ? rng.int(0, customers.length - 1) : nonArchived[rng.int(0, nonArchived.length - 1)]!;
  const customer = customers[customerIndex]!;
  customerAges ??= new Int32Array(customers.length).fill(-1);
  let customerAge = customerAges[customerIndex]!;
  if (customerAge < 0) customerAges[customerIndex] = customerAge = daysBetween(customer.createdOn, DEMO_TODAY);
  const [youngest, oldest] = UPDATED_AGE[status];
  const oldestAllowed = Math.min(oldest, customerAge);
  const age = rng.int(Math.min(youngest, oldestAllowed), oldestAllowed);
  const buyer = customer.contacts[rng.int(0, customer.contacts.length - 1)]!;
  let lineCount = rng.weighted(LINE_COUNTS);
  // A cart that was ordered is not empty.
  if (status === 'checked-out' && lineCount === 0) lineCount = 1;
  const couponCode = lineCount > 0 && rng.chance(COUPON_CHANCE) ? rng.pick(COUPONS) : null;
  const id = `cart-${index + 1}`;
  let totalMinor = 0;
  let lines: readonly DemoOrderLine[] = Object.freeze([]);
  if (lineCount > 0) {
    const percent = couponCode === null ? 0 : couponPercent(couponCode);
    totalMinor = drawLines(createRowRng(LINES_SEED, index), lineCount, lineSource(percent), customer.currency);
    lines = buildLines(id, lineCount);
  }
  return Object.freeze({
    id,
    number: `CART-${10001 + index}`,
    customerId: customer.id,
    buyerName: buyer.fullName,
    currency: customer.currency,
    status,
    updatedAt: daysAgo(age),
    couponCode,
    lines,
    totalMinor,
  });
}

const carts = createDataset('makeCarts', makeCart);

/**
 * The first `n` carts, frozen and cached per `n`. Row `i` is the same for every `n`. Every
 * `customerId` is among `makeCustomers(DEMO_REFERENCE_POOL.customers)`, every line a product of
 * `makeProducts(DEMO_REFERENCE_POOL.products)`. A line is `quantity x list price - coupon`, the coupon
 * discount rounded half-up like every order line (see `discountMinor`); the total is the sum of the
 * lines. Throws on a negative or non-integer `n`.
 */
export const makeCarts = (n: number): readonly DemoCart[] => carts.make(n);

/** The cart of any well-formed id (`cart-<positive integer>`), generated on demand, or `undefined`. */
export function getCart(id: string): DemoCart | undefined {
  const index = indexFromId(id, 'cart-');
  return index < 0 ? undefined : carts.at(index);
}
