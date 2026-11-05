import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDemoInvoices } from '../internal/demo-invoices';
import { createInvoiceStore, InvoiceNetworkError, InvoiceNotFoundError } from './invoice-store';
import { SUPPLIER_EN } from './showcase-data';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createInvoiceStore', () => {
  it('starts from the demo fixtures, only the supplier names translated, fixtures untouched', async () => {
    const before = JSON.stringify(makeDemoInvoices(200));
    const store = createInvoiceStore();
    const demo = makeDemoInvoices(200);
    const all = await store.list();
    expect(all).toHaveLength(200);
    all.forEach((r, i) => {
      const { dueDate, notes, ...base } = r;
      expect(dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof notes).toBe('string');
      expect(base).toEqual({ ...demo[i], supplier: SUPPLIER_EN[demo[i]!.supplier] });
    });
    expect(JSON.stringify(makeDemoInvoices(200))).toBe(before);
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
