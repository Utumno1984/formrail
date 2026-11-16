import { describe, expect, it } from 'vitest';
import { createRecordApi, type ReadDelays } from './record-api';
import { createRecordStore, RecordNetworkError, type RecordStoreConfig } from './record-store';

// #518: the reads of the generic API wait for the writes in flight, whatever the record type. A second,
// made-up record type with no lines.
interface Contact {
  id: string;
  name: string;
  city: string;
}

const SEED: readonly Contact[] = [
  { id: 'c-1', name: 'Ada Rivers', city: 'Lyon' },
  { id: 'c-2', name: 'Ben Okafor', city: 'Porto' },
];

const delays = (listLoadDelayMs = 0, recordLoadDelayMs = 0): { current: ReadDelays } => ({ current: { listLoadDelayMs, recordLoadDelayMs } });

function setup(initial: Partial<RecordStoreConfig> = {}, readDelays = delays()) {
  const store = createRecordStore<Contact>(SEED, { createId: (n) => `c-${n}` }, initial);
  return { store, api: createRecordApi(store, readDelays) };
}

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** A promise and whether it has settled yet (read after a `flush`). */
function watch<T>(promise: Promise<T>) {
  const state = { settled: false, promise };
  promise.then(
    () => (state.settled = true),
    () => (state.settled = true),
  );
  return state;
}

describe('createRecordApi (#518): reads wait for the writes in flight', () => {
  it('a list asked while a save is in flight waits for it and shows the saved value', async () => {
    const held = gate();
    const { api } = setup({ saveDelayMs: held.promise });
    const saving = api.save({ ...SEED[0]!, city: 'Graz' });
    const listing = watch(api.list());
    await flush();
    expect(listing.settled).toBe(false);
    held.open();
    await saving;
    expect((await listing.promise).find((c) => c.id === 'c-1')?.city).toBe('Graz');
  });

  it('a record reopened while a create is in flight waits for it; the list then shows the new record', async () => {
    const held = gate();
    const { api } = setup({ saveDelayMs: held.promise });
    const creating = api.create({ name: 'Cleo Hart', city: 'Turin' });
    const reading = watch(api.get('c-2'));
    const listing = watch(api.list());
    await flush();
    expect(reading.settled || listing.settled).toBe(false);
    held.open();
    expect(await creating).toEqual({ name: 'Cleo Hart', city: 'Turin', id: 'c-3' });
    expect(await reading.promise).toEqual(SEED[1]);
    expect((await listing.promise).map((c) => c.id)).toEqual(['c-1', 'c-2', 'c-3']);
  });

  it('a write started while a read is waiting is waited for too (the read never returns a value about to change)', async () => {
    const first = gate();
    const second = gate();
    const { store, api } = setup({ saveDelayMs: first.promise });
    const savingFirst = api.save({ ...SEED[0]!, city: 'First' });
    const reading = watch(api.get('c-1'));
    store.configure({ saveDelayMs: second.promise });
    const savingSecond = api.save({ ...SEED[0]!, city: 'Second' });
    first.open();
    await savingFirst;
    await flush();
    expect(reading.settled).toBe(false);
    second.open();
    await savingSecond;
    expect((await reading.promise).city).toBe('Second');
  });

  it('a failed write and a failed delete do not keep the reads waiting', async () => {
    const { api } = setup({ saveOutcome: 'error', deleteOutcome: 'error' });
    await expect(api.save({ ...SEED[0]!, city: 'Nowhere' })).rejects.toBeInstanceOf(RecordNetworkError);
    await expect(api.deleteMany(['c-1', 'c-2'])).rejects.toBeInstanceOf(RecordNetworkError);
    await expect(api.list()).resolves.toEqual(SEED);
  });

  it('tracking a write that fails raises no unhandled rejection, and the reads after it do not wait (#519)', async () => {
    // The API keeps every write in a set until it settles, through a callback on the write. A callback for the
    // success only (`run.then(done)`) would leave a failed write in the set and its own derived promise rejected
    // with nobody to handle it: caught here by name, never a hang (`settled()` drops what it waited for).
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => void unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const { api } = setup({ saveOutcome: 'error', deleteOutcome: 'error' });
      await expect(api.save({ ...SEED[0]!, city: 'Nowhere' })).rejects.toBeInstanceOf(RecordNetworkError);
      await expect(api.create({ name: 'Nobody', city: 'Nowhere' })).rejects.toBeInstanceOf(RecordNetworkError);
      await expect(api.delete('c-1')).rejects.toBeInstanceOf(RecordNetworkError);
      await expect(api.deleteMany(['c-2'])).rejects.toBeInstanceOf(RecordNetworkError);
      // Node reports an unhandled rejection once the microtasks of the task that produced it are done.
      await flush();
      await flush();
      expect(unhandled).toEqual([]);
      await expect(api.get('c-1')).resolves.toEqual(SEED[0]);
      await expect(api.list()).resolves.toEqual(SEED);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('a read waits for writes that start while it waits, round after round, then returns (#519)', async () => {
    const gates = [gate(), gate(), gate()];
    const { store, api } = setup({ saveDelayMs: gates[0]!.promise });
    const writes = [api.save({ ...SEED[0]!, city: 'One' })];
    const reading = watch(api.get('c-1'));
    for (const [n, next] of gates.slice(1).entries()) {
      // A new write in every round of the wait: the read waits for it too.
      store.configure({ saveDelayMs: next.promise });
      writes.push(api.save({ ...SEED[0]!, city: ['Two', 'Three'][n]! }));
      gates[n]!.open();
      await flush();
      expect(reading.settled).toBe(false);
    }
    gates[2]!.open();
    await Promise.all(writes);
    expect((await reading.promise).city).toBe('Three');
  });

  it('a list asked while a deleteMany is in flight waits for it and does not show the deleted records', async () => {
    const held = gate();
    const { api } = setup({ saveDelayMs: held.promise });
    const deleting = api.deleteMany(['c-1', 'c-2']);
    const listing = watch(api.list());
    await flush();
    expect(listing.settled).toBe(false);
    held.open();
    await deleting;
    expect(await listing.promise).toEqual([]);
  });

  it('a read waits for the writes of its own store only (one module never waits for another)', async () => {
    const held = gate();
    const contacts = setup({ saveDelayMs: held.promise });
    const others = setup();
    const saving = contacts.api.delete('c-1');
    await expect(others.api.list()).resolves.toHaveLength(2);
    const waiting = watch(contacts.api.list());
    await flush();
    expect(waiting.settled).toBe(false);
    held.open();
    await saving;
    expect((await waiting.promise).map((c) => c.id)).toEqual(['c-2']);
  });

  it('error-once per module through the API: the first read of each module fails once', async () => {
    const contacts = setup({ loadOutcome: 'error-once' });
    const others = setup({ loadOutcome: 'error-once' });
    await expect(contacts.api.get('c-1')).rejects.toBeInstanceOf(RecordNetworkError);
    await expect(others.api.list()).rejects.toBeInstanceOf(RecordNetworkError);
    await expect(contacts.api.list()).resolves.toHaveLength(2);
    await expect(others.api.get('c-2')).resolves.toEqual(SEED[1]);
  });

  it('a list takes the list delay, a record the record delay (each set on the store just before the read)', async () => {
    const readDelays = delays(40, 0);
    const { api } = setup({}, readDelays);
    const listing = watch(api.list());
    await expect(api.get('c-1')).resolves.toEqual(SEED[0]);
    expect(listing.settled).toBe(false);
    await expect(listing.promise).resolves.toHaveLength(2);
    readDelays.current = { listLoadDelayMs: 0, recordLoadDelayMs: 40 };
    const reading = watch(api.get('c-2'));
    await expect(api.list()).resolves.toHaveLength(2);
    expect(reading.settled).toBe(false);
    await expect(reading.promise).resolves.toEqual(SEED[1]);
  });

  it('a save that fails while a list and a record are waiting for it does not fail them: they return the data (#519)', async () => {
    // The wait is for the write to be OVER, not for it to succeed: the list reopened after "Leave anyway" on a
    // save that then fails shows the rows, never the save's error.
    const held = gate();
    const { api } = setup({ saveDelayMs: held.promise, saveOutcome: 'error' });
    const saving = watch(api.save({ ...SEED[0]!, city: 'Graz' }));
    const listing = watch(api.list());
    const reading = watch(api.get('c-1'));
    await flush();
    expect(listing.settled || reading.settled).toBe(false);
    held.open();
    await expect(saving.promise).rejects.toBeInstanceOf(RecordNetworkError);
    await expect(listing.promise).resolves.toEqual(SEED);
    await expect(reading.promise).resolves.toEqual(SEED[0]);
  });

  it('a read waits for EVERY write of the round, also the slow one after a write that failed at once (#519)', async () => {
    const failing = gate();
    const slow = gate();
    const { store, api } = setup({ saveDelayMs: failing.promise, saveOutcome: 'error' });
    const first = api.save({ ...SEED[0]!, city: 'Vienna' });
    const firstResult = first.catch((error: unknown) => error);
    store.configure({ saveDelayMs: slow.promise, saveOutcome: 'success' });
    const second = api.save({ ...SEED[1]!, city: 'Graz' });
    const listing = watch(api.list());
    failing.open();
    await expect(firstResult).resolves.toBeInstanceOf(RecordNetworkError);
    await flush();
    await flush();
    // The first write is over (it failed), the second is still running: the list has not been answered.
    expect(listing.settled).toBe(false);
    slow.open();
    await second;
    expect((await listing.promise).find((c) => c.id === 'c-2')?.city).toBe('Graz');
  });

  it('everything else is the store itself (snapshot, server updates, subscriptions, configure)', async () => {
    const { store, api } = setup();
    const changes: unknown[] = [];
    api.subscribe((change) => changes.push(change));
    await api.updateFromServer('c-2', (c) => ({ ...c, city: 'Oslo' }));
    expect(changes).toEqual([{ id: 'c-2', record: { ...SEED[1]!, city: 'Oslo' } }]);
    expect(api.snapshot()).toEqual(store.snapshot());
    api.configure({ loadOutcome: 'error' });
    await expect(store.get('c-1')).rejects.toBeInstanceOf(RecordNetworkError);
  });
});
