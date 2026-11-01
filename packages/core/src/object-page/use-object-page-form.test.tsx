import { act, cleanup, render, renderHook } from '@testing-library/react';
import { StrictMode, useEffect, useLayoutEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deepEqual } from './equal';
import { useObjectPageForm, type UseObjectPageFormOptions } from './use-object-page-form';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

type Invoice = { name: string; amount: number };
const BASE: Invoice = { name: 'ACME', amount: 10 };

function setup<V extends object = Invoice>(options?: Partial<UseObjectPageFormOptions<V>>) {
  return renderHook((props: UseObjectPageFormOptions<V>) => useObjectPageForm<V>(props), {
    initialProps: { baseline: BASE as unknown as V, ...options } as UseObjectPageFormOptions<V>,
  });
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('deepEqual', () => {
  it('compares primitives, with NaN equal to NaN and +0 equal to -0', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(NaN, NaN)).toBe(true);
    expect(deepEqual(0, -0)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual('1', 1)).toBe(false);
  });

  it("keeps '', null and undefined distinct from each other", () => {
    expect(deepEqual('', null)).toBe(false);
    expect(deepEqual('', undefined)).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual({ a: '' }, { a: null })).toBe(false);
    expect(deepEqual({ a: null }, { a: undefined })).toBe(false);
    expect(deepEqual({ a: '' }, { a: undefined })).toBe(false);
  });

  it('compares dates by getTime and distinguishes a date from other values', () => {
    expect(deepEqual(new Date(5), new Date(5))).toBe(true);
    expect(deepEqual(new Date(5), new Date(6))).toBe(false);
    expect(deepEqual(new Date(NaN), new Date(NaN))).toBe(true);
    expect(deepEqual(new Date(5), 5)).toBe(false);
    expect(deepEqual(new Date(5), {})).toBe(false);
  });

  it('compares arrays and plain objects by content, deeply', () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(deepEqual({ a: undefined }, { b: undefined })).toBe(false);
    expect(deepEqual(Object.create(null) as object, {})).toBe(true);
  });

  it('compares other objects by reference', () => {
    expect(deepEqual(new Map(), new Map())).toBe(false);
    const set = new Set([1]);
    expect(deepEqual(set, set)).toBe(true);
    class Point {
      x = 1;
    }
    expect(deepEqual(new Point(), new Point())).toBe(false);
  });

  it('does not overflow on circular structures', () => {
    const a: Record<string, unknown> = { n: 1 };
    a.self = a;
    const b: Record<string, unknown> = { n: 1 };
    b.self = b;
    expect(deepEqual(a, b)).toBe(true);
    const c: Record<string, unknown> = { n: 2 };
    c.self = c;
    expect(deepEqual(a, c)).toBe(false);
  });
});

describe('useObjectPageForm: values and dirty', () => {
  it('starts with values equal to the baseline and not dirty', () => {
    const { result } = setup();
    expect(result.current.values).toEqual(BASE);
    expect(result.current.baseline).toEqual(BASE);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.saveError).toBeNull();
  });

  it('computes dirty against the baseline: returning to the original value is clean', () => {
    const { result } = setup();
    act(() => result.current.setValue('name', 'ACME srl'));
    expect(result.current.values.name).toBe('ACME srl');
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.setValue('name', 'ACME'));
    expect(result.current.isDirty).toBe(false);
  });

  it('never mutates the baseline object', () => {
    const baseline = { name: 'ACME', amount: 10 };
    const { result } = setup({ baseline });
    act(() => result.current.setValue('name', 'X'));
    expect(baseline).toEqual({ name: 'ACME', amount: 10 });
  });

  it('setValues updates several fields in a single render', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useObjectPageForm<Invoice>({ baseline: BASE });
    });
    const before = renders;
    act(() => result.current.setValues({ name: 'B', amount: 99 }));
    expect(result.current.values).toEqual({ name: 'B', amount: 99 });
    expect(renders - before).toBe(1);
    act(() => result.current.setValues({ amount: 10 }));
    expect(result.current.values).toEqual({ name: 'B', amount: 10 });
  });

  it('composes several updates made in the same event', () => {
    const { result } = setup();
    act(() => {
      result.current.setValue('name', 'A');
      result.current.setValue('amount', 1);
      result.current.setValues({ name: 'C' });
    });
    expect(result.current.values).toEqual({ name: 'C', amount: 1 });
  });

  it('does not re-render for a no-op update', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useObjectPageForm<Invoice>({ baseline: BASE });
    });
    const before = renders;
    act(() => result.current.setValue('name', 'ACME'));
    act(() => result.current.setValues({}));
    expect(renders).toBe(before);
  });

  it('types setValue by field name and value', () => {
    const { result } = setup();
    // @ts-expect-error unknown field name
    expect(() => result.current.setValue('nope', 'x')).not.toThrow();
    // @ts-expect-error wrong value type for the field
    expect(() => result.current.setValue('amount', 'ten')).not.toThrow();
    // @ts-expect-error unknown field in the patch
    expect(() => result.current.setValues({ nope: 1 })).not.toThrow();
  });

  it('accepts an interface Values type, not just a type alias (Values extends object)', () => {
    interface InvoiceForm {
      name: string;
      amount: number;
    }
    const baseline: InvoiceForm = { name: 'ACME', amount: 10 };
    const { result } = setup<InvoiceForm>({ baseline });
    act(() => result.current.setValue('name', 'ACME srl'));
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.setValue('name', 'ACME'));
    expect(result.current.isDirty).toBe(false);
  });

  it('is clean again after editing and restoring an element of an array or nested object', () => {
    type Form = { tags: string[]; address: { city: string; geo: number[] } };
    const baseline: Form = { tags: ['a', 'b'], address: { city: 'Roma', geo: [1, 2] } };
    const { result } = setup<Form>({ baseline });
    act(() => result.current.setValue('tags', ['a', 'x']));
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.setValue('tags', ['a', 'b']));
    expect(result.current.isDirty).toBe(false);
    act(() => result.current.setValue('address', { city: 'Roma', geo: [1, 3] }));
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.setValue('address', { city: 'Roma', geo: [1, 2] }));
    expect(result.current.isDirty).toBe(false);
  });

  it('distinguishes empty string, null and undefined from each other', () => {
    type Form = { note: string | null | undefined };
    const { result } = setup<Form>({ baseline: { note: '' } });
    act(() => result.current.setValue('note', null));
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.setValue('note', undefined));
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.setValue('note', ''));
    expect(result.current.isDirty).toBe(false);
  });

  it('compares dates by time and NaN with NaN', () => {
    type Form = { due: Date; ratio: number };
    const { result } = setup<Form>({ baseline: { due: new Date(1000), ratio: NaN } });
    act(() => result.current.setValue('due', new Date(1000)));
    act(() => result.current.setValue('ratio', NaN));
    expect(result.current.isDirty).toBe(false);
    act(() => result.current.setValue('due', new Date(2000)));
    expect(result.current.isDirty).toBe(true);
  });

  it('a field added outside the baseline (via cast) is dirty', () => {
    const { result } = setup();
    act(() => result.current.setValues({ extra: 1 } as unknown as Partial<Invoice>));
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.setValues({ extra: undefined } as unknown as Partial<Invoice>));
    expect(result.current.isDirty).toBe(true);
  });

  it('isEqual replaces the comparison', () => {
    const isEqual = vi.fn((a: Invoice, b: Invoice) => a.name.toLowerCase() === b.name.toLowerCase());
    const { result } = setup({ isEqual });
    act(() => result.current.setValue('name', 'acme'));
    expect(result.current.isDirty).toBe(false);
    act(() => result.current.setValue('amount', 11));
    expect(result.current.isDirty).toBe(false);
    act(() => result.current.setValue('name', 'other'));
    expect(result.current.isDirty).toBe(true);
    expect(isEqual).toHaveBeenCalled();
  });

  it('keeps the identity of setValue, setValues, reset and save across renders', () => {
    const { result, rerender } = setup();
    const first = result.current;
    act(() => result.current.setValue('name', 'B'));
    rerender({ baseline: BASE });
    for (const key of ['setValue', 'setValues', 'reset', 'save'] as const) {
      expect(result.current[key]).toBe(first[key]);
    }
  });
});

describe('useObjectPageForm: reset and hydration', () => {
  it('reset(newBaseline) hydrates baseline and values without dirty', () => {
    const { result } = setup();
    act(() => result.current.setValue('name', 'edited'));
    act(() => result.current.reset({ name: 'Loaded', amount: 5 }));
    expect(result.current.values).toEqual({ name: 'Loaded', amount: 5 });
    expect(result.current.baseline).toEqual({ name: 'Loaded', amount: 5 });
    expect(result.current.isDirty).toBe(false);
  });

  it('exposes no change callback', () => {
    const { result } = setup();
    expect(Object.keys(result.current).sort()).toEqual(
      [
        'baseline',
        'fieldErrors',
        'isDirty',
        'isSaving',
        'reset',
        'save',
        'saveError',
        'setValue',
        'setValues',
        'validationAttempt',
        'values',
      ].sort(),
    );
  });

  it('hydrates after an async load (fake timers) and stays clean', () => {
    vi.useFakeTimers();
    const { result } = setup({ baseline: { name: '', amount: 0 } });
    const timer = setTimeout(() => result.current.reset({ name: 'Late', amount: 7 }), 500);
    expect(timer).toBeDefined();
    expect(result.current.values.name).toBe('');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.values).toEqual({ name: 'Late', amount: 7 });
    expect(result.current.isDirty).toBe(false);
  });

  it('reset() discards the edits and goes back to the current baseline', () => {
    const { result } = setup();
    act(() => result.current.setValues({ name: 'x', amount: 1 }));
    act(() => result.current.reset());
    expect(result.current.values).toEqual(BASE);
    expect(result.current.isDirty).toBe(false);
    act(() => result.current.reset({ name: 'N', amount: 2 }));
    act(() => result.current.setValue('name', 'edited'));
    act(() => result.current.reset());
    expect(result.current.values).toEqual({ name: 'N', amount: 2 });
  });

  it('reset clears a save error', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.save(() => Promise.reject(new Error('boom')));
    });
    expect(result.current.saveError).toBeInstanceOf(Error);
    act(() => result.current.reset());
    expect(result.current.saveError).toBeNull();
  });
});

describe('useObjectPageForm: baseline option is read once', () => {
  it('ignores a different baseline after mount and warns once in development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result, rerender } = setup();
    rerender({ baseline: { name: 'Other', amount: 1 } });
    rerender({ baseline: { name: 'Another', amount: 2 } });
    rerender({ baseline: { name: 'Third', amount: 3 } });
    expect(result.current.values).toEqual(BASE);
    expect(result.current.baseline).toEqual(BASE);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('reset(newBaseline)');
  });

  it('does not warn when only the identity changes with equal content', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result, rerender } = setup();
    rerender({ baseline: { ...BASE } });
    rerender({ baseline: { ...BASE } });
    expect(warn).not.toHaveBeenCalled();
    expect(result.current.isDirty).toBe(false);
  });

  it('judges "equal content" with isEqual: an inline Set baseline with a matching isEqual does not warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    type Tags = { tags: Set<string> };
    const isEqual = (a: Tags, b: Tags) => a.tags.size === b.tags.size && [...a.tags].every((t) => b.tags.has(t));
    const { rerender } = setup<Tags>({ baseline: { tags: new Set(['a']) }, isEqual });
    rerender({ baseline: { tags: new Set(['a']) }, isEqual });
    expect(warn).not.toHaveBeenCalled();
    rerender({ baseline: { tags: new Set(['b']) }, isEqual });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not warn in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { rerender } = setup();
      rerender({ baseline: { name: 'Other', amount: 1 } });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('warns only once under StrictMode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = renderHook((props: UseObjectPageFormOptions<Invoice>) => useObjectPageForm(props), {
      initialProps: { baseline: BASE },
      wrapper: StrictMode,
    });
    rerender({ baseline: { name: 'Other', amount: 1 } });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('useObjectPageForm: save', () => {
  it('sets isSaving, calls the handler once with the values, then the sent values become the baseline', async () => {
    const { result } = setup();
    act(() => result.current.setValue('name', 'New'));
    const gate = deferred();
    const handler = vi.fn(() => gate.promise);
    let outcome: Promise<boolean>;
    act(() => {
      outcome = result.current.save(handler);
    });
    expect(result.current.isSaving).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ name: 'New', amount: 10 });
    expect(result.current.isDirty).toBe(true);
    await act(async () => {
      gate.resolve();
      expect(await outcome).toBe(true);
    });
    expect(result.current.isSaving).toBe(false);
    expect(result.current.baseline).toEqual({ name: 'New', amount: 10 });
    expect(result.current.isDirty).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('uses the value returned by the handler as the new baseline (and as values when untouched)', async () => {
    const { result } = setup();
    act(() => result.current.setValue('name', ' new '));
    await act(async () => {
      await result.current.save(async () => ({ name: 'New', amount: 10 }));
    });
    expect(result.current.baseline).toEqual({ name: 'New', amount: 10 });
    expect(result.current.values).toEqual({ name: 'New', amount: 10 });
    expect(result.current.isDirty).toBe(false);
  });

  it('accepts a synchronous handler', async () => {
    const { result } = setup();
    act(() => result.current.setValue('amount', 3));
    let ok = false;
    await act(async () => {
      ok = await result.current.save(() => undefined);
    });
    expect(ok).toBe(true);
    expect(result.current.isDirty).toBe(false);
  });

  it('keeps edits made during the save: baseline is what was sent, values the latest, dirty', async () => {
    const { result } = setup();
    act(() => result.current.setValue('name', 'Sent'));
    const gate = deferred();
    let outcome: Promise<boolean>;
    act(() => {
      outcome = result.current.save(() => gate.promise);
    });
    act(() => result.current.setValue('amount', 99));
    await act(async () => {
      gate.resolve();
      await outcome;
    });
    expect(result.current.baseline).toEqual({ name: 'Sent', amount: 10 });
    expect(result.current.values).toEqual({ name: 'Sent', amount: 99 });
    expect(result.current.isDirty).toBe(true);
  });

  it('keeps the latest edits even when the handler returns a normalized baseline', async () => {
    const { result } = setup();
    act(() => result.current.setValue('name', 'Sent'));
    const gate = deferred<Invoice>();
    let outcome: Promise<boolean>;
    act(() => {
      outcome = result.current.save(() => gate.promise);
    });
    act(() => result.current.setValue('amount', 99));
    await act(async () => {
      gate.resolve({ name: 'SENT', amount: 10 });
      await outcome;
    });
    expect(result.current.baseline).toEqual({ name: 'SENT', amount: 10 });
    expect(result.current.values).toEqual({ name: 'Sent', amount: 99 });
    expect(result.current.isDirty).toBe(true);
  });

  it('on rejection sets saveError, isSaving false, values and baseline unchanged, returns false', async () => {
    const { result } = setup();
    act(() => result.current.setValue('name', 'Edited'));
    const error = new Error('server down');
    let ok = true;
    await act(async () => {
      ok = await result.current.save(() => Promise.reject(error));
    });
    expect(ok).toBe(false);
    expect(result.current.saveError).toBe(error);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.values).toEqual({ name: 'Edited', amount: 10 });
    expect(result.current.baseline).toEqual(BASE);
    expect(result.current.isDirty).toBe(true);
  });

  it('treats a synchronous throw as a save error, not as an unhandled exception', async () => {
    const { result } = setup();
    const error = new Error('sync');
    let ok = true;
    await act(async () => {
      ok = await result.current.save(() => {
        throw error;
      });
    });
    expect(ok).toBe(false);
    expect(result.current.saveError).toBe(error);
    expect(result.current.isSaving).toBe(false);
  });

  it('reports a nullish rejection as an Error so saveError is never confused with "no error"', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.save(() => Promise.reject(undefined));
    });
    expect(result.current.saveError).toBeInstanceOf(Error);
  });

  it('clears saveError on the next setValue, setValues and successful save', async () => {
    const { result } = setup();
    const fail = () => Promise.reject(new Error('x'));
    await act(async () => {
      await result.current.save(fail);
    });
    act(() => result.current.setValue('name', 'y'));
    expect(result.current.saveError).toBeNull();
    await act(async () => {
      await result.current.save(fail);
    });
    act(() => result.current.setValues({ amount: 2 }));
    expect(result.current.saveError).toBeNull();
    await act(async () => {
      await result.current.save(fail);
    });
    expect(result.current.saveError).not.toBeNull();
    await act(async () => {
      expect(await result.current.save(async () => undefined)).toBe(true);
    });
    expect(result.current.saveError).toBeNull();
  });

  it('a second save while saving does not call the handler and returns false', async () => {
    const { result } = setup();
    const gate = deferred();
    const first = vi.fn(() => gate.promise);
    const second = vi.fn(async () => undefined);
    let firstOutcome: Promise<boolean>;
    let secondOutcome = true;
    act(() => {
      firstOutcome = result.current.save(first);
    });
    await act(async () => {
      secondOutcome = await result.current.save(second);
    });
    expect(secondOutcome).toBe(false);
    expect(second).not.toHaveBeenCalled();
    await act(async () => {
      gate.resolve();
      await firstOutcome;
    });
    expect(first).toHaveBeenCalledTimes(1);
    // The lock is released afterwards.
    await act(async () => {
      expect(await result.current.save(second)).toBe(true);
    });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('two synchronous save calls in the same tick call the handler once', async () => {
    const { result } = setup();
    const handler = vi.fn(async () => undefined);
    await act(async () => {
      const [a, b] = await Promise.all([result.current.save(handler), result.current.save(handler)]);
      expect([a, b]).toEqual([true, false]);
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('a non-object handler result warns in development and the sent values become the baseline', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = setup();
    act(() => result.current.setValue('name', 'S'));
    await act(async () => {
      await result.current.save((async () => 'ok') as unknown as () => Promise<void>);
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(result.current.baseline).toEqual({ name: 'S', amount: 10 });
    expect(result.current.isDirty).toBe(false);
  });

  it('a reset during the save wins over the later success of the in-flight save', async () => {
    const { result } = setup();
    act(() => result.current.setValue('name', 'Sent'));
    const gate = deferred<Invoice>();
    let outcome: Promise<boolean>;
    act(() => {
      outcome = result.current.save(() => gate.promise);
    });
    act(() => result.current.reset({ name: 'Hydrated', amount: 1 }));
    expect(result.current.isSaving).toBe(true);
    let ok = false;
    await act(async () => {
      gate.resolve({ name: 'Server', amount: 2 });
      ok = await outcome;
    });
    expect(ok).toBe(true);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.baseline).toEqual({ name: 'Hydrated', amount: 1 });
    expect(result.current.values).toEqual({ name: 'Hydrated', amount: 1 });
    expect(result.current.isDirty).toBe(false);
  });

  it('a reset() (discard) during the save is also not overwritten by the success', async () => {
    const { result } = setup();
    act(() => result.current.setValue('name', 'Sent'));
    const gate = deferred();
    let outcome: Promise<boolean>;
    act(() => {
      outcome = result.current.save(() => gate.promise);
    });
    act(() => result.current.reset());
    await act(async () => {
      gate.resolve();
      await outcome;
    });
    expect(result.current.baseline).toEqual(BASE);
    expect(result.current.values).toEqual(BASE);
    expect(result.current.isDirty).toBe(false);
  });

  it('a stale failure after a reset releases isSaving, returns false and sets no saveError', async () => {
    const { result } = setup();
    const gate = deferred();
    let outcome: Promise<boolean>;
    act(() => {
      outcome = result.current.save(() => gate.promise);
    });
    act(() => result.current.reset({ name: 'H', amount: 1 }));
    await act(async () => {
      gate.reject(new Error('late'));
      expect(await outcome).toBe(false);
    });
    expect(result.current.isSaving).toBe(false);
    expect(result.current.saveError).toBeNull();
    expect(result.current.baseline).toEqual({ name: 'H', amount: 1 });
  });

  it('unmounting during the save causes no state update and no warning', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result, unmount } = setup();
    const gate = deferred<string>();
    let outcome: Promise<boolean>;
    act(() => {
      outcome = result.current.save(() => gate.promise as unknown as Promise<void>);
    });
    unmount();
    let ok = false;
    await act(async () => {
      // A non-object result would log a development warning if the success path ran after unmount.
      gate.resolve('ok');
      ok = await outcome;
    });
    expect(ok).toBe(true);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('unmounting during a failing save causes no state update and no warning', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = setup();
    const gate = deferred();
    let outcome: Promise<boolean>;
    act(() => {
      outcome = result.current.save(() => gate.promise);
    });
    unmount();
    await act(async () => {
      gate.reject(new Error('x'));
      expect(await outcome).toBe(false);
    });
    expect(error).not.toHaveBeenCalled();
  });

  it('a save that fails synchronously before the mount effects of the hook still settles isSaving and saveError', async () => {
    const error = new Error('early');
    const seen: { isSaving: boolean; saveError: unknown } = { isSaving: true, saveError: null };
    function Parent() {
      const form = useObjectPageForm<Invoice>({ baseline: BASE });
      seen.isSaving = form.isSaving;
      seen.saveError = form.saveError;
      // A child effect runs before the effects of the component that owns the hook.
      return <Child save={form.save} />;
    }
    function Child({ save }: { save: ReturnType<typeof useObjectPageForm<Invoice>>['save'] }) {
      useEffect(() => {
        void save(() => {
          throw error;
        });
      }, [save]);
      return null;
    }
    await act(async () => {
      render(<Parent />);
    });
    expect(seen.isSaving).toBe(false);
    expect(seen.saveError).toBe(error);
  });

  it('a layout-effect save that succeeds before the passive mount effects still updates the baseline', async () => {
    const seen: { baseline: Invoice; isSaving: boolean } = { baseline: BASE, isSaving: true };
    function Parent() {
      const form = useObjectPageForm<Invoice>({ baseline: BASE });
      seen.baseline = form.baseline;
      seen.isSaving = form.isSaving;
      useLayoutEffect(() => {
        void form.save(async () => ({ name: 'Early', amount: 1 }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }
    await act(async () => {
      render(<Parent />);
    });
    expect(seen.isSaving).toBe(false);
    expect(seen.baseline).toEqual({ name: 'Early', amount: 1 });
  });

  it('a custom isEqual never decides whether the user edited during the save', async () => {
    const lax = (a: Invoice, b: Invoice) => a.name.toLowerCase() === b.name.toLowerCase() && a.amount === b.amount;
    const { result } = setup({ isEqual: lax });
    act(() => result.current.setValue('name', 'acme'));
    const gate = deferred<Invoice>();
    let outcome: Promise<boolean>;
    act(() => {
      outcome = result.current.save(() => gate.promise);
    });
    act(() => result.current.setValue('name', 'ACME'));
    await act(async () => {
      gate.resolve({ name: 'acme', amount: 10 });
      await outcome;
    });
    expect(result.current.values.name).toBe('ACME');
    expect(result.current.baseline.name).toBe('acme');
  });

  it('an array returned by the handler is not a baseline: warns and uses the sent values', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = setup();
    act(() => result.current.setValue('name', 'S'));
    await act(async () => {
      await result.current.save((async () => []) as unknown as () => Promise<void>);
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(result.current.baseline).toEqual({ name: 'S', amount: 10 });
  });

  it('works under StrictMode (effects mounted twice): saving still updates state', async () => {
    const { result } = renderHook(() => useObjectPageForm<Invoice>({ baseline: BASE }), { wrapper: StrictMode });
    act(() => result.current.setValue('name', 'S'));
    await act(async () => {
      await result.current.save(async () => undefined);
    });
    expect(result.current.baseline.name).toBe('S');
    expect(result.current.isDirty).toBe(false);
  });
});
