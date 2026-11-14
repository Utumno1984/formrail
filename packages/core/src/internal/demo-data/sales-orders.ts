// Sales orders of the demo company: what customers buy. A list row carries the header and the total;
// the lines are generated only by `getSalesOrder(id)` (see `order-lines.ts`), so a 100,000-row list
// stays cheap and the lines of an order are still always the same.
import type { StatusBadgeTone } from '../../status-badge/StatusBadge';
import { makeCustomers } from './customers';
import type { DemoCurrency } from './currency';
import { createDataset, DEMO_REFERENCE_POOL, indexFromId } from './dataset';
import { daysAgo, daysBetween, DEMO_TODAY } from './dates';
import { ageCache, buildLines, drawLines, poolIndexes, type DemoOrderLine, type LineSource } from './order-lines';
import { createRowRng, hashSeed } from './rng';

export type DemoSalesOrderStatus = 'draft' | 'confirmed' | 'shipped' | 'invoiced' | 'cancelled';

export interface DemoSalesOrder {
  /** Stable id, e.g. `so-12`. */
  readonly id: string;
  /** `SO-<year of the order date>-<sequence>`, e.g. `SO-2026-10012`. Unique: the sequence follows the row. */
  readonly number: string;
  /** A customer among the first `DEMO_REFERENCE_POOL.customers`. */
  readonly customerId: string;
  /** The customer's currency: every amount of the order and of its lines is in it. */
  readonly currency: DemoCurrency;
  readonly status: DemoSalesOrderStatus;
  /** The customer's own purchase order reference. */
  readonly customerReference: string;
  /** The customer's account manager (an employee, see `DEMO_REFERENCE_POOL`). */
  readonly accountManagerId: string;
  /** ISO date, never before the customer's `createdOn`, never after `DEMO_TODAY`. */
  readonly orderDate: string;
  /** ISO date the customer asked for delivery: 7 to 45 days after `orderDate`. */
  readonly requestedDeliveryDate: string;
  /** How many lines `getSalesOrder(id).lines` has (1 to 18). */
  readonly lineCount: number;
  /** Sum of the line totals (after discounts), in minor units of `currency`. Always above zero. */
  readonly totalMinor: number;
}

/** The order with its lines. */
export interface DemoSalesOrderDetail extends DemoSalesOrder {
  readonly lines: readonly DemoOrderLine[];
}

export const SALES_ORDER_STATUS_LABEL: Readonly<Record<DemoSalesOrderStatus, string>> = Object.freeze({
  draft: 'Draft',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  invoiced: 'Invoiced',
  cancelled: 'Cancelled',
});

export const SALES_ORDER_STATUS_TONE: Readonly<Record<DemoSalesOrderStatus, StatusBadgeTone>> = Object.freeze({
  draft: 'neutral',
  confirmed: 'info',
  shipped: 'warning',
  invoiced: 'success',
  cancelled: 'error',
});

const STATUS_WEIGHTS: readonly (readonly [DemoSalesOrderStatus, number])[] = [
  ['draft', 8],
  ['confirmed', 18],
  ['shipped', 18],
  ['invoiced', 46],
  ['cancelled', 10],
];

/** [youngest, oldest] age in days of the order date, by status (an order only grows older as it progresses). */
const ORDER_AGE: Readonly<Record<DemoSalesOrderStatus, readonly [number, number]>> = {
  draft: [0, 10],
  confirmed: [3, 30],
  shipped: [10, 60],
  invoiced: [61, 300],
  cancelled: [5, 200],
};
/** Invoiced orders that are recent enough for their invoice not to be due yet. */
const RECENT_INVOICED_AGE: readonly [number, number] = [25, 60];
const RECENT_INVOICED_CHANCE = 0.3;

// A few lines usually, sometimes a long order (12 to 18 lines) to exercise a scrolling Object Page.
const LINE_COUNTS: readonly (readonly [number, number])[] = [
  [1, 18],
  [2, 20],
  [3, 18],
  [4, 12],
  [5, 9],
  [6, 6],
  [8, 5],
  [12, 5],
  [15, 4],
  [18, 3],
];
const QUANTITIES: readonly (readonly [number, number])[] = [
  [1, 20],
  [2, 15],
  [5, 20],
  [10, 20],
  [20, 12],
  [50, 8],
  [100, 5],
];
const DISCOUNTS: readonly (readonly [number, number])[] = [
  [0, 60],
  [5, 15],
  [10, 14],
  [15, 6],
  [20, 4],
  [30, 1],
];

const SEED = hashSeed('demo-data/sales-orders');
const STATUS_SEED = hashSeed('demo-data/sales-orders/status');
const LINES_SEED = hashSeed('demo-data/sales-orders/lines');

let source: LineSource | undefined;
const lineSource = (): LineSource =>
  (source ??= {
    // Everything but drafts (a product still being set up cannot be sold).
    eligible: poolIndexes((product) => product.status !== 'draft'),
    unitPrice: (product, currency) => product.listPriceMinor[currency],
    quantities: QUANTITIES,
    discounts: DISCOUNTS,
  });

let customerAge: ((index: number) => number) | undefined;

/** The status of row `index`, computable without building the row (invoices scan for `invoiced` ones). */
export function salesOrderStatusAt(index: number): DemoSalesOrderStatus {
  return createRowRng(STATUS_SEED, index).weighted(STATUS_WEIGHTS);
}

function makeSalesOrder(index: number): DemoSalesOrder {
  const customers = makeCustomers(DEMO_REFERENCE_POOL.customers);
  customerAge ??= ageCache(customers, (createdOn) => daysBetween(createdOn, DEMO_TODAY));
  const status = salesOrderStatusAt(index);
  const rng = createRowRng(SEED, index);
  const customerIndex = rng.int(0, customers.length - 1);
  const customer = customers[customerIndex]!;
  const [youngest, oldest] =
    status === 'invoiced' && rng.chance(RECENT_INVOICED_CHANCE) ? RECENT_INVOICED_AGE : ORDER_AGE[status];
  // Never before the customer existed.
  const oldestAllowed = Math.min(oldest, customerAge(customerIndex));
  const age = rng.int(Math.min(youngest, oldestAllowed), oldestAllowed);
  const orderDate = daysAgo(age);
  const lineCount = rng.weighted(LINE_COUNTS);
  const customerReference = `REQ-${rng.int(10000, 99999)}`;
  const requestedDeliveryDate = daysAgo(age - rng.int(7, 45));
  const id = `so-${index + 1}`;
  return Object.freeze({
    id,
    number: `SO-${orderDate.slice(0, 4)}-${10001 + index}`,
    customerId: customer.id,
    currency: customer.currency,
    status,
    customerReference,
    accountManagerId: customer.accountManagerId,
    orderDate,
    requestedDeliveryDate,
    lineCount,
    totalMinor: drawLines(createRowRng(LINES_SEED, index), lineCount, lineSource(), customer.currency),
  });
}

function makeSalesOrderDetail(index: number): DemoSalesOrderDetail {
  const order = salesOrders.at(index);
  // The same random source as the list row drew the total from: the same lines, in the same order.
  drawLines(createRowRng(LINES_SEED, index), order.lineCount, lineSource(), order.currency);
  return Object.freeze({ ...order, lines: buildLines(order.id, order.lineCount) });
}

const salesOrders = createDataset('makeSalesOrders', makeSalesOrder);
const details = createDataset('getSalesOrder', makeSalesOrderDetail);

/** The row of a sales order by index (shared with the invoices, which refer to `invoiced` orders). */
export const salesOrderAt = (index: number): DemoSalesOrder => salesOrders.at(index);

/**
 * The first `n` sales orders (headers and totals, no lines), frozen and cached per `n`. Row `i` is the
 * same for every `n`. Every `customerId` is among `makeCustomers(DEMO_REFERENCE_POOL.customers)`, so
 * for `n` above the customer pool the same customers come back, deterministically. A line item is
 * `quantity x unit price - discount`, the discount rounded **half-up** to the minor unit of the
 * customer's currency (JPY has none: whole yen); the total is the sum of the lines. Throws on a
 * negative or non-integer `n`.
 */
export const makeSalesOrders = (n: number): readonly DemoSalesOrder[] => salesOrders.make(n);

/**
 * The sales order of any well-formed id (`so-<positive integer>`) with its lines, generated on demand
 * (and then cached, so the same id gives the same instance), or `undefined` for a malformed id.
 */
export function getSalesOrder(id: string): DemoSalesOrderDetail | undefined {
  const index = indexFromId(id, 'so-');
  return index < 0 ? undefined : details.at(index);
}
