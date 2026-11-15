// Purchase orders of the demo company: what it buys from its suppliers, at the unit cost of the
// products of the supplier's category. Same shape and same lazy lines as the sales orders.
import type { StatusBadgeTone } from '../../status-badge/StatusBadge';
import type { DemoProductCategory } from './catalog';
import type { DemoCurrency } from './currency';
import { createDataset, DEMO_REFERENCE_POOL, indexFromId } from './dataset';
import { daysAgo, daysBetween, DEMO_TODAY } from './dates';
import { ageCache, buildLines, documentNumber, drawLines, poolIndexes, type DemoOrderLine, type LineSource } from './order-lines';
import { createRowRng, hashSeed } from './rng';
import { makeSuppliers } from './suppliers';

export type DemoPurchaseOrderStatus = 'draft' | 'sent' | 'received' | 'closed';

export interface DemoPurchaseOrder {
  /** Stable id, e.g. `po-12`. */
  readonly id: string;
  /** `PO-<year>-<day of year><row>` (see `documentNumber`): sorting by number sorts by order date. */
  readonly number: string;
  /** An `active` supplier among the first `DEMO_REFERENCE_POOL.suppliers`. */
  readonly supplierId: string;
  /** The supplier's currency: every amount of the order and of its lines is in it. */
  readonly currency: DemoCurrency;
  readonly status: DemoPurchaseOrderStatus;
  /** The supplier's buyer (an employee, see `DEMO_REFERENCE_POOL`). */
  readonly buyerId: string;
  /** ISO date, never before the supplier was registered, never after `DEMO_TODAY`. */
  readonly orderDate: string;
  /** ISO date the goods are expected: the supplier's lead time (plus up to five days) after `orderDate`. */
  readonly expectedDeliveryDate: string;
  /** How many lines `getPurchaseOrder(id).lines` has (1 to 12). */
  readonly lineCount: number;
  /** Sum of the line totals (after discounts), in minor units of `currency`. Always above zero. */
  readonly totalMinor: number;
}

/** The order with its lines. */
export interface DemoPurchaseOrderDetail extends DemoPurchaseOrder {
  readonly lines: readonly DemoOrderLine[];
}

export const PURCHASE_ORDER_STATUS_LABEL: Readonly<Record<DemoPurchaseOrderStatus, string>> = Object.freeze({
  draft: 'Draft',
  sent: 'Sent',
  received: 'Received',
  closed: 'Closed',
});

export const PURCHASE_ORDER_STATUS_TONE: Readonly<Record<DemoPurchaseOrderStatus, StatusBadgeTone>> = Object.freeze({
  draft: 'neutral',
  sent: 'info',
  received: 'success',
  closed: 'neutral',
});

const STATUS_WEIGHTS: readonly (readonly [DemoPurchaseOrderStatus, number])[] = [
  ['draft', 12],
  ['sent', 26],
  ['received', 24],
  ['closed', 38],
];

/** [youngest, oldest] age in days of the order date, by status. */
const ORDER_AGE: Readonly<Record<DemoPurchaseOrderStatus, readonly [number, number]>> = {
  draft: [0, 7],
  sent: [3, 40],
  received: [20, 120],
  closed: [60, 400],
};

const LINE_COUNTS: readonly (readonly [number, number])[] = [
  [1, 22],
  [2, 24],
  [3, 20],
  [4, 14],
  [5, 8],
  [6, 6],
  [8, 4],
  [12, 2],
];
const QUANTITIES: readonly (readonly [number, number])[] = [
  [10, 20],
  [20, 20],
  [50, 25],
  [100, 20],
  [250, 10],
  [500, 5],
];
const DISCOUNTS: readonly (readonly [number, number])[] = [
  [0, 55],
  [5, 20],
  [10, 15],
  [15, 10],
];

const SEED = hashSeed('demo-data/purchase-orders');
const STATUS_SEED = hashSeed('demo-data/purchase-orders/status');
const LINES_SEED = hashSeed('demo-data/purchase-orders/lines');

let activeSuppliers: readonly number[] | undefined;
let supplierAge: ((index: number) => number) | undefined;
const sources = new Map<DemoProductCategory, LineSource>();

/** Lines come from the products of the supplier's own category (never drafts). */
function lineSource(category: DemoProductCategory): LineSource {
  let source = sources.get(category);
  if (!source) {
    source = {
      eligible: poolIndexes((product) => product.status !== 'draft' && product.category === category),
      unitPrice: (product, currency) => product.unitCostMinor[currency],
      quantities: QUANTITIES,
      discounts: DISCOUNTS,
    };
    sources.set(category, source);
  }
  return source;
}

function makePurchaseOrder(index: number): DemoPurchaseOrder {
  const suppliers = makeSuppliers(DEMO_REFERENCE_POOL.suppliers);
  if (!activeSuppliers) {
    activeSuppliers = suppliers.flatMap((supplier, i) => (supplier.status === 'active' ? [i] : []));
    supplierAge = ageCache(suppliers, (createdOn) => daysBetween(createdOn, DEMO_TODAY));
  }
  const status = createRowRng(STATUS_SEED, index).weighted(STATUS_WEIGHTS);
  const rng = createRowRng(SEED, index);
  const supplierIndex = activeSuppliers[rng.int(0, activeSuppliers.length - 1)]!;
  const supplier = suppliers[supplierIndex]!;
  const [youngest, oldest] = ORDER_AGE[status];
  const oldestAllowed = Math.min(oldest, supplierAge!(supplierIndex));
  const age = rng.int(Math.min(youngest, oldestAllowed), oldestAllowed);
  const orderDate = daysAgo(age);
  const lineCount = rng.weighted(LINE_COUNTS);
  const expectedDeliveryDate = daysAgo(age - supplier.leadTimeDays - rng.int(0, 5));
  const id = `po-${index + 1}`;
  return Object.freeze({
    id,
    number: documentNumber('PO', orderDate, index),
    supplierId: supplier.id,
    currency: supplier.currency,
    status,
    buyerId: supplier.buyerId,
    orderDate,
    expectedDeliveryDate,
    lineCount,
    totalMinor: drawLines(createRowRng(LINES_SEED, index), lineCount, lineSource(supplier.category), supplier.currency),
  });
}

function makePurchaseOrderDetail(index: number): DemoPurchaseOrderDetail {
  const order = purchaseOrders.at(index);
  const supplier = makeSuppliers(DEMO_REFERENCE_POOL.suppliers)[indexFromId(order.supplierId, 'sup-')]!;
  drawLines(createRowRng(LINES_SEED, index), order.lineCount, lineSource(supplier.category), order.currency);
  return Object.freeze({ ...order, lines: buildLines(order.id, order.lineCount) });
}

const purchaseOrders = createDataset('makePurchaseOrders', makePurchaseOrder);
const details = createDataset('getPurchaseOrder', makePurchaseOrderDetail);

/**
 * The first `n` purchase orders (headers and totals, no lines), frozen and cached per `n`. Row `i` is
 * the same for every `n`. Every `supplierId` is among `makeSuppliers(DEMO_REFERENCE_POOL.suppliers)`
 * and every line is a product of the supplier's category; line amounts follow the rounding rule of
 * the sales orders (half-up discount, minor units of the supplier's currency). Throws on a negative
 * or non-integer `n`.
 */
export const makePurchaseOrders = (n: number): readonly DemoPurchaseOrder[] => purchaseOrders.make(n);

/** The purchase order of any well-formed id (`po-<positive integer>`) with its lines, or `undefined`. */
export function getPurchaseOrder(id: string): DemoPurchaseOrderDetail | undefined {
  const index = indexFromId(id, 'po-');
  return index < 0 ? undefined : details.at(index);
}
