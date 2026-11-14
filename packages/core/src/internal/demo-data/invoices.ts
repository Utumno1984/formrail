// Invoices of the demo company: each one bills a sales order in the `invoiced` status (the n-th
// invoice is the n-th such order), to the same customer, in the same currency, for the order total.
// Orders that are not `invoiced` (drafts, cancelled ones) never have an invoice, and the amount is
// never zero (a line total is at least 1 minor unit), so no row is skipped.
import type { StatusBadgeTone } from '../../status-badge/StatusBadge';
import { makeCustomers } from './customers';
import type { DemoCurrency } from './currency';
import { createDataset, DEMO_REFERENCE_POOL, indexFromId } from './dataset';
import { daysAgo, daysBetween, DEMO_TODAY } from './dates';
import { createRowRng, hashSeed } from './rng';
import { salesOrderAt, salesOrderStatusAt } from './sales-orders';
import { PAYMENT_TERMS_DAYS } from './terms';

/**
 * `issued`: sent, not yet due; `paid`; `overdue`: unpaid and due before `DEMO_TODAY` (computed against
 * the demo date, never the clock); `disputed`: the customer contests it, whatever the due date.
 */
export type DemoInvoiceStatus = 'issued' | 'paid' | 'overdue' | 'disputed';

export interface DemoInvoice {
  /** Stable id, e.g. `inv-12`. */
  readonly id: string;
  /** `INV-<year of the issue date>-<sequence>`, e.g. `INV-2026-10012`. */
  readonly number: string;
  /** The `invoiced` sales order this invoice bills (a row of `makeSalesOrders`). */
  readonly salesOrderId: string;
  /** The customer of the order. */
  readonly customerId: string;
  /** The currency of the order. */
  readonly currency: DemoCurrency;
  readonly status: DemoInvoiceStatus;
  /** ISO date, after the order date, never after `DEMO_TODAY`. */
  readonly issueDate: string;
  /** `issueDate` plus the customer's payment terms. */
  readonly dueDate: string;
  /** ISO date of the payment (only when `paid`), otherwise `null`. Between the issue date and `DEMO_TODAY`. */
  readonly paidOn: string | null;
  /** Equal to the total of the sales order, minor units of `currency`. Always above zero. */
  readonly totalMinor: number;
}

export const INVOICE_STATUS_LABEL: Readonly<Record<DemoInvoiceStatus, string>> = Object.freeze({
  issued: 'Issued',
  paid: 'Paid',
  overdue: 'Overdue',
  disputed: 'Disputed',
});

export const INVOICE_STATUS_TONE: Readonly<Record<DemoInvoiceStatus, StatusBadgeTone>> = Object.freeze({
  issued: 'info',
  paid: 'success',
  overdue: 'error',
  disputed: 'warning',
});

const SEED = hashSeed('demo-data/invoices');

/** Row indexes of the `invoiced` sales orders found so far, scanned forward on demand (cheap: a status only). */
const invoicedOrders: number[] = [];
let scanned = 0;
function invoicedOrderIndex(k: number): number {
  while (invoicedOrders.length <= k) {
    if (salesOrderStatusAt(scanned) === 'invoiced') invoicedOrders.push(scanned);
    scanned++;
  }
  return invoicedOrders[k]!;
}

function makeInvoice(index: number): DemoInvoice {
  const order = salesOrderAt(invoicedOrderIndex(index));
  const customers = makeCustomers(DEMO_REFERENCE_POOL.customers);
  const customer = customers[indexFromId(order.customerId, 'cus-')]!;
  const rng = createRowRng(SEED, index);
  const orderAge = daysBetween(order.orderDate, DEMO_TODAY);
  // Invoiced two days to three weeks after the order, never in the future.
  const issueAge = orderAge - rng.int(2, Math.min(20, orderAge));
  const termsDays = PAYMENT_TERMS_DAYS[customer.paymentTerms];
  const dueAge = issueAge - termsDays;
  const pastDue = dueAge > 0;
  // Paid: more often when already past the due date; disputed: a few, any time.
  const roll = rng.next();
  const paid = roll < (pastDue ? 0.55 : 0.25);
  const disputed = !paid && roll > (pastDue ? 0.92 : 0.96);
  const status: DemoInvoiceStatus = paid ? 'paid' : disputed ? 'disputed' : pastDue ? 'overdue' : 'issued';
  const paidAge = paid ? issueAge - rng.int(0, Math.min(issueAge, termsDays + 15)) : -1;
  const issueDate = daysAgo(issueAge);
  return Object.freeze({
    id: `inv-${index + 1}`,
    number: `INV-${issueDate.slice(0, 4)}-${10001 + index}`,
    salesOrderId: order.id,
    customerId: order.customerId,
    currency: order.currency,
    status,
    issueDate,
    dueDate: daysAgo(dueAge),
    paidOn: paid ? daysAgo(paidAge) : null,
    totalMinor: order.totalMinor,
  });
}

const invoices = createDataset('makeInvoices', makeInvoice);

/**
 * The first `n` invoices, frozen and cached per `n`. Row `i` is the same for every `n`. Each one
 * bills an `invoiced` order of `makeSalesOrders` (the same customer, currency and amount). The
 * status is derived from the dates against `DEMO_TODAY`, so it never changes with the system clock.
 * Throws on a negative or non-integer `n`.
 */
export const makeInvoices = (n: number): readonly DemoInvoice[] => invoices.make(n);

/** The invoice of any well-formed id (`inv-<positive integer>`), generated on demand, or `undefined`. */
export function getInvoice(id: string): DemoInvoice | undefined {
  const index = indexFromId(id, 'inv-');
  return index < 0 ? undefined : invoices.at(index);
}
