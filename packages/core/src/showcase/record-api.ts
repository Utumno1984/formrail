// Story-only: a record store as the record-editing showcases see it (#151, #363, #365; generic over the record
// type since #518). A write (save, create, delete) outlives the page that started it (leave with "Leave anyway"
// while it runs), so reads wait for the writes in flight: a list or a re-opened record never shows (and a later
// save never builds on) a value older than the one the "server" is about to hold, and a list reopened while a
// Create is in flight shows the new record. One API per store: a read waits for the writes of ITS store only.
import type { RecordStore } from './record-store';

export interface ReadDelays {
  listLoadDelayMs: number;
  recordLoadDelayMs: number;
}

/** `delays` is read when a call is made (a ref's `current`): the store has ONE read delay, set just before the call. */
export function createRecordApi<T extends { id: string }, D>(
  store: RecordStore<T, D>,
  delays: { readonly current: ReadDelays },
): RecordStore<T, D> {
  const writing = new Set<Promise<unknown>>();
  const settled = async () => {
    while (writing.size > 0) await Promise.allSettled([...writing]);
  };
  const track = <R>(run: Promise<R>): Promise<R> => {
    writing.add(run);
    const done = () => void writing.delete(run);
    run.then(done, done);
    return run;
  };
  return {
    ...store,
    save: (record) => track(store.save(record)),
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
