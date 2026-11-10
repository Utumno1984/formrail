// In-memory, deterministic "server" for the Showcase stories. One store per story mount (no module
// singleton): two stores never share state. Story-only: not exported by the package.
import type { DemoInvoice } from '../internal/demo-invoices';
import { makeShowcaseInvoices } from './showcase-data';

/** A demo invoice plus the fields only the record page edits, derived deterministically. */
export interface StoredInvoice extends DemoInvoice {
  /** ISO date (yyyy-mm-dd), 30 days after `date`. */
  dueDate: string;
  notes: string;
}

/** What the client sends to create a record: everything but the identity the server assigns. */
export type InvoiceDraft = Omit<StoredInvoice, 'id' | 'number'>;

export type SaveOutcome = 'success' | 'error';
export type DeleteOutcome = 'success' | 'error';
/** `error-once`: the first read fails, the following ones succeed (to exercise "Retry"). */
export type LoadOutcome = 'success' | 'error' | 'error-once';

export interface InvoiceStoreConfig {
  /** Delay of `get` and `list`. */
  loadDelayMs: number;
  /**
   * A number of ms, or a promise the save waits on instead of a timer: lets a test hold a save in flight
   * and release it at an exact moment, independent of CPU load. A settled promise adds no wait.
   */
  saveDelayMs: number | Promise<void>;
  saveOutcome: SaveOutcome;
  loadOutcome: LoadOutcome;
  /** `error`: `delete` rejects with `InvoiceNetworkError` and the store is unchanged (#365). */
  deleteOutcome: DeleteOutcome;
}

export class InvoiceNotFoundError extends Error {
  readonly id: string;
  constructor(id: string) {
    super(`Invoice "${id}" not found`);
    this.name = 'InvoiceNotFoundError';
    this.id = id;
  }
}

export class InvoiceNetworkError extends Error {
  constructor(message = 'Network error') {
    super(message);
    this.name = 'InvoiceNetworkError';
  }
}

export interface InvoiceStore {
  list: () => Promise<StoredInvoice[]>;
  /** Rejects with `InvoiceNotFoundError` for an unknown id. */
  get: (id: string) => Promise<StoredInvoice>;
  /**
   * Resolves with the record "as stored by the server" (the amount rounded to 2 decimals), or rejects
   * with `InvoiceNetworkError` when `saveOutcome` is `error` (the store is then unchanged).
   */
  save: (invoice: StoredInvoice) => Promise<StoredInvoice>;
  /**
   * Creates a record (#363): the "server" assigns `id` (`inv-<n>`) and `number` (`FT-2026-<nnnn>`) from a
   * monotonic counter that never reuses either, whatever happens to the records later. Same delay, outcome
   * (`InvoiceNetworkError`, store unchanged) and amount rounding as `save`.
   */
  create: (draft: InvoiceDraft) => Promise<StoredInvoice>;
  /**
   * Deletes a record (#365) after `saveDelayMs`. Rejects with `InvoiceNetworkError` when `deleteOutcome` is
   * `error` (the store is then unchanged), with `InvoiceNotFoundError` for an id that does not exist (any
   * more). The identity of a deleted record is never issued again (see `create`).
   */
  delete: (id: string) => Promise<void>;
  /**
   * Deletes several records in ONE operation (#366), all or nothing: after `saveDelayMs`, an error
   * (`deleteOutcome: 'error'` -> `InvoiceNetworkError`, or an id that does not exist -> `InvoiceNotFoundError`
   * for the first missing one) leaves the store unchanged. Repeated ids count once; no ids resolve at once.
   */
  deleteMany: (ids: readonly string[]) => Promise<void>;
  /** Changes delays/outcomes; applies to the calls made from now on. */
  configure: (patch: Partial<InvoiceStoreConfig>) => void;
  /** Synchronous read of the current state (for tests and debugging). */
  snapshot: () => StoredInvoice[];
}

const DAY_MS = 86_400_000;
const addDays = (iso: string, days: number): string =>
  new Date(Date.parse(iso + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10);

const extend = (r: DemoInvoice, index: number): StoredInvoice => ({
  ...r,
  dueDate: addDays(r.date, 30),
  // Every third invoice has a note; the others have an empty string (never a missing field).
  notes: index % 3 === 0 ? 'Payment terms: 30 days from the invoice date.' : '',
});

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const delay = (ms: number | Promise<void>): Promise<void> => {
  if (typeof ms !== 'number') return ms;
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
};

export function createInvoiceStore(
  seed: readonly DemoInvoice[] = makeShowcaseInvoices(),
  initial: Partial<InvoiceStoreConfig> = {},
): InvoiceStore {
  const config: InvoiceStoreConfig = {
    loadDelayMs: 0,
    saveDelayMs: 0,
    saveOutcome: 'success',
    loadOutcome: 'success',
    deleteOutcome: 'success',
    ...initial,
  };
  const records = new Map<string, StoredInvoice>(seed.map((r, i) => [r.id, extend(r, i)]));
  let failedOnce = false;
  // Monotonic: the next identity is one past the highest ever issued (a record removed later never frees it).
  let sequence = seed.length;
  // Copies in and out: a caller mutating what it got can never change the store.
  const copy = (r: StoredInvoice): StoredInvoice => ({ ...r });

  async function read<T>(produce: () => T): Promise<T> {
    // The config is read when the call is made, not when the delay ends.
    const { loadDelayMs, loadOutcome } = config;
    const fail = loadOutcome === 'error' || (loadOutcome === 'error-once' && !failedOnce);
    if (loadOutcome === 'error-once') failedOnce = true;
    await delay(loadDelayMs);
    if (fail) throw new InvoiceNetworkError();
    return produce();
  }

  return {
    list: () => read(() => [...records.values()].map(copy)),
    get: (id) =>
      read(() => {
        const found = records.get(id);
        if (!found) throw new InvoiceNotFoundError(id);
        return copy(found);
      }),
    async save(invoice) {
      const { saveDelayMs, saveOutcome } = config;
      await delay(saveDelayMs);
      if (saveOutcome === 'error') throw new InvoiceNetworkError('Could not save the invoice: network error');
      if (!records.has(invoice.id)) throw new InvoiceNotFoundError(invoice.id);
      const stored: StoredInvoice = { ...invoice, amount: round2(invoice.amount) };
      records.set(stored.id, stored);
      return copy(stored);
    },
    async create(draft) {
      const { saveDelayMs, saveOutcome } = config;
      await delay(saveDelayMs);
      if (saveOutcome === 'error') throw new InvoiceNetworkError('Could not save the invoice: network error');
      sequence += 1;
      const stored: StoredInvoice = {
        ...draft,
        id: `inv-${sequence}`,
        number: `FT-2026-${String(sequence).padStart(4, '0')}`,
        amount: round2(draft.amount),
      };
      records.set(stored.id, stored);
      return copy(stored);
    },
    async delete(id) {
      const { saveDelayMs, deleteOutcome } = config;
      await delay(saveDelayMs);
      if (deleteOutcome === 'error') throw new InvoiceNetworkError('Could not delete the invoice: network error');
      if (!records.delete(id)) throw new InvoiceNotFoundError(id);
    },
    async deleteMany(ids) {
      const unique = [...new Set(ids)];
      if (unique.length === 0) return;
      const { saveDelayMs, deleteOutcome } = config;
      await delay(saveDelayMs);
      if (deleteOutcome === 'error') throw new InvoiceNetworkError('Could not delete the invoices: network error');
      // Checked as a whole BEFORE removing anything: all or nothing.
      const missing = unique.find((id) => !records.has(id));
      if (missing !== undefined) throw new InvoiceNotFoundError(missing);
      for (const id of unique) records.delete(id);
    },
    configure: (patch) => {
      Object.assign(config, patch);
    },
    snapshot: () => [...records.values()].map(copy),
  };
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
