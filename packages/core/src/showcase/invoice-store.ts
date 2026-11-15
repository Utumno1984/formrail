// In-memory, deterministic "server" for the Showcase stories. One store per story mount (no module
// singleton): two stores never share state. Story-only: not exported by the package.
// Since #518 an instance of the generic record store (record-store.ts) with the invoices' data and rules.
import type { DemoInvoice } from '../internal/demo-invoices';
import {
  createRecordStore,
  RecordNetworkError,
  RecordNotFoundError,
  type RecordServerChange,
  type RecordStore,
  type RecordStoreConfig,
} from './record-store';
import { makeShowcaseInvoices } from './showcase-data';

/** One invoice line as the store keeps it: numeric quantity and unit price, an `id` unique within the invoice. */
export interface StoredLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

/** A demo invoice plus the fields only the record page edits, derived deterministically. */
export interface StoredInvoice extends DemoInvoice {
  /** ISO date (yyyy-mm-dd), 30 days after `date`. */
  dueDate: string;
  notes: string;
  /** In display order. The ids are assigned by whoever creates the line (the client) and kept as they are. */
  lineItems: StoredLineItem[];
}

/** What the client sends to create a record: everything but the identity the server assigns. */
export type InvoiceDraft = Omit<StoredInvoice, 'id' | 'number'>;

export type { DeleteOutcome, LoadOutcome, SaveOutcome } from './record-store';
export type InvoiceStoreConfig = RecordStoreConfig;

/** The `RecordNotFoundError` of the invoices (same name and message as before #518). */
export class InvoiceNotFoundError extends RecordNotFoundError {
  constructor(id: string) {
    super(id, 'invoice');
    this.name = 'InvoiceNotFoundError';
  }
}

/** The `RecordNetworkError` of the invoices (same name and message as before #518). */
export class InvoiceNetworkError extends RecordNetworkError {
  constructor(message = 'Network error') {
    super(message);
    this.name = 'InvoiceNetworkError';
  }
}

/** Story-only (#384): a record changed on the "server" by someone else (see `RecordServerChange`). */
export type ServerChange = RecordServerChange<StoredInvoice>;

/**
 * The record store of the invoices (`RecordStore`, record-store.ts): rejects with `InvoiceNotFoundError` and
 * `InvoiceNetworkError`, and every write rounds the amount and the unit prices to 2 decimals.
 */
export type InvoiceStore = RecordStore<StoredInvoice, InvoiceDraft>;

const DAY_MS = 86_400_000;
const addDays = (iso: string, days: number): string =>
  new Date(Date.parse(iso + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10);

const LINE_CATALOG: readonly { description: string; unitPrice: number }[] = [
  { description: 'Consulting (hourly)', unitPrice: 120 },
  { description: 'Site inspection', unitPrice: 85.5 },
  { description: 'Materials', unitPrice: 42.9 },
  { description: 'Transport', unitPrice: 60 },
  { description: 'Installation', unitPrice: 210 },
  { description: 'Maintenance contract', unitPrice: 300 },
];

// 1 to 4 lines per invoice, consecutive catalog entries from `index`: distinct within an invoice (up to the
// catalog length); the same index always gives the same lines.
const makeLineItems = (index: number): StoredLineItem[] =>
  Array.from({ length: (index % 4) + 1 }, (_, n) => {
    const entry = LINE_CATALOG[(index + n) % LINE_CATALOG.length]!;
    return {
      id: `li-${index + 1}-${n + 1}`,
      description: entry.description,
      quantity: ((index + n) % 5) + 1,
      unitPrice: entry.unitPrice,
    };
  });

const extend = (r: DemoInvoice, index: number): StoredInvoice => ({
  ...r,
  dueDate: addDays(r.date, 30),
  // Every third invoice has a note; the others have an empty string (never a missing field).
  notes: index % 3 === 0 ? 'Payment terms: 30 days from the invoice date.' : '',
  lineItems: makeLineItems(index),
});

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const normalizeLines = (lines: readonly StoredLineItem[]): StoredLineItem[] =>
  lines.map((l) => ({ ...l, unitPrice: round2(l.unitPrice) }));

/**
 * The "server" of the Invoices showcases. `create` assigns `id` (`inv-<n>`) and `number` (`FT-2026-<nnnn>`) from
 * the store's monotonic counter, which never reuses either, whatever happens to the records later.
 */
export function createInvoiceStore(
  seed: readonly DemoInvoice[] = makeShowcaseInvoices(),
  initial: Partial<InvoiceStoreConfig> = {},
): InvoiceStore {
  return createRecordStore<StoredInvoice, InvoiceDraft>(
    seed.map(extend),
    {
      createId: (sequence) => `inv-${sequence}`,
      fromDraft: (draft, id, sequence) => ({ ...draft, id, number: `FT-2026-${String(sequence).padStart(4, '0')}` }),
      normalize: (r) => ({ ...r, amount: round2(r.amount), lineItems: normalizeLines(r.lineItems) }),
      copy: (r) => ({ ...r, lineItems: r.lineItems.map((l) => ({ ...l })) }),
      noun: { one: 'invoice', many: 'invoices' },
      errors: {
        notFound: (id) => new InvoiceNotFoundError(id),
        network: (message) => new InvoiceNetworkError(message),
      },
    },
    initial,
  );
}

declare global {
  interface Window {
    /**
     * The store of the mounted story, for e2e assertions ("the store did not change"). Declared next to the
     * store (not in a stories file) so every module that sets it typechecks on its own, also when the Pro
     * story of #377 imports the showcase.
     */
    __ropShowcaseStore?: ReturnType<typeof createInvoiceStore>;
  }
}
