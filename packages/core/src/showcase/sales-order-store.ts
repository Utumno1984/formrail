// Story-only (#520): the in-memory "server" of the Sales orders module of the record-editing shell: the demo
// sales orders (`internal/demo-data`, with their lines) plus the two notes only the record page edits. Money is an
// integer amount of minor units next to the order's currency, as in the demo data; the form turns it into text.
// Not exported by the package.
import {
  getCustomer,
  getSalesOrder,
  lineTotalMinor,
  makeSalesOrders,
  type DemoCurrency,
  type DemoSalesOrderStatus,
} from '../internal/demo-data';
import { createRecordStore, type RecordStore, type RecordStoreConfig } from './record-store';

/** One line as the store keeps it: whole quantity, unit price in minor units of the order's currency. */
export interface StoredOrderLine {
  /** Unique within the order; assigned by whoever creates the line (the client) and kept as it is. */
  id: string;
  productId: string;
  quantity: number;
  unitPriceMinor: number;
  /** Whole percent. */
  discountPercent: number;
}

export interface StoredSalesOrder {
  id: string;
  number: string;
  customerId: string;
  /** The customer's name, copied when the order is seeded (a list row shows it without a second read). */
  customerName: string;
  /** The customer's currency: every amount of the order is in it. */
  currency: DemoCurrency;
  status: DemoSalesOrderStatus;
  customerReference: string;
  /** ISO date. */
  orderDate: string;
  /** ISO date, never before `orderDate`. */
  requestedDeliveryDate: string;
  deliveryNotes: string;
  notes: string;
  /** In display order. */
  lines: StoredOrderLine[];
  /** The sum of the line totals, in minor units: derived by the server on every write (see `normalize`). */
  totalMinor: number;
}

/** What a create would send: everything but the identity the server assigns and the total it derives. */
export type SalesOrderDraft = Omit<StoredSalesOrder, 'id' | 'number' | 'totalMinor'>;

export type { DeleteOutcome, LoadOutcome, SaveOutcome } from './record-store';
export type SalesOrderStoreConfig = RecordStoreConfig;
export type SalesOrderStore = RecordStore<StoredSalesOrder, SalesOrderDraft>;

/** The total of lines: each line is `quantity x unit price` minus its half-up discount (the demo data's rule). */
export const linesTotalMinor = (lines: readonly StoredOrderLine[]): number =>
  lines.reduce((sum, l) => sum + lineTotalMinor(l.quantity, l.unitPriceMinor, l.discountPercent), 0);

// Deterministic notes: a delivery instruction on every fourth order, a note on every seventh.
const DELIVERY_NOTES = [
  'Deliver to the goods-in door, weekdays 7:00 to 15:00.',
  'Call the site manager one hour before arrival.',
  'Pallets must not be stacked.',
];
const NOTES = ['Repeat order: same specification as the previous one.', 'Customer asked for a single bill.'];

function extend(index: number, id: string): StoredSalesOrder {
  const order = getSalesOrder(id);
  if (!order) throw new Error(`sales-order-store: no demo order "${id}"`);
  return {
    id: order.id,
    number: order.number,
    customerId: order.customerId,
    customerName: getCustomer(order.customerId)?.name ?? order.customerId,
    currency: order.currency,
    status: order.status,
    customerReference: order.customerReference,
    orderDate: order.orderDate,
    requestedDeliveryDate: order.requestedDeliveryDate,
    deliveryNotes: index % 4 === 0 ? DELIVERY_NOTES[(index / 4) % DELIVERY_NOTES.length]! : '',
    notes: index % 7 === 0 ? NOTES[index % NOTES.length]! : '',
    lines: order.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      quantity: l.quantity,
      unitPriceMinor: l.unitPriceMinor,
      discountPercent: l.discountPercent,
    })),
    totalMinor: order.totalMinor,
  };
}

/** The seed: the first `count` demo orders with their lines (200: the list of the showcase). */
export const makeShowcaseSalesOrders = (count = 200): StoredSalesOrder[] =>
  makeSalesOrders(count).map((order, index) => extend(index, order.id));

/**
 * The "server" of the Sales orders module. Every write derives the total from the lines, so the list always
 * shows the total of what is stored. `create` (#521) gets an identity from the store's monotonic counter like every
 * record store: the "server" assigns the id and the number (`SO-NEW-0201` for the first one, after the 200 seeded; never reused) and derives the total.
 */
export function createSalesOrderStore(
  seed: readonly StoredSalesOrder[] = makeShowcaseSalesOrders(),
  initial: Partial<SalesOrderStoreConfig> = {},
): SalesOrderStore {
  return createRecordStore<StoredSalesOrder, SalesOrderDraft>(
    seed,
    {
      createId: (sequence) => `so-new-${sequence}`,
      fromDraft: (draft, id, sequence) => ({
        ...draft,
        id,
        number: `SO-NEW-${String(sequence).padStart(4, '0')}`,
        totalMinor: linesTotalMinor(draft.lines),
      }),
      normalize: (order) => ({ ...order, totalMinor: linesTotalMinor(order.lines) }),
      copy: (order) => ({ ...order, lines: order.lines.map((l) => ({ ...l })) }),
      noun: { one: 'sales order', many: 'sales orders' },
    },
    initial,
  );
}
