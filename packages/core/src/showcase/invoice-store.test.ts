import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDemoInvoices } from '../internal/demo-invoices';
import { createInvoiceStore, InvoiceNetworkError, InvoiceNotFoundError, type ServerChange } from './invoice-store';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createInvoiceStore', () => {
  it('starts from the demo fixtures, fixtures untouched', async () => {
    const before = JSON.stringify(makeDemoInvoices(200));
    const store = createInvoiceStore();
    const demo = makeDemoInvoices(200);
    const all = await store.list();
    expect(all).toHaveLength(200);
    all.forEach((r, i) => {
      const { dueDate, notes, lineItems, ...base } = r;
      expect(dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof notes).toBe('string');
      expect(lineItems.length).toBeGreaterThanOrEqual(1);
      expect(lineItems.length).toBeLessThanOrEqual(4);
      expect(base).toEqual(demo[i]);
    });
    expect(JSON.stringify(makeDemoInvoices(200))).toBe(before);
  });

  it('gives every invoice distinct catalog entries on its lines (description and unit price)', async () => {
    const all = await createInvoiceStore().list();
    all.forEach((r) => {
      const descriptions = r.lineItems.map((l) => l.description);
      expect(new Set(descriptions).size, r.id).toBe(descriptions.length);
    });
  });

  it('derives dueDate (30 days later) and notes deterministically; notes are never missing', async () => {
    const a = await createInvoiceStore().get('inv-1');
    const b = await createInvoiceStore().get('inv-1');
    expect(a).toEqual(b);
    const diff = Date.parse(a.dueDate) - Date.parse(a.date);
    expect(diff).toBe(30 * 86_400_000);
    const notes = (await createInvoiceStore().list()).map((r) => r.notes);
    expect(notes.every((n) => typeof n === 'string')).toBe(true);
    expect(notes).toContain('');
  });

  it('get resolves after loadDelayMs, not before', async () => {
    const store = createInvoiceStore(undefined, { loadDelayMs: 500 });
    const spy = vi.fn();
    void store.get('inv-1').then(spy);
    await vi.advanceTimersByTimeAsync(499);
    expect(spy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('get of an unknown id rejects with a recognizable not-found error', async () => {
    const store = createInvoiceStore();
    await expect(store.get('nope')).rejects.toBeInstanceOf(InvoiceNotFoundError);
    await expect(store.get('nope')).rejects.toThrow(/not found/);
  });

  it('save resolves after saveDelayMs with the amount normalized to 2 decimals, and persists it', async () => {
    const store = createInvoiceStore(undefined, { saveDelayMs: 300 });
    const record = await store.get('inv-1');
    const spy = vi.fn();
    const pending = store.save({ ...record, amount: 12.3456 }).then(spy);
    await vi.advanceTimersByTimeAsync(299);
    expect(spy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 'inv-1', amount: 12.35 }));
    expect((await store.get('inv-1')).amount).toBe(12.35);
  });

  it('a promise as saveDelayMs holds the save until it resolves, whatever the clock does', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = createInvoiceStore(undefined, { saveDelayMs: gate });
    const record = await store.get('inv-1');
    const spy = vi.fn();
    const pending = store.save({ ...record, amount: 7 }).then(spy);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(spy).not.toHaveBeenCalled();
    expect(store.snapshot().find((r) => r.id === 'inv-1')?.amount).toBe(record.amount);
    release();
    await pending;
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 'inv-1', amount: 7 }));
  });

  it('save with outcome error rejects and leaves the store unchanged', async () => {
    const store = createInvoiceStore(undefined, { saveOutcome: 'error' });
    const record = await store.get('inv-1');
    await expect(store.save({ ...record, supplier: 'Changed' })).rejects.toBeInstanceOf(InvoiceNetworkError);
    expect((await store.get('inv-1')).supplier).toBe(record.supplier);
    store.configure({ saveOutcome: 'success' });
    await store.save({ ...record, supplier: 'Changed' });
    expect((await store.get('inv-1')).supplier).toBe('Changed');
  });

  it('save of an unknown id rejects with not-found', async () => {
    const store = createInvoiceStore();
    const record = await store.get('inv-1');
    await expect(store.save({ ...record, id: 'nope' })).rejects.toBeInstanceOf(InvoiceNotFoundError);
  });

  it('create assigns increasing ids and numbers, never reusing one, and rounds the amount to 2 decimals (#363)', async () => {
    const store = createInvoiceStore();
    const draft = { supplier: 'Acme', status: 'pending' as const, amount: 1295.9, date: '2026-11-09', dueDate: '2026-12-09', notes: '', lineItems: [] };
    const a = await store.create(draft);
    const b = await store.create({ ...draft, amount: 12.3456 });
    expect([a.id, a.number]).toEqual(['inv-201', 'FT-2026-0201']);
    expect([b.id, b.number]).toEqual(['inv-202', 'FT-2026-0202']);
    expect(b.amount).toBe(12.35);
    expect(store.snapshot()).toHaveLength(202);
    expect(await store.get('inv-201')).toEqual(a);
    // A failed create consumes no identity and leaves the store unchanged.
    store.configure({ saveOutcome: 'error' });
    await expect(store.create(draft)).rejects.toBeInstanceOf(InvoiceNetworkError);
    expect(store.snapshot()).toHaveLength(202);
    store.configure({ saveOutcome: 'success' });
    expect((await store.create(draft)).id).toBe('inv-203');
  });

  it('create honours saveDelayMs like save', async () => {
    const store = createInvoiceStore(undefined, { saveDelayMs: 300 });
    const spy = vi.fn();
    const draft = { supplier: 'Acme', status: 'pending' as const, amount: 5, date: '2026-11-09', dueDate: '2026-12-09', notes: '', lineItems: [] };
    const pending = store.create(draft).then(spy);
    await vi.advanceTimersByTimeAsync(299);
    expect(spy).not.toHaveBeenCalled();
    expect(store.snapshot()).toHaveLength(200);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('loadOutcome error rejects every read; error-once only the first', async () => {
    const always = createInvoiceStore(undefined, { loadOutcome: 'error' });
    await expect(always.get('inv-1')).rejects.toBeInstanceOf(InvoiceNetworkError);
    await expect(always.get('inv-1')).rejects.toBeInstanceOf(InvoiceNetworkError);
    const once = createInvoiceStore(undefined, { loadOutcome: 'error-once' });
    await expect(once.get('inv-1')).rejects.toBeInstanceOf(InvoiceNetworkError);
    await expect(once.get('inv-1')).resolves.toMatchObject({ id: 'inv-1' });
  });

  it('configure applies to the calls made afterwards', async () => {
    const store = createInvoiceStore();
    store.configure({ loadDelayMs: 200 });
    const spy = vi.fn();
    void store.get('inv-1').then(spy);
    await vi.advanceTimersByTimeAsync(199);
    expect(spy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(spy).toHaveBeenCalled();
  });

  it('two stores do not share state; a returned record cannot mutate the store', async () => {
    const a = createInvoiceStore();
    const b = createInvoiceStore();
    const record = await a.get('inv-1');
    await a.save({ ...record, notes: 'only in a' });
    expect((await b.get('inv-1')).notes).toBe(record.notes);
    const got = await a.get('inv-1');
    got.notes = 'mutated by the caller';
    expect((await a.get('inv-1')).notes).toBe('only in a');
    expect(a.snapshot().find((r) => r.id === 'inv-1')!.notes).toBe('only in a');
  });
});

describe('createInvoiceStore: delete (#365)', () => {
  const draft = { supplier: 'Acme', status: 'pending' as const, amount: 5, date: '2026-11-09', dueDate: '2026-12-09', notes: '', lineItems: [] };

  it('removes the record after saveDelayMs; a second delete of the same id is InvoiceNotFoundError', async () => {
    const store = createInvoiceStore(undefined, { saveDelayMs: 300 });
    const spy = vi.fn();
    const pending = store.delete('inv-2').then(spy);
    await vi.advanceTimersByTimeAsync(299);
    expect(spy).not.toHaveBeenCalled();
    expect(store.snapshot()).toHaveLength(200);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(spy).toHaveBeenCalledTimes(1);
    expect(store.snapshot()).toHaveLength(199);
    expect(store.snapshot().some((r) => r.id === 'inv-2')).toBe(false);
    const again = store.delete('inv-2');
    const check = expect(again).rejects.toBeInstanceOf(InvoiceNotFoundError);
    await vi.advanceTimersByTimeAsync(300);
    await check;
    const get = store.get('inv-2');
    await expect(get).rejects.toBeInstanceOf(InvoiceNotFoundError);
  });

  it('deleteOutcome error rejects with InvoiceNetworkError and leaves the store unchanged; read when the call is made', async () => {
    const store = createInvoiceStore(undefined, { deleteOutcome: 'error' });
    const before = JSON.stringify(store.snapshot());
    await expect(store.delete('inv-1')).rejects.toBeInstanceOf(InvoiceNetworkError);
    expect(JSON.stringify(store.snapshot())).toBe(before);
    // Configured while the delete waits: the outcome of the call already made does not change.
    store.configure({ deleteOutcome: 'success', saveDelayMs: 100 });
    const ok = store.delete('inv-1');
    store.configure({ deleteOutcome: 'error' });
    await vi.advanceTimersByTimeAsync(100);
    await expect(ok).resolves.toBeUndefined();
    expect(store.snapshot()).toHaveLength(199);
  });

  it('a record created after a delete never reuses the identity of the deleted one (nor of any other)', async () => {
    const store = createInvoiceStore();
    const first = await store.create(draft); // inv-201
    await store.delete(first.id);
    await store.delete('inv-200');
    const next = await store.create(draft);
    expect(next.id).toBe('inv-202');
    expect(next.number).toBe('FT-2026-0202');
    const ids = store.snapshot().map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(first.id);
  });
});

describe('createInvoiceStore: deleteMany (#366)', () => {
  it('removes every id in one operation after saveDelayMs (nothing before); repeated ids count once', async () => {
    const store = createInvoiceStore(undefined, { saveDelayMs: 300 });
    const pending = store.deleteMany(['inv-2', 'inv-5', 'inv-2', 'inv-9']);
    await vi.advanceTimersByTimeAsync(299);
    expect(store.snapshot()).toHaveLength(200);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    const ids = store.snapshot().map((r) => r.id);
    expect(ids).toHaveLength(197);
    for (const gone of ['inv-2', 'inv-5', 'inv-9']) expect(ids).not.toContain(gone);
  });

  it('deleteOutcome error rejects with InvoiceNetworkError and leaves the store unchanged', async () => {
    const store = createInvoiceStore(undefined, { deleteOutcome: 'error' });
    const before = JSON.stringify(store.snapshot());
    await expect(store.deleteMany(['inv-1', 'inv-2'])).rejects.toBeInstanceOf(InvoiceNetworkError);
    expect(JSON.stringify(store.snapshot())).toBe(before);
  });

  it('an unknown id makes the whole call fail with InvoiceNotFoundError and removes nothing (all or nothing)', async () => {
    const store = createInvoiceStore();
    const before = JSON.stringify(store.snapshot());
    await expect(store.deleteMany(['inv-1', 'inv-999', 'inv-2'])).rejects.toMatchObject({
      name: 'InvoiceNotFoundError',
      id: 'inv-999',
    });
    expect(JSON.stringify(store.snapshot())).toBe(before);
  });

  it('an id already deleted by a single delete is "not found" for the group', async () => {
    const store = createInvoiceStore();
    await store.delete('inv-3');
    await expect(store.deleteMany(['inv-3', 'inv-4'])).rejects.toBeInstanceOf(InvoiceNotFoundError);
    expect(store.snapshot().some((r) => r.id === 'inv-4')).toBe(true);
  });

  it('no ids: resolves at once and changes nothing', async () => {
    const store = createInvoiceStore(undefined, { saveDelayMs: 10_000, deleteOutcome: 'error' });
    await expect(store.deleteMany([])).resolves.toBeUndefined();
    expect(store.snapshot()).toHaveLength(200);
  });
});

describe('createInvoiceStore: line items (#378)', () => {
  it('gives every invoice 1 to 4 deterministic lines with unique ids and numeric quantity and price', async () => {
    const all = await createInvoiceStore().list();
    const again = await createInvoiceStore().list();
    expect(all.map((r) => r.lineItems)).toEqual(again.map((r) => r.lineItems));
    for (const r of all) {
      expect(r.lineItems.length).toBeGreaterThanOrEqual(1);
      expect(r.lineItems.length).toBeLessThanOrEqual(4);
      expect(new Set(r.lineItems.map((l) => l.id)).size).toBe(r.lineItems.length);
      for (const l of r.lineItems) {
        expect(Number.isInteger(l.quantity) && l.quantity > 0).toBe(true);
        expect(l.unitPrice).toBeGreaterThan(0);
        expect(l.description).not.toBe('');
      }
    }
  });

  it('save keeps the lines in the order sent, keeps client ids as they are and rounds the unit price to 2 decimals', async () => {
    const store = createInvoiceStore();
    const record = await store.get('inv-3');
    const [a, b] = record.lineItems as [(typeof record.lineItems)[number], (typeof record.lineItems)[number]];
    const extra = { id: 'new-7', description: 'Extra', quantity: 2, unitPrice: 150.456 };
    const saved = await store.save({ ...record, lineItems: [b, extra, a] });
    expect(saved.lineItems).toEqual([b, { ...extra, unitPrice: 150.46 }, a]);
    expect((await store.get('inv-3')).lineItems).toEqual(saved.lineItems);
  });

  it('what a caller does to the lines it got never changes the store', async () => {
    const store = createInvoiceStore();
    const first = await store.get('inv-3');
    first.lineItems[0]!.description = 'tampered';
    first.lineItems.pop();
    const second = await store.get('inv-3');
    expect(second.lineItems).toHaveLength(3);
    expect(second.lineItems[0]!.description).not.toBe('tampered');
  });

  it('create stores the lines of the draft, normalized; a draft without lines creates a record without lines', async () => {
    const store = createInvoiceStore();
    const draft = { supplier: 'Acme', status: 'pending' as const, amount: 5, date: '2026-11-09', dueDate: '2026-12-09', notes: '' };
    expect((await store.create({ ...draft, lineItems: [] })).lineItems).toEqual([]);
    const row = { id: 'new-1', description: 'Row', quantity: 1, unitPrice: 9.999 };
    const withLines = await store.create({ ...draft, lineItems: [row] });
    expect(withLines.lineItems).toEqual([{ ...row, unitPrice: 10 }]);
  });
});

describe('server updates (story-only, #384)', () => {
  it('updateFromServer changes the record after the delay, normalized, and tells the subscribers once', async () => {
    const store = createInvoiceStore();
    const record = await store.get('inv-1');
    const listener = vi.fn();
    store.subscribe(listener);
    const pending = store.updateFromServer('inv-1', (r) => ({ ...r, status: 'approved', amount: 10.005 }), 500);
    await vi.advanceTimersByTimeAsync(499);
    expect(listener).not.toHaveBeenCalled();
    expect(store.snapshot().find((r) => r.id === 'inv-1')).toEqual(record);
    await vi.advanceTimersByTimeAsync(1);
    const updated = await pending;
    expect(updated).toEqual({ ...record, status: 'approved', amount: 10.01 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ id: 'inv-1', record: updated });
    expect(await store.get('inv-1')).toEqual(updated);
  });

  it('the change gets a copy: mutating it changes nothing but what it returns; listeners get copies too', async () => {
    const store = createInvoiceStore();
    await store.updateFromServer('inv-3', (r) => {
      r.lineItems[0]!.quantity = 99;
      return { ...r, notes: 'From the server' };
    });
    const stored = await store.get('inv-3');
    expect(stored.notes).toBe('From the server');
    expect(stored.lineItems[0]!.quantity).toBe(99);
    const listener = vi.fn();
    store.subscribe(listener);
    await store.updateFromServer('inv-3', (r) => r);
    (listener.mock.calls[0]![0] as ServerChange).record!.notes = 'tampered';
    expect((await store.get('inv-3')).notes).toBe('From the server');
  });

  it('unsubscribe stops the notifications; an unknown id rejects with not-found and notifies nobody', async () => {
    const store = createInvoiceStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await expect(store.updateFromServer('nope', (r) => r)).rejects.toBeInstanceOf(InvoiceNotFoundError);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
    await store.updateFromServer('inv-1', (r) => ({ ...r, notes: 'x' }));
    expect(listener).not.toHaveBeenCalled();
  });

  it('removeFromServer deletes the record after the delay and notifies `record: null`', async () => {
    const store = createInvoiceStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const pending = store.removeFromServer('inv-2', 200);
    await vi.advanceTimersByTimeAsync(199);
    expect(listener).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(listener).toHaveBeenCalledWith({ id: 'inv-2', record: null });
    await expect(store.get('inv-2')).rejects.toBeInstanceOf(InvoiceNotFoundError);
    await expect(store.removeFromServer('inv-2')).rejects.toBeInstanceOf(InvoiceNotFoundError);
  });

  it('an update landing during a save is replayed on top of it: the save resolves with what it wrote, the store and the listeners get both', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = createInvoiceStore(undefined, { saveDelayMs: gate });
    const record = await store.get('inv-1');
    const listener = vi.fn();
    store.subscribe(listener);
    const saving = store.save({ ...record, notes: 'Mine' });
    const update = await store.updateFromServer('inv-1', (r) => ({ ...r, status: 'rejected' }));
    // At once: the update is stored on the record the server holds (the save has not answered yet).
    expect(update).toEqual({ ...record, status: 'rejected' });
    expect(listener).toHaveBeenCalledTimes(1);
    release();
    const saved = await saving;
    expect(saved).toEqual({ ...record, notes: 'Mine' });
    const both = { ...record, notes: 'Mine', status: 'rejected' };
    expect(await store.get('inv-1')).toEqual(both);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith({ id: 'inv-1', record: both });
  });

  it('a failing save keeps the update that landed during it, and notifies nothing more', async () => {
    const store = createInvoiceStore(undefined, { saveDelayMs: 100, saveOutcome: 'error' });
    const record = await store.get('inv-1');
    const listener = vi.fn();
    store.subscribe(listener);
    const saving = store.save({ ...record, notes: 'Mine' });
    const failed = expect(saving).rejects.toBeInstanceOf(InvoiceNetworkError);
    await store.updateFromServer('inv-1', (r) => ({ ...r, status: 'rejected' }));
    await vi.advanceTimersByTimeAsync(100);
    await failed;
    expect(await store.get('inv-1')).toEqual({ ...record, status: 'rejected' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a save notifies nobody by itself, and an update that landed before it started is not replayed (the Free showcase never sees a notification)', async () => {
    const store = createInvoiceStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const record = await store.get('inv-1');
    await store.save({ ...record, notes: 'Mine' });
    expect(listener).not.toHaveBeenCalled();
    await store.updateFromServer('inv-1', (r) => ({ ...r, status: 'rejected' }));
    // The client still sends its stale copy: a plain overwrite, as before #384.
    const later = await store.save({ ...record, notes: 'Again' });
    expect(later.status).toBe(record.status);
    expect((await store.get('inv-1')).status).toBe(record.status);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
