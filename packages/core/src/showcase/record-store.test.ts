import { describe, expect, it, vi } from 'vitest';
import { createRecordStore, RecordNetworkError, RecordNotFoundError, type RecordServerChange, type RecordStoreConfig } from './record-store';

// #518: the store is generic over the record type. A second, made-up record type with no lines (and no
// option but `createId`) proves the shared part: copies, identities, writes in flight, server updates.
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
];

const makeStore = (initial: Partial<RecordStoreConfig> = {}) =>
  createRecordStore<Task>(SEED.map((t) => ({ ...t })), { createId: (n) => `task-${n}` }, initial);

/** A save/create/delete held in flight until `open()`. */
function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/** Lets every pending promise callback run (the store's delays are promises: no timer involved). */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Whether `promise` has settled by now. */
async function isSettled(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  await flush();
  return settled;
}

describe('createRecordStore (#518): defaults, with a second record type', () => {
  it('starts from the seed, copies in and out: mutating the seed or a result never changes the store', async () => {
    const seed = SEED.map((t) => ({ ...t }));
    const store = createRecordStore<Task>(seed, { createId: (n) => `task-${n}` });
    seed[0]!.title = 'Tampered seed';
    const first = await store.get('task-1');
    expect(first.title).toBe('Draft the brief');
    first.title = 'Tampered result';
    (await store.list())[1]!.title = 'Tampered list';
    store.snapshot()[2]!.title = 'Tampered snapshot';
    expect(store.snapshot()).toEqual(SEED);
  });

  it('save writes the record as given and resolves with a copy; an unknown id is RecordNotFoundError', async () => {
    const store = makeStore();
    const given = { ...SEED[1]!, done: false };
    const saved = await store.save(given);
    expect(saved).toEqual(given);
    given.title = 'Tampered after the save';
    expect(await store.get('task-2')).toEqual({ ...SEED[1]!, done: false });
    const missing = store.save({ ...SEED[0]!, id: 'task-404' });
    await expect(missing).rejects.toBeInstanceOf(RecordNotFoundError);
    await expect(missing).rejects.toMatchObject({ name: 'RecordNotFoundError', id: 'task-404', message: 'Record "task-404" not found' });
  });

  it('create: the draft plus the id from the counter (seed length + 1), never reissued after a delete', async () => {
    const store = makeStore();
    const created = await store.create({ title: 'Write the notes', estimate: 1, done: false });
    expect(created).toEqual({ title: 'Write the notes', estimate: 1, done: false, id: 'task-4' });
    await store.delete('task-4');
    expect((await store.create({ title: 'Again', estimate: 1, done: false })).id).toBe('task-5');
    expect(store.snapshot().map((t) => t.id)).toEqual(['task-1', 'task-2', 'task-3', 'task-5']);
  });

  it('the failures say "record" by default and the given noun otherwise', async () => {
    const plain = makeStore({ saveOutcome: 'error', deleteOutcome: 'error', loadOutcome: 'error' });
    await expect(plain.get('task-1')).rejects.toMatchObject({ name: 'RecordNetworkError', message: 'Network error' });
    await expect(plain.save({ ...SEED[0]! })).rejects.toMatchObject({ message: 'Could not save the record: network error' });
    await expect(plain.create({ title: 'x', estimate: 1, done: false })).rejects.toBeInstanceOf(RecordNetworkError);
    await expect(plain.delete('task-1')).rejects.toMatchObject({ message: 'Could not delete the record: network error' });
    await expect(plain.deleteMany(['task-1', 'task-2'])).rejects.toMatchObject({ message: 'Could not delete the records: network error' });
    expect(plain.snapshot()).toEqual(SEED);

    const named = createRecordStore<Task>(SEED, { createId: (n) => `task-${n}`, noun: { one: 'task', many: 'tasks' } }, { saveOutcome: 'error', deleteOutcome: 'error' });
    await expect(named.get('task-9')).rejects.toMatchObject({ name: 'RecordNotFoundError', message: 'Task "task-9" not found' });
    await expect(named.save({ ...SEED[0]! })).rejects.toMatchObject({ message: 'Could not save the task: network error' });
    await expect(named.deleteMany(['task-1'])).rejects.toMatchObject({ message: 'Could not delete the tasks: network error' });
  });

  it('custom errors, `fromDraft` and `normalize` apply to every write (save, create, server update)', async () => {
    class TaskMissing extends RecordNotFoundError {}
    const store = createRecordStore<Task, { title: string }>(SEED, {
      createId: (n) => `t${n}`,
      fromDraft: (draft, id, sequence) => ({ ...draft, id, estimate: sequence, done: false }),
      normalize: (t) => ({ ...t, title: t.title.trim() }),
      errors: { notFound: (id) => new TaskMissing(id, 'task'), network: (message) => new RecordNetworkError(message) },
    });
    expect(await store.create({ title: '  New  ' })).toEqual({ title: 'New', id: 't4', estimate: 4, done: false });
    expect((await store.save({ ...SEED[0]!, title: ' Saved ' })).title).toBe('Saved');
    expect((await store.updateFromServer('task-2', (t) => ({ ...t, title: ' Theirs ' }))).title).toBe('Theirs');
    await expect(store.get('nope')).rejects.toBeInstanceOf(TaskMissing);
  });
});

describe('createRecordStore (#518): writes in flight', () => {
  it('a create while a save is in flight: the create gets the next id at once, the save lands later, both are kept', async () => {
    const held = gate();
    const store = makeStore({ saveDelayMs: held.promise });
    const saving = store.save({ ...SEED[0]!, done: true });
    store.configure({ saveDelayMs: 0 });
    const created = await store.create({ title: 'Ship it', estimate: 1, done: false });
    expect(created.id).toBe('task-4');
    expect(await isSettled(saving)).toBe(false);
    expect(store.snapshot().find((t) => t.id === 'task-1')?.done).toBe(false);
    held.open();
    expect(await saving).toEqual({ ...SEED[0]!, done: true });
    expect(store.snapshot()).toEqual([{ ...SEED[0]!, done: true }, SEED[1], SEED[2], created]);
    // The save did not touch the counter.
    expect((await store.create({ title: 'Next', estimate: 1, done: false })).id).toBe('task-5');
  });

  it('a record deleted on the server while its save is in flight: the save is RecordNotFoundError and writes nothing', async () => {
    const held = gate();
    const store = makeStore({ saveDelayMs: held.promise });
    const saving = store.save({ ...SEED[1]!, title: 'Mine' });
    const failed = expect(saving).rejects.toBeInstanceOf(RecordNotFoundError);
    await store.removeFromServer('task-2');
    held.open();
    await failed;
    expect(store.snapshot().map((t) => t.id)).toEqual(['task-1', 'task-3']);
  });

  it('an update landing during a save is replayed on top of it; the save resolves with what it wrote', async () => {
    const held = gate();
    const store = makeStore({ saveDelayMs: held.promise });
    const listener = vi.fn();
    store.subscribe(listener);
    const saving = store.save({ ...SEED[0]!, title: 'Mine' });
    await store.updateFromServer('task-1', (t) => ({ ...t, done: true }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith({ id: 'task-1', record: { ...SEED[0]!, done: true } });
    held.open();
    expect(await saving).toEqual({ ...SEED[0]!, title: 'Mine' });
    const both = { ...SEED[0]!, title: 'Mine', done: true };
    expect(await store.get('task-1')).toEqual(both);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith({ id: 'task-1', record: both });
  });

  it('an update of a record open with local edits (the Form Rebase path): the subscribers get the server version, the local copy is untouched', async () => {
    const store = makeStore();
    const changes: RecordServerChange<Task>[] = [];
    const unsubscribe = store.subscribe((change) => changes.push(change));
    const open = await store.get('task-3');
    const local = { ...open, title: 'My local title' };
    await store.updateFromServer('task-3', (t) => ({ ...t, estimate: 8 }));
    expect(changes).toEqual([{ id: 'task-3', record: { ...SEED[2]!, estimate: 8 } }]);
    expect(open).toEqual(SEED[2]);
    expect(local).toEqual({ ...SEED[2]!, title: 'My local title' });
    // The listener's record is a copy too.
    changes[0]!.record!.estimate = 99;
    expect(store.snapshot()[2]!.estimate).toBe(8);
    // A save of the stale copy after the update is a plain overwrite: rebasing it is the page's job, not the store's.
    await store.save(local);
    expect(store.snapshot()[2]).toEqual({ ...SEED[2]!, title: 'My local title' });
    unsubscribe();
    await store.updateFromServer('task-3', (t) => t);
    expect(changes).toHaveLength(1);
  });

  it('deleteMany with an id already removed on the server: RecordNotFoundError for it, nothing removed', async () => {
    const store = makeStore();
    const listener = vi.fn();
    store.subscribe(listener);
    await store.removeFromServer('task-2');
    expect(listener).toHaveBeenCalledWith({ id: 'task-2', record: null });
    await expect(store.deleteMany(['task-1', 'task-2', 'task-3'])).rejects.toMatchObject({ name: 'RecordNotFoundError', id: 'task-2' });
    expect(store.snapshot().map((t) => t.id)).toEqual(['task-1', 'task-3']);
  });

  it('error-once belongs to one store: the first error of one module is not used up by another', async () => {
    const tasks = makeStore({ loadOutcome: 'error-once' });
    const others = makeStore({ loadOutcome: 'error-once' });
    await expect(tasks.list()).rejects.toBeInstanceOf(RecordNetworkError);
    await expect(others.get('task-1')).rejects.toBeInstanceOf(RecordNetworkError);
    await expect(tasks.list()).resolves.toHaveLength(3);
    await expect(others.get('task-1')).resolves.toEqual(SEED[0]);
  });
});
