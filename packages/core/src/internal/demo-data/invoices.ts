// Invoices of the demo company: each one bills a sales order in the `invoiced` status (the n-th
// invoice is the n-th such order), to the same customer, in the same currency, for the order total.
// Orders that are not `invoiced` (drafts, cancelled ones) never have an invoice, and the amount is
// never zero (a line total is at least 1 minor unit), so no row is skipped.
import type { StatusBadgeTone } from '../../status-badge/StatusBadge';
import { makeCustomers } from './customers';
import type { DemoCurrency } from './currency';
import { createDataset, DEMO_REFERENCE_POOL, indexFromId } from './dataset';
import { daysAgo } from './dates';
import { createRowRng, hashSeed } from './rng';
import { documentNumber } from './order-lines';
import { salesOrderAt, salesOrderDeliveryAgeAt, salesOrderCustomerIndexAt, salesOrderStatusAt } from './sales-orders';
import { PAYMENT_TERMS_DAYS } from './terms';

/**
 * `issued`: sent, not yet due; `paid`; `overdue`: unpaid and due before `DEMO_TODAY` (computed against
 * the demo date, never the clock); `disputed`: the customer contests it, whatever the due date. An
 * archived customer only has `paid` invoices (an archived account has no open document).
 */
export type DemoInvoiceStatus = 'issued' | 'paid' | 'overdue' | 'disputed';

export interface DemoInvoice {
  /** Stable id, e.g. `inv-12`. */
  readonly id: string;
  /** `INV-<year>-<day of year><row>` (see `documentNumber`): numbers rise with the issue date, as EU invoice numbering requires. */
  readonly number: string;
  /** The `invoiced` sales order this invoice bills (a row of `makeSalesOrders`). */
  readonly salesOrderId: string;
  /** The customer of the order. */
  readonly customerId: string;
  /** The currency of the order. */
  readonly currency: DemoCurrency;
  readonly status: DemoInvoiceStatus;
  /** ISO date: the requested delivery date of the order or up to 5 days after it; never after `DEMO_TODAY`. */
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
  const orderIndex = invoicedOrderIndex(index);
  const order = salesOrderAt(orderIndex);
  const customer = makeCustomers(DEMO_REFERENCE_POOL.customers)[salesOrderCustomerIndexAt(orderIndex)]!;
  const rng = createRowRng(SEED, index);
  // Invoiced when the goods go out: on the requested delivery date or up to five days later (the order
  // is invoiced, hence already delivered: its delivery is at least 5 days back), never in the future.
  const deliveryAge = salesOrderDeliveryAgeAt(orderIndex);
  const issueAge = deliveryAge - rng.int(0, Math.min(5, deliveryAge));
  const termsDays = PAYMENT_TERMS_DAYS[customer.paymentTerms];
  const dueAge = issueAge - termsDays;
  const pastDue = dueAge > 0;
  // Paid: more often when already past the due date; disputed: a few, any time. An archived account has
  // no open document, so every invoice of an archived customer is paid.
  const roll = rng.next();
  const paid = customer.status === 'archived' || roll < (pastDue ? 0.55 : 0.25);
  const disputed = !paid && roll > (pastDue ? 0.92 : 0.96);
  const status: DemoInvoiceStatus = paid ? 'paid' : disputed ? 'disputed' : pastDue ? 'overdue' : 'issued';
  const paidAge = paid ? issueAge - rng.int(0, Math.min(issueAge, termsDays + 15)) : -1;
  const issueDate = daysAgo(issueAge);
  return Object.freeze({
    id: `inv-${index + 1}`,
    number: documentNumber('INV', issueDate, index),
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
