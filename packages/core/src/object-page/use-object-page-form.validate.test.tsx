import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useObjectPageForm, type UseObjectPageFormOptions } from './use-object-page-form';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Invoice = { name: string; amount: number };
const BASE: Invoice = { name: 'ACME', amount: 10 };

function setup(options?: Partial<UseObjectPageFormOptions<Invoice>>) {
  return renderHook((props: UseObjectPageFormOptions<Invoice>) => useObjectPageForm<Invoice>(props), {
    initialProps: { baseline: BASE, ...options } as UseObjectPageFormOptions<Invoice>,
  });
}

type Result = ReturnType<typeof setup>['result'];

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const requireName = (v: Invoice) => (v.name === '' ? { name: 'Required' } : {});

async function failValidation(result: Result) {
  act(() => result.current.setValue('name', ''));
  await act(async () => {
    await result.current.save(async () => undefined);
  });
  expect(result.current.fieldErrors).toEqual({ name: 'Required' });
}

describe('useObjectPageForm: validate / fieldErrors', () => {
  it('without validate, fieldErrors is always {} and save behaves as before', async () => {
    const { result } = setup();
    expect(result.current.fieldErrors).toEqual({});
    const handler = vi.fn(async () => undefined);
    await act(async () => {
      expect(await result.current.save(handler)).toBe(true);
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.current.fieldErrors).toEqual({});
  });

  it('a failing validate sets fieldErrors, skips the handler, resolves false and never touches isSaving', async () => {
    const validate = vi.fn(requireName);
    const { result } = setup({ validate });
    act(() => result.current.setValue('name', ''));
    const handler = vi.fn(async () => undefined);
    const seenSaving: boolean[] = [];
    let outcome: boolean | undefined;
    await act(async () => {
      const promise = result.current.save(handler);
      seenSaving.push(result.current.isSaving);
      outcome = await promise;
    });
    expect(outcome).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(validate).toHaveBeenCalledWith({ name: '', amount: 10 });
    expect(result.current.fieldErrors).toEqual({ name: 'Required' });
    expect(result.current.saveError).toBeNull();
    expect(result.current.isSaving).toBe(false);
    expect(seenSaving).toEqual([false]);
  });

  it('validate runs before the handler and a passing validate lets the save through', async () => {
    const order: string[] = [];
    const { result } = setup({
      validate: () => {
        order.push('validate');
        return {};
      },
    });
    await act(async () => {
      await result.current.save(async () => {
        order.push('handler');
      });
    });
    expect(order).toEqual(['validate', 'handler']);
    expect(result.current.fieldErrors).toEqual({});
  });

  // Until #102 `setValue`/`setValues` were rows of the "clears fieldErrors as a whole" table below
  // (all-or-nothing clearing). Decision of Daniele (validation plan, F10): they now clear only the
  // paths they write, so those rows became the per-path tests that follow; `reset` is unchanged.
  it.each<[string, (r: Result) => void]>([
    ['setValue', (r) => r.current.setValue('amount', 11)],
    ['setValues', (r) => r.current.setValues({ amount: 12 })],
  ])('%s on a field without errors leaves the errors of the other fields in place', async (_label, mutate) => {
    const { result } = setup({ validate: requireName });
    await failValidation(result);
    const before = result.current.fieldErrors;
    act(() => mutate(result));
    expect(result.current.fieldErrors).toBe(before);
    expect(result.current.fieldErrors).toEqual({ name: 'Required' });
  });

  it.each<[string, (r: Result) => void]>([
    ['setValue', (r) => r.current.setValue('name', 'x')],
    ['setValues', (r) => r.current.setValues({ name: 'x' })],
  ])('%s on the invalid field clears its error (the shared empty object once none is left)', async (_label, mutate) => {
    const { result } = setup({ validate: requireName });
    const empty = result.current.fieldErrors;
    await failValidation(result);
    act(() => mutate(result));
    expect(result.current.fieldErrors).toEqual({});
    expect(result.current.fieldErrors).toBe(empty);
  });

  it.each<[string, (r: Result) => void]>([
    ['reset()', (r) => r.current.reset()],
    ['reset(newBaseline)', (r) => r.current.reset({ name: 'N', amount: 1 })],
  ])('%s clears fieldErrors as a whole', async (_label, mutate) => {
    const { result } = setup({ validate: requireName });
    await failValidation(result);
    act(() => mutate(result));
    expect(result.current.fieldErrors).toEqual({});
  });

  it('a successful save clears fieldErrors', async () => {
    let strict = true;
    const { result } = setup({ validate: () => (strict ? { name: 'No' } : {}) });
    await act(async () => {
      await result.current.save(async () => undefined);
    });
    expect(result.current.fieldErrors).toEqual({ name: 'No' });
    strict = false;
    await act(async () => {
      expect(await result.current.save(async () => undefined)).toBe(true);
    });
    expect(result.current.fieldErrors).toEqual({});
  });

  it('a passing validate clears stale errors even when the handler then fails (saveError stays distinct)', async () => {
    let strict = true;
    const { result } = setup({ validate: () => (strict ? { name: 'No' } : {}) });
    await act(async () => {
      await result.current.save(async () => undefined);
    });
    strict = false;
    await act(async () => {
      expect(
        await result.current.save(async () => {
          throw new Error('boom');
        }),
      ).toBe(false);
    });
    expect(result.current.fieldErrors).toEqual({});
    expect((result.current.saveError as Error).message).toBe('boom');
  });

  it('a server failure does not populate fieldErrors', async () => {
    const { result } = setup({ validate: requireName });
    await act(async () => {
      await result.current.save(async () => {
        throw new Error('net');
      });
    });
    expect(result.current.saveError).toBeInstanceOf(Error);
    expect(result.current.fieldErrors).toEqual({});
  });

  it('a key whose value is undefined is not an error: the save goes through', async () => {
    const handler = vi.fn(async () => undefined);
    const { result } = setup({ validate: (v) => ({ name: v.name ? undefined : 'Required' }) });
    await act(async () => {
      expect(await result.current.save(handler)).toBe(true);
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.current.fieldErrors).toEqual({});
  });

  it('only the defined keys end up in fieldErrors', async () => {
    const { result } = setup({ validate: () => ({ name: undefined, amount: 'Too low' }) });
    await act(async () => {
      expect(await result.current.save(async () => undefined)).toBe(false);
    });
    expect(result.current.fieldErrors).toEqual({ amount: 'Too low' });
    expect(Object.keys(result.current.fieldErrors)).toEqual(['amount']);
  });

  it('a validate that throws sets saveError, resolves false, skips the handler and leaves isSaving alone', async () => {
    const handler = vi.fn(async () => undefined);
    const { result } = setup({
      validate: () => {
        throw new Error('schema blew up');
      },
    });
    await act(async () => {
      expect(await result.current.save(handler)).toBe(false);
    });
    expect(handler).not.toHaveBeenCalled();
    expect((result.current.saveError as Error).message).toBe('schema blew up');
    expect(result.current.fieldErrors).toEqual({});
    expect(result.current.isSaving).toBe(false);
    // not stuck: the next save works
    await act(async () => {
      expect(await result.current.save(handler)).toBe(false);
    });
  });

  it('uses the latest validate function', async () => {
    const { result, rerender } = setup({ validate: () => ({ name: 'old' }) });
    rerender({ baseline: BASE, validate: () => ({ name: 'new' }) });
    await act(async () => {
      await result.current.save(async () => undefined);
    });
    expect(result.current.fieldErrors).toEqual({ name: 'new' });
  });

  it('does not validate when a save is already in flight', async () => {
    const validate = vi.fn(requireName);
    const { result } = setup({ validate });
    const gate = deferred();
    let first!: Promise<boolean>;
    act(() => {
      first = result.current.save(() => gate.promise);
    });
    expect(validate).toHaveBeenCalledTimes(1);
    await act(async () => {
      expect(await result.current.save(async () => undefined)).toBe(false);
    });
    expect(validate).toHaveBeenCalledTimes(1);
    await act(async () => {
      gate.resolve();
      await first;
    });
  });

  it('every failed validate produces a new fieldErrors object, even with identical content', async () => {
    const { result } = setup({ validate: () => ({ name: 'Required' }) });
    await act(async () => {
      await result.current.save(async () => undefined);
    });
    const first = result.current.fieldErrors;
    await act(async () => {
      await result.current.save(async () => undefined);
    });
    expect(result.current.fieldErrors).toEqual(first);
    expect(result.current.fieldErrors).not.toBe(first);
  });

  it('keeps a stable fieldErrors identity while there are no errors', () => {
    const { result } = setup({ validate: requireName });
    const first = result.current.fieldErrors;
    act(() => result.current.setValue('amount', 99));
    expect(result.current.fieldErrors).toBe(first);
  });
});
