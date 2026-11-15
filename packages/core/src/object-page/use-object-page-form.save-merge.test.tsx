// Ticket #545: `save` decides field by field on the edits made while the save is in flight (the rule of the
// React Hook Form adapter of #507). The pure rule is in keep-edits.test.ts; here the save cycle of the hook.
import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useObjectPageForm, type UseObjectPageFormOptions, type UseObjectPageFormReturn } from './use-object-page-form';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Invoice = {
  name: string;
  amount: number;
  notes: string | null;
  supplier: { name: string; city: string };
  lines: { desc: string; price: number }[];
};

const BASE: Invoice = {
  name: 'ACME',
  amount: 10,
  notes: null,
  supplier: { name: 'rossi', city: 'turin' },
  lines: [
    { desc: 'cable', price: 1.234 },
    { desc: 'switch', price: 2 },
  ],
};

function setup(options?: Partial<UseObjectPageFormOptions<Invoice>>, strict = false) {
  return renderHook((props: UseObjectPageFormOptions<Invoice>) => useObjectPageForm<Invoice>(props), {
    initialProps: { baseline: BASE, ...options },
    wrapper: strict ? StrictMode : undefined,
  });
}

type Form = { current: UseObjectPageFormReturn<Invoice> };

/** Starts a save whose handler settles when the test decides; `sent()` is what the handler received. */
function controlledSave(result: Form) {
  let sent: Invoice | undefined;
  let resolve!: (value: Invoice | void) => void;
  let reject!: (reason: unknown) => void;
  let done!: Promise<boolean>;
  act(() => {
    done = result.current.save(
      (values) =>
        new Promise<Invoice | void>((res, rej) => {
          sent = values;
          resolve = res;
          reject = rej;
        }),
    );
  });
  return {
    sent: () => sent!,
    resolve: async (value?: Invoice) => {
      let ok = false;
      await act(async () => {
        resolve(value);
        ok = await done;
      });
      return ok;
    },
    reject: async (reason: unknown) => {
      let ok = true;
      await act(async () => {
        reject(reason);
        ok = await done;
      });
      return ok;
    },
  };
}

describe('useObjectPageForm: save decides field by field on the edits made while saving (#545)', () => {
  it('the untouched field normalized by the server takes its value (clean); the field edited meanwhile stays dirty', async () => {
    const { result } = setup();
    act(() => result.current.setValue('name', ' acme '));
    const save = controlledSave(result);
    act(() => result.current.setValue('amount', 99));
    const returned: Invoice = { ...save.sent(), name: 'Acme', amount: 10 };
    expect(await save.resolve(returned)).toBe(true);
    expect(result.current.baseline).toBe(returned);
    expect(result.current.values).toEqual({ ...returned, amount: 99 });
    expect(result.current.isDirty).toBe(true);
    // Only `amount` is dirty: bringing it back makes the form clean.
    act(() => result.current.setValue('amount', 10));
    expect(result.current.isDirty).toBe(false);
  });

  it('the field the server normalized and the user edited meanwhile keeps the typed value', async () => {
    const { result } = setup();
    act(() => result.current.setValue('name', ' acme '));
    const save = controlledSave(result);
    act(() => result.current.setValue('name', 'acme co'));
    await save.resolve({ ...save.sent(), name: 'Acme' });
    expect(result.current.values.name).toBe('acme co');
    expect(result.current.baseline.name).toBe('Acme');
    expect(result.current.isDirty).toBe(true);
  });

  it('nothing edited meanwhile: values is the returned object itself, the form is clean', async () => {
    const { result } = setup();
    act(() => result.current.setValue('name', ' acme '));
    const save = controlledSave(result);
    const returned: Invoice = { ...save.sent(), name: 'Acme' };
    await save.resolve(returned);
    expect(result.current.values).toBe(returned);
    expect(result.current.baseline).toBe(returned);
    expect(result.current.isDirty).toBe(false);
  });

  it('a field edited and brought back to the sent value counts as untouched: values is the returned object', async () => {
    const { result } = setup();
    act(() => result.current.setValue('name', ' acme '));
    const save = controlledSave(result);
    act(() => result.current.setValue('amount', 99));
    act(() => result.current.setValue('amount', 10));
    expect(result.current.values).not.toBe(save.sent());
    const returned: Invoice = { ...save.sent(), name: 'Acme' };
    await save.resolve(returned);
    expect(result.current.values).toBe(returned);
    expect(result.current.isDirty).toBe(false);
  });

  it('an edit that matches what the server returns: values is the returned object, the form is clean', async () => {
    const { result } = setup();
    act(() => result.current.setValue('name', ' acme '));
    const save = controlledSave(result);
    act(() => result.current.setValue('name', 'Acme'));
    const returned: Invoice = { ...save.sent(), name: 'Acme' };
    await save.resolve(returned);
    expect(result.current.values).toBe(returned);
    expect(result.current.isDirty).toBe(false);
  });

  it('a handler that returns nothing: the baseline is what was sent, the values the current ones (dirty)', async () => {
    const { result } = setup();
    act(() => result.current.setValue('name', 'Sent'));
    const save = controlledSave(result);
    act(() => result.current.setValue('amount', 99));
    const current = result.current.values;
    await save.resolve();
    expect(result.current.baseline).toBe(save.sent());
    expect(result.current.values).toBe(current);
    expect(result.current.isDirty).toBe(true);
  });

  it('a handler that returns a non-object: warns, the baseline is what was sent, the edits stay', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = setup();
    act(() => result.current.setValue('name', 'Sent'));
    let done!: Promise<boolean>;
    let release!: () => void;
    act(() => {
      done = result.current.save((() => new Promise<string>((res) => (release = () => res('ok')))) as unknown as () => Promise<void>);
    });
    act(() => result.current.setValue('amount', 99));
    await act(async () => {
      release();
      await done;
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(result.current.baseline).toEqual({ ...BASE, name: 'Sent' });
    expect(result.current.values).toEqual({ ...BASE, name: 'Sent', amount: 99 });
  });

  it('nested object replaced by setValue: only the leaf whose content changed is the user value', async () => {
    const { result } = setup();
    act(() => result.current.setValue('name', 'x'));
    const save = controlledSave(result);
    act(() => result.current.setValue('supplier', { ...result.current.values.supplier, city: 'milan' }));
    await save.resolve({ ...save.sent(), supplier: { name: 'Rossi', city: 'Turin' } });
    expect(result.current.values.supplier).toEqual({ name: 'Rossi', city: 'milan' });
    expect(result.current.baseline.supplier).toEqual({ name: 'Rossi', city: 'Turin' });
  });

  it('an array edited meanwhile is kept whole (same length): the price normalized on another row does not come in', async () => {
    const { result } = setup();
    act(() => result.current.setValue('name', 'x'));
    const save = controlledSave(result);
    const lines = [result.current.values.lines[0]!, { desc: 'Switch 24p', price: 2 }];
    act(() => result.current.setValue('lines', lines));
    await save.resolve({ ...save.sent(), name: 'X', lines: [{ desc: 'cable', price: 1.23 }, { desc: 'switch', price: 2 }] });
    expect(result.current.values.lines).toBe(lines);
    expect(result.current.values.name).toBe('X');
  });

  it('an array not edited meanwhile takes the server array, its reorder included', async () => {
    const { result } = setup();
    act(() => result.current.setValue('name', 'x'));
    const save = controlledSave(result);
    act(() => result.current.setValue('notes', 'typed'));
    const reordered = [BASE.lines[1]!, BASE.lines[0]!];
    await save.resolve({ ...save.sent(), lines: reordered });
    expect(result.current.values.lines).toBe(reordered);
    expect(result.current.values.notes).toBe('typed');
  });

  it("absent values are distinct: null typed and cleared to '' is an edit and keeps ''", async () => {
    const { result } = setup();
    act(() => result.current.setValue('name', ' acme '));
    const save = controlledSave(result);
    act(() => result.current.setValue('notes', 'a'));
    act(() => result.current.setValue('notes', ''));
    await save.resolve({ ...save.sent(), name: 'Acme' });
    expect(result.current.values.notes).toBe('');
    expect(result.current.values.name).toBe('Acme');
    expect(result.current.isDirty).toBe(true);
  });

  it('a permissive isEqual does not influence the field-by-field decision (deepEqual decides)', async () => {
    const { result } = setup({ isEqual: () => true });
    act(() => result.current.setValue('name', ' acme '));
    const save = controlledSave(result);
    act(() => result.current.setValue('amount', 99));
    const returned: Invoice = { ...save.sent(), name: 'Acme' };
    await save.resolve(returned);
    expect(result.current.values).not.toBe(returned);
    expect(result.current.values).toEqual({ ...returned, amount: 99 });
  });

  it('a strict isEqual does not influence it either: nothing edited gives the returned object', async () => {
    const { result } = setup({ isEqual: () => false });
    act(() => result.current.setValue('name', ' acme '));
    const save = controlledSave(result);
    act(() => result.current.setValue('supplier', { ...result.current.values.supplier }));
    const returned: Invoice = { ...save.sent(), name: 'Acme' };
    await save.resolve(returned);
    expect(result.current.values).toBe(returned);
  });

  it('a reset(x) during the save wins over the merge, also with edits made meanwhile', async () => {
    const { result } = setup();
    act(() => result.current.setValue('name', ' acme '));
    const save = controlledSave(result);
    act(() => result.current.setValue('amount', 99));
    const hydrated: Invoice = { ...BASE, name: 'Hydrated' };
    act(() => result.current.reset(hydrated));
    act(() => result.current.setValue('notes', 'after the reset'));
    await save.resolve({ ...save.sent(), name: 'Acme' });
    expect(result.current.baseline).toBe(hydrated);
    expect(result.current.values).toEqual({ ...hydrated, notes: 'after the reset' });
  });

  it('a reset() during the save, then a failure: no merge, no saveError', async () => {
    const { result } = setup();
    act(() => result.current.setValue('name', ' acme '));
    const save = controlledSave(result);
    act(() => result.current.setValue('amount', 99));
    act(() => result.current.reset());
    expect(await save.reject(new Error('offline'))).toBe(false);
    expect(result.current.values).toBe(BASE);
    expect(result.current.baseline).toBe(BASE);
    expect(result.current.saveError).toBeNull();
  });

  it('a failed save, then a second one: the edits are measured from what the second save sent', async () => {
    const { result } = setup();
    act(() => result.current.setValue('name', ' a '));
    const first = controlledSave(result);
    const before = result.current.values;
    expect(await first.reject(new Error('offline'))).toBe(false);
    expect(result.current.values).toBe(before);
    expect(result.current.baseline).toBe(BASE);
    expect(result.current.saveError).not.toBeNull();
    // Edited after the failure, before the second save: part of what the second save sends.
    act(() => result.current.setValue('amount', 20));
    const second = controlledSave(result);
    expect(second.sent()).toEqual({ ...BASE, name: ' a ', amount: 20 });
    act(() => result.current.setValue('notes', 'typed'));
    // The server normalizes both name and amount: neither was edited since the second save started.
    await second.resolve({ ...second.sent(), name: 'A', amount: 21 });
    expect(result.current.values).toEqual({ ...BASE, name: 'A', amount: 21, notes: 'typed' });
    expect(result.current.saveError).toBeNull();
  });

  it('a second save while one is in flight is still refused', async () => {
    const { result } = setup();
    const save = controlledSave(result);
    let second: boolean | undefined;
    await act(async () => {
      second = await result.current.save(async () => undefined);
    });
    expect(second).toBe(false);
    await save.resolve();
  });

  it('errors are cleared after a successful save with edits made meanwhile', async () => {
    const validate = vi.fn((v: Invoice) => (v.name === '' ? { name: 'Required' } : {}));
    const { result } = setup({ validate });
    act(() => result.current.setValue('name', ''));
    await act(async () => {
      await result.current.save(async () => undefined);
    });
    expect(result.current.fieldErrors).toEqual({ name: 'Required' });
    act(() => result.current.setValue('amount', 3));
    act(() => result.current.setValue('name', ' acme '));
    const save = controlledSave(result);
    act(() => result.current.setValue('notes', 'typed'));
    await save.resolve({ ...save.sent(), name: 'Acme' });
    expect(result.current.fieldErrors).toEqual({});
    expect(result.current.formErrors).toEqual([]);
    expect(result.current.saveError).toBeNull();
  });

  it('works the same under StrictMode', async () => {
    const { result } = setup(undefined, true);
    act(() => result.current.setValue('name', ' acme '));
    const save = controlledSave(result);
    act(() => result.current.setValue('amount', 99));
    const returned: Invoice = { ...save.sent(), name: 'Acme' };
    await save.resolve(returned);
    expect(result.current.baseline).toBe(returned);
    expect(result.current.values).toEqual({ ...returned, amount: 99 });
  });
});
