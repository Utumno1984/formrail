// Story-only: the store as the Invoices showcases see it (#151, #363, #365). A write (save, create, delete) outlives the page that started
// it (leave with "Leave anyway" while it runs), so reads wait for the writes in flight: a list or a re-opened
// record never shows (and a later save never builds on) a value older than the one the "server" is about to
// hold, and a list reopened while a Create is in flight shows the new record.
import type { InvoiceStore } from './invoice-store';

export interface ReadDelays {
  listLoadDelayMs: number;
  recordLoadDelayMs: number;
}

/** `delays` is read when a call is made (a ref's `current`): the store has ONE read delay, set just before the call. */
export function createInvoiceApi(store: InvoiceStore, delays: { readonly current: ReadDelays }): InvoiceStore {
  const writing = new Set<Promise<unknown>>();
  const settled = async () => {
    while (writing.size > 0) await Promise.allSettled([...writing]);
  };
  const track = <T>(run: Promise<T>): Promise<T> => {
    writing.add(run);
    const done = () => void writing.delete(run);
    run.then(done, done);
    return run;
  };
  return {
    ...store,
    save: (invoice) => track(store.save(invoice)),
    create: (draft) => track(store.create(draft)),
    delete: (id) => track(store.delete(id)),
    deleteMany: (ids) => track(store.deleteMany(ids)),
    list: async () => {
      await settled();
      store.configure({ loadDelayMs: delays.current.listLoadDelayMs });
      return store.list();
    },
    get: async (id) => {
      await settled();
      store.configure({ loadDelayMs: delays.current.recordLoadDelayMs });
      return store.get(id);
    },
  };
}
