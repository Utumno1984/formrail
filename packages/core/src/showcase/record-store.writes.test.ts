import { describe, expect, it, vi } from 'vitest';
import { createRecordStore, RecordNetworkError, RecordNotFoundError, type RecordServerChange, type RecordStoreConfig } from './record-store';

// #527: the store cases of the invoices' store tests (invoice-store.test.ts, removed with the invoices' showcase) that
// `record-store.test.ts` did not cover: delete and deleteMany, a create held by its delay, and the server updates around
// a save. Same made-up record type as `record-store.test.ts`; the delays are promises (no timer, no clock).
interface Task {
  id: string;
  title: string;
  estimate: number;
  done: boolean;
}

const SEED: readonly Task[] = [
  { id: 'task-1', title: 'Draft the brief', estimate: 2, done: false },
  { id: 'task-2', title: 'Review the layout', estimate: 3, done: true },
  { id: 'task-3', title: 'Plan the release', estimate: 5, done: false },
  { id: 'task-4', title: 'Ship it', estimate: 1, done: false },
];

const makeStore = (initial: Partial<RecordStoreConfig> = {}, normalize?: (t: Task) => Task) =>
  createRecordStore<Task>(SEED.map((t) => ({ ...t })), { createId: (n) => `task-${n}`, ...(normalize ? { normalize } : {}) }, initial);

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
async function isSettled(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  await flush();
  return settled;
}
const ids = (store: ReturnType<typeof makeStore>) => store.snapshot().map((t) => t.id);

describe('createRecordStore: delete (#527, from the invoices #365)', () => {
  it('removes the record when its delay is over; a second delete of the same id is RecordNotFoundError', async () => {
    const held = gate();
    const store = makeStore({ saveDelayMs: held.promise });
    const deleting = store.delete('task-2');
    expect(await isSettled(deleting)).toBe(false);
    expect(ids(store)).toEqual(['task-1', 'task-2', 'task-3', 'task-4']);
    held.open();
    await deleting;
    expect(ids(store)).toEqual(['task-1', 'task-3', 'task-4']);
    store.configure({ saveDelayMs: 0 });
    await expect(store.delete('task-2')).rejects.toBeInstanceOf(RecordNotFoundError);
    await expect(store.get('task-2')).rejects.toBeInstanceOf(RecordNotFoundError);
  });

  it('deleteOutcome error rejects with RecordNetworkError and leaves the store unchanged; read when the call is made', async () => {
    const store = makeStore({ deleteOutcome: 'error' });
    const before = JSON.stringify(store.snapshot());
    await expect(store.delete('task-1')).rejects.toBeInstanceOf(RecordNetworkError);
    expect(JSON.stringify(store.snapshot())).toBe(before);
    // Configured while the delete waits: the outcome of the call already made does not change.
    const held = gate();
    store.configure({ deleteOutcome: 'success', saveDelayMs: held.promise });
    const ok = store.delete('task-1');
    store.configure({ deleteOutcome: 'error' });
    held.open();
    await expect(ok).resolves.toBeUndefined();
    expect(ids(store)).toEqual(['task-2', 'task-3', 'task-4']);
  });

  it('a record created after a delete never reuses an identity, the deleted one included', async () => {
    const store = makeStore();
    const first = await store.create({ title: 'A', estimate: 1, done: false } as Task);
    await store.delete(first.id);
    await store.delete('task-4');
    const next = await store.create({ title: 'B', estimate: 1, done: false } as Task);
    expect(next.id).toBe('task-6');
    expect(new Set(ids(store)).size).toBe(ids(store).length);
    expect(ids(store)).not.toContain(first.id);
  });
});

describe('createRecordStore: deleteMany (#527, from the invoices #366)', () => {
  it('removes every id in one operation when its delay is over (nothing before); repeated ids count once', async () => {
    const held = gate();
    const store = makeStore({ saveDelayMs: held.promise });
    const deleting = store.deleteMany(['task-2', 'task-3', 'task-2', 'task-1']);
    expect(await isSettled(deleting)).toBe(false);
    expect(ids(store)).toHaveLength(4);
    held.open();
    await deleting;
    expect(ids(store)).toEqual(['task-4']);
  });

  it('deleteOutcome error rejects with RecordNetworkError and leaves the store unchanged', async () => {
    const store = makeStore({ deleteOutcome: 'error' });
    const before = JSON.stringify(store.snapshot());
    await expect(store.deleteMany(['task-1', 'task-2'])).rejects.toBeInstanceOf(RecordNetworkError);
    expect(JSON.stringify(store.snapshot())).toBe(before);
  });

  it('an unknown id makes the whole call fail with RecordNotFoundError and removes nothing (all or nothing)', async () => {
    const store = makeStore();
    const before = JSON.stringify(store.snapshot());
    await expect(store.deleteMany(['task-1', 'task-999', 'task-2'])).rejects.toMatchObject({ name: 'RecordNotFoundError', id: 'task-999' });
    expect(JSON.stringify(store.snapshot())).toBe(before);
  });

  it('an id already deleted by a single delete is "not found" for the group', async () => {
    const store = makeStore();
    await store.delete('task-3');
    await expect(store.deleteMany(['task-3', 'task-4'])).rejects.toBeInstanceOf(RecordNotFoundError);
    expect(ids(store)).toContain('task-4');
  });

  it('no ids: resolves at once and changes nothing, whatever the delay and the outcome', async () => {
    const store = makeStore({ saveDelayMs: gate().promise, deleteOutcome: 'error' });
    await expect(store.deleteMany([])).resolves.toBeUndefined();
    expect(ids(store)).toHaveLength(4);
  });
});

describe('createRecordStore: a create honours the save delay (#527, from the invoices #363)', () => {
  it('create waits for saveDelayMs like save: nothing is stored before', async () => {
    const held = gate();
    const store = makeStore({ saveDelayMs: held.promise });
    const creating = store.create({ title: 'Later', estimate: 1, done: false } as Task);
    expect(await isSettled(creating)).toBe(false);
    expect(ids(store)).toHaveLength(4);
    held.open();
    expect((await creating).title).toBe('Later');
    expect(ids(store)).toHaveLength(5);
  });
});

describe('createRecordStore: server updates around a save (#527, from the invoices #384)', () => {
  it('updateFromServer changes the record when its delay is over, normalized, and tells the subscribers once', async () => {
    const held = gate();
    const store = makeStore({}, (t) => ({ ...t, estimate: Math.round(t.estimate * 100) / 100 }));
    const record = await store.get('task-1');
    const listener = vi.fn();
    store.subscribe(listener);
    const pending = store.updateFromServer('task-1', (t) => ({ ...t, done: true, estimate: 10.005 }), held.promise);
    expect(await isSettled(pending)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(store.snapshot()[0]).toEqual(record);
    held.open();
    const updated = await pending;
    expect(updated).toEqual({ ...record, done: true, estimate: 10.01 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ id: 'task-1', record: updated });
    expect(await store.get('task-1')).toEqual(updated);
  });

  it('the change function gets a copy: mutating it changes nothing but what it returns', async () => {
    const store = makeStore();
    await store.updateFromServer('task-3', (t) => {
      t.estimate = 99;
      return { ...t, title: 'From the server' };
    });
    const stored = await store.get('task-3');
    expect(stored.title).toBe('From the server');
    expect(stored.estimate).toBe(99);
    const listener = vi.fn();
    store.subscribe(listener);
    await store.updateFromServer('task-3', (t) => t);
    (listener.mock.calls[0]![0] as RecordServerChange<Task>).record!.title = 'tampered';
    expect((await store.get('task-3')).title).toBe('From the server');
  });

  it('an unknown id rejects with not-found and notifies nobody; after unsubscribe nobody is told', async () => {
    const store = makeStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await expect(store.updateFromServer('nope', (t) => t)).rejects.toBeInstanceOf(RecordNotFoundError);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
    await store.updateFromServer('task-1', (t) => ({ ...t, title: 'x' }));
    expect(listener).not.toHaveBeenCalled();
  });

  it('removeFromServer deletes the record when its delay is over and notifies `record: null`; a second one is not-found', async () => {
    const held = gate();
    const store = makeStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const pending = store.removeFromServer('task-2', held.promise);
    expect(await isSettled(pending)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    held.open();
    await pending;
    expect(listener).toHaveBeenCalledWith({ id: 'task-2', record: null });
    await expect(store.get('task-2')).rejects.toBeInstanceOf(RecordNotFoundError);
    await expect(store.removeFromServer('task-2')).rejects.toBeInstanceOf(RecordNotFoundError);
  });

  it('the replayed update is normalized like a save', async () => {
    const held = gate();
    const store = makeStore({ saveDelayMs: held.promise }, (t) => ({ ...t, estimate: Math.round(t.estimate * 100) / 100 }));
    const record = await store.get('task-1');
    const listener = vi.fn();
    store.subscribe(listener);
    const saving = store.save({ ...record, title: 'Mine' });
    await store.updateFromServer('task-1', (t) => ({ ...t, estimate: 10.005 }));
    held.open();
    await saving;
    expect((await store.get('task-1')).estimate).toBe(10.01);
    expect((listener.mock.lastCall![0] as RecordServerChange<Task>).record!.estimate).toBe(10.01);
  });

  it('two saves of the same record in flight: an update landing after the first settled is replayed on the second', async () => {
    const first = gate();
    const second = gate();
    const store = makeStore({ saveDelayMs: first.promise });
    const record = await store.get('task-1');
    const savingFirst = store.save({ ...record, title: 'First' });
    store.configure({ saveDelayMs: second.promise });
    const savingSecond = store.save({ ...record, title: 'Second' });
    first.open();
    await savingFirst;
    await store.updateFromServer('task-1', (t) => ({ ...t, done: true }));
    second.open();
    expect(await savingSecond).toEqual({ ...record, title: 'Second' });
    expect(await store.get('task-1')).toEqual({ ...record, title: 'Second', done: true });
  });

  it('a failing save keeps the update that landed during it, and notifies nothing more', async () => {
    const held = gate();
    const store = makeStore({ saveDelayMs: held.promise, saveOutcome: 'error' });
    const record = await store.get('task-1');
    const listener = vi.fn();
    store.subscribe(listener);
    const saving = store.save({ ...record, title: 'Mine' });
    const failed = expect(saving).rejects.toBeInstanceOf(RecordNetworkError);
    await store.updateFromServer('task-1', (t) => ({ ...t, done: true }));
    held.open();
    await failed;
    expect(await store.get('task-1')).toEqual({ ...record, done: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a save notifies nobody by itself, and an update that landed before it started is not replayed', async () => {
    const store = makeStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const record = await store.get('task-1');
    await store.save({ ...record, title: 'Mine' });
    expect(listener).not.toHaveBeenCalled();
    await store.updateFromServer('task-1', (t) => ({ ...t, done: true }));
    // The client still sends its stale copy: a plain overwrite, the store does not rebase it.
    const later = await store.save({ ...record, title: 'Again' });
    expect(later.done).toBe(record.done);
    expect((await store.get('task-1')).done).toBe(record.done);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
