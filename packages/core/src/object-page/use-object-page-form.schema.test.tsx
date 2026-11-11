import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { StandardSchemaIssue, StandardSchemaLike, StandardSchemaResult } from './standard-schema';
import { useObjectPageForm, type UseObjectPageFormOptions } from './use-object-page-form';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

type Order = { supplier: string; amount: number; address: { city: string }; lines: { qty: number }[] };
const EMPTY: Order = { supplier: '', amount: 0, address: { city: '' }, lines: [{ qty: 1 }, { qty: 0 }] };
const VALID: Order = { supplier: 'ACME', amount: 10, address: { city: 'Rome' }, lines: [{ qty: 1 }] };

const zodOrder = z.object({
  supplier: z.string().min(1, 'Supplier is required'),
  amount: z.number().positive('Amount must be positive'),
  address: z.object({ city: z.string().min(1, 'City is required') }),
  lines: z.array(z.object({ qty: z.number().positive('Quantity must be positive') })),
});

// Compile-time check: a real Zod schema satisfies the structural interface declared in the core.
const asStandard: StandardSchemaLike = zodOrder;

/** A hand-written synchronous Standard Schema: `check` returns the issues (none = valid). */
function handSchema(check: (value: Order) => StandardSchemaIssue[]) {
  const validate = vi.fn((value: unknown) => {
    const issues = check(value as Order);
    return issues.length > 0 ? { issues } : { value };
  });
  const schema: StandardSchemaLike = { '~standard': { validate } };
  return { schema, validate };
}

function setup(options?: Partial<UseObjectPageFormOptions<Order>>, baseline: Order = EMPTY) {
  return renderHook((props: UseObjectPageFormOptions<Order>) => useObjectPageForm<Order>(props), {
    initialProps: { baseline, ...options } as UseObjectPageFormOptions<Order>,
  });
}

type Result = ReturnType<typeof setup>['result'];

async function saveWith(result: Result, handler: (v: Order) => unknown = async () => undefined) {
  let outcome: boolean | undefined;
  await act(async () => {
    outcome = await result.current.save(handler as never);
  });
  return outcome;
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useObjectPageForm: schema (Standard Schema)', () => {
  it('a Zod schema is accepted as is', () => {
    expect(typeof asStandard['~standard'].validate).toBe('function');
  });

  it('without schema, formErrors is always [] (stable identity)', async () => {
    const { result } = setup({}, VALID);
    const first = result.current.formErrors;
    expect(first).toEqual([]);
    act(() => result.current.setValue('amount', 3));
    expect(result.current.formErrors).toBe(first);
    await saveWith(result);
    expect(result.current.formErrors).toBe(first);
  });

  it('Zod issues become dot-path fieldErrors: handler skipped, false, isSaving never touched, no saveError', async () => {
    const { result } = setup({ schema: zodOrder });
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
    expect(result.current.fieldErrors).toEqual({
      supplier: 'Supplier is required',
      amount: 'Amount must be positive',
      'address.city': 'City is required',
      'lines.1.qty': 'Quantity must be positive',
    });
    expect(result.current.formErrors).toEqual([]);
    expect(result.current.saveError).toBeNull();
    expect(result.current.isSaving).toBe(false);
    expect(seenSaving).toEqual([false]);
  });

  it('several Zod issues on one path: the first one wins', async () => {
    const schema = z.object({ supplier: z.string().min(3, 'Too short').regex(/^[A-Z]/, 'Capital first') });
    const { result } = setup({ schema }, { ...VALID, supplier: 'a' });
    expect(await saveWith(result)).toBe(false);
    expect(result.current.fieldErrors).toEqual({ supplier: 'Too short' });
  });

  it('a Zod refine on the whole object goes to formErrors, not fieldErrors, and fails the save', async () => {
    const schema = zodOrder.refine((v) => v.lines.length <= 1, { message: 'At most one line' });
    const handler = vi.fn();
    const { result } = setup({ schema }, { ...VALID, lines: [{ qty: 1 }, { qty: 2 }] });
    expect(await saveWith(result, handler)).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(result.current.formErrors).toEqual(['At most one line']);
    expect(result.current.fieldErrors).toEqual({});
    expect(result.current.saveError).toBeNull();
  });

  it('a valid Zod schema lets the save through with the raw values, never the parsed output', async () => {
    // Transform + coerce: the parsed output would differ from the raw values.
    const schema = z.object({
      supplier: z.string().trim().min(1).transform((s) => s.toUpperCase()),
      amount: z.coerce.string(),
      address: z.object({ city: z.string() }),
      lines: z.array(z.object({ qty: z.number() })),
    });
    const raw: Order = { ...VALID, supplier: '  acme  ' };
    const handler = vi.fn(async () => undefined);
    const { result } = setup({ schema }, raw);
    act(() => result.current.setValue('supplier', '  acme srl '));
    expect(await saveWith(result, handler)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ ...raw, supplier: '  acme srl ' });
    expect(result.current.values.supplier).toBe('  acme srl ');
    expect(result.current.baseline.supplier).toBe('  acme srl ');
    expect(result.current.fieldErrors).toEqual({});
    expect(result.current.formErrors).toEqual([]);
  });

  it('the schema receives the very latest values (updated in the same event)', async () => {
    const { schema, validate } = handSchema(() => []);
    const { result } = setup({ schema }, VALID);
    await act(async () => {
      result.current.setValue('supplier', 'NEW');
      await result.current.save(async () => undefined);
    });
    expect(validate).toHaveBeenCalledWith({ ...VALID, supplier: 'NEW' });
  });

  it('hand-written schema: { key } segments and array indices; root issues keep their order', async () => {
    const { schema } = handSchema(() => [
      { message: 'Line qty', path: [{ key: 'lines' }, { key: 0 }, { key: 'qty' }] },
      { message: 'Root A' },
      { message: 'City', path: ['address', { key: 'city' }] },
      { message: 'Line qty again', path: ['lines', 0, 'qty'] },
      { message: 'Root B', path: [] },
    ]);
    const { result } = setup({ schema }, VALID);
    expect(await saveWith(result)).toBe(false);
    expect(result.current.fieldErrors).toEqual({ 'lines.0.qty': 'Line qty', 'address.city': 'City' });
    expect(result.current.formErrors).toEqual(['Root A', 'Root B']);
  });

  it('an issues array that is empty counts as success', async () => {
    const schema: StandardSchemaLike = { '~standard': { validate: () => ({ issues: [] }) } };
    const handler = vi.fn(async () => undefined);
    const { result } = setup({ schema }, VALID);
    expect(await saveWith(result, handler)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('every failed attempt produces new fieldErrors and formErrors objects, even with identical content', async () => {
    const { schema } = handSchema(() => [{ message: 'Required', path: ['supplier'] }, { message: 'Root' }]);
    const { result } = setup({ schema });
    await saveWith(result);
    const first = { fieldErrors: result.current.fieldErrors, formErrors: result.current.formErrors };
    await saveWith(result);
    expect(result.current.fieldErrors).toEqual(first.fieldErrors);
    expect(result.current.fieldErrors).not.toBe(first.fieldErrors);
    expect(result.current.formErrors).toEqual(first.formErrors);
    expect(result.current.formErrors).not.toBe(first.formErrors);
  });

  it('a failure with only root issues still gives fieldErrors a new (empty) identity', async () => {
    const { schema } = handSchema(() => [{ message: 'Root' }]);
    const { result } = setup({ schema });
    const initial = result.current.fieldErrors;
    await saveWith(result);
    expect(result.current.fieldErrors).toEqual({});
    expect(result.current.fieldErrors).not.toBe(initial);
    expect(result.current.formErrors).toEqual(['Root']);
  });

  it.each<[string, (r: Result) => void]>([
    // #102: an edit clears only the errors of the paths it changes, and `formErrors` go with the
    // last field error. So the edit targets the only invalid field (`supplier`), not `amount`;
    // editing an unrelated field is covered in `use-object-page-form.clear-paths.test.tsx`.
    ['setValue of the only invalid field', (r) => r.current.setValue('supplier', 'ACME')],
    ['setValues touching the only invalid field', (r) => r.current.setValues({ supplier: 'ACME', amount: 12 })],
    ['reset()', (r) => r.current.reset()],
    ['reset(newBaseline)', (r) => r.current.reset(VALID)],
  ])('%s clears fieldErrors and formErrors together', async (_label, mutate) => {
    const { schema } = handSchema(() => [{ message: 'Required', path: ['supplier'] }, { message: 'Root' }]);
    const { result } = setup({ schema });
    await saveWith(result);
    expect(result.current.formErrors).toEqual(['Root']);
    act(() => mutate(result));
    expect(result.current.fieldErrors).toEqual({});
    expect(result.current.formErrors).toEqual([]);
  });

  it('a successful save clears formErrors and fieldErrors of a previous failed attempt', async () => {
    let strict = true;
    const { schema } = handSchema(() => (strict ? [{ message: 'Root' }, { message: 'X', path: ['supplier'] }] : []));
    const { result } = setup({ schema });
    await saveWith(result);
    strict = false;
    expect(await saveWith(result)).toBe(true);
    expect(result.current.formErrors).toEqual([]);
    expect(result.current.fieldErrors).toEqual({});
  });

  it('a passing schema clears stale errors even when the handler then fails (saveError stays distinct)', async () => {
    let strict = true;
    const { schema } = handSchema(() => (strict ? [{ message: 'Root' }] : []));
    const { result } = setup({ schema });
    await saveWith(result);
    strict = false;
    expect(
      await saveWith(result, async () => {
        throw new Error('boom');
      }),
    ).toBe(false);
    expect(result.current.formErrors).toEqual([]);
    expect((result.current.saveError as Error).message).toBe('boom');
  });

  it('reset() right after a save that failed on the schema leaves no stale state', async () => {
    const { schema } = handSchema(() => [{ message: 'Required', path: ['supplier'] }, { message: 'Root' }]);
    const handler = vi.fn();
    const { result } = setup({ schema });
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = result.current.save(handler);
      result.current.reset();
      expect(await pending).toBe(false);
    });
    expect(handler).not.toHaveBeenCalled();
    expect(result.current.fieldErrors).toEqual({});
    expect(result.current.formErrors).toEqual([]);
    expect(result.current.saveError).toBeNull();
    expect(result.current.isSaving).toBe(false);
    expect(result.current.isDirty).toBe(false);
    // The next attempt is evaluated afresh.
    expect(await saveWith(result)).toBe(false);
    expect(result.current.fieldErrors).toEqual({ supplier: 'Required' });
  });

  it('uses the latest schema passed, without recreating save', async () => {
    const { result, rerender } = setup({ schema: handSchema(() => [{ message: 'old', path: ['supplier'] }]).schema });
    const save = result.current.save;
    rerender({ baseline: EMPTY, schema: handSchema(() => [{ message: 'new', path: ['supplier'] }]).schema });
    expect(result.current.save).toBe(save);
    await saveWith(result);
    expect(result.current.fieldErrors).toEqual({ supplier: 'new' });
    // Removing the schema: the save goes through.
    rerender({ baseline: EMPTY });
    expect(await saveWith(result)).toBe(true);
  });

  it('does not run the schema when a save is already in flight', async () => {
    const { schema, validate } = handSchema(() => []);
    const { result } = setup({ schema }, VALID);
    const gate = deferred();
    let first!: Promise<boolean>;
    act(() => {
      first = result.current.save(() => gate.promise);
    });
    expect(validate).toHaveBeenCalledTimes(1);
    expect(await saveWith(result)).toBe(false);
    expect(validate).toHaveBeenCalledTimes(1);
    await act(async () => {
      gate.resolve();
      await first;
    });
  });

  describe('schema + validate', () => {
    it('schema fails: validate is never called', async () => {
      const validate = vi.fn(() => ({ amount: 'from validate' }));
      const { result } = setup({ schema: zodOrder, validate });
      expect(await saveWith(result)).toBe(false);
      expect(validate).not.toHaveBeenCalled();
      expect(result.current.fieldErrors.supplier).toBe('Supplier is required');
      expect(result.current.fieldErrors.amount).toBe('Amount must be positive');
    });

    it('schema passes: validate runs after it with the raw values, and a failing validate wins', async () => {
      const order: string[] = [];
      const { schema } = handSchema(() => {
        order.push('schema');
        return [];
      });
      const validate = vi.fn((v: Order) => {
        order.push('validate');
        return v.amount > 5 ? { amount: 'Over the limit' } : {};
      });
      const handler = vi.fn();
      const { result } = setup({ schema, validate }, VALID);
      expect(await saveWith(result, handler)).toBe(false);
      expect(order).toEqual(['schema', 'validate']);
      expect(validate).toHaveBeenCalledWith(VALID);
      expect(handler).not.toHaveBeenCalled();
      expect(result.current.fieldErrors).toEqual({ amount: 'Over the limit' });
    });

    it('a failing validate after a passing schema clears the root errors of an earlier schema attempt', async () => {
      let schemaFails = true;
      const { schema } = handSchema(() => (schemaFails ? [{ message: 'Root' }] : []));
      const { result } = setup({ schema, validate: () => ({ amount: 'Over the limit' }) }, VALID);
      await saveWith(result);
      expect(result.current.formErrors).toEqual(['Root']);
      schemaFails = false;
      await saveWith(result);
      expect(result.current.formErrors).toEqual([]);
      expect(result.current.fieldErrors).toEqual({ amount: 'Over the limit' });
    });

    it('both pass: order is schema, validate, handler', async () => {
      const order: string[] = [];
      const { schema } = handSchema(() => {
        order.push('schema');
        return [];
      });
      const { result } = setup(
        {
          schema,
          validate: () => {
            order.push('validate');
            return {};
          },
        },
        VALID,
      );
      expect(await saveWith(result, () => void order.push('handler'))).toBe(true);
      expect(order).toEqual(['schema', 'validate', 'handler']);
    });
  });

  describe('asynchronous schema (not supported in v1)', () => {
    function asyncSchema(promise: Promise<unknown>) {
      return { '~standard': { validate: vi.fn(() => promise) } } as unknown as StandardSchemaLike;
    }

    it('resolves false at once with an explicit saveError and a console.error in development', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const handler = vi.fn();
      const validate = vi.fn(() => ({}));
      // Never settles: the save must not wait for it.
      const { result } = setup({ schema: asyncSchema(new Promise(() => {})), validate }, VALID);
      const seenSaving: boolean[] = [];
      let outcome: boolean | undefined;
      await act(async () => {
        const promise = result.current.save(handler);
        seenSaving.push(result.current.isSaving);
        outcome = await promise;
      });
      expect(outcome).toBe(false);
      expect(handler).not.toHaveBeenCalled();
      expect(validate).not.toHaveBeenCalled();
      expect(seenSaving).toEqual([false]);
      expect(result.current.isSaving).toBe(false);
      expect(result.current.saveError).toBeInstanceOf(Error);
      expect((result.current.saveError as Error).message).toMatch(/asynchronous schema not supported: validation is synchronous in v1/);
      expect(result.current.fieldErrors).toEqual({});
      expect(result.current.formErrors).toEqual([]);
      expect(error).toHaveBeenCalledTimes(1);
      expect((error.mock.calls[0] ?? []).map(String).join(' ')).toMatch(
        /\[formrail\] useObjectPageForm:.*asynchronous schema not supported/,
      );
    });

    it('no console.error in production, same saveError', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = setup({ schema: asyncSchema(Promise.resolve({ value: VALID })) }, VALID);
      expect(await saveWith(result)).toBe(false);
      expect((result.current.saveError as Error).message).toMatch(/asynchronous schema not supported/);
      expect(error).not.toHaveBeenCalled();
    });

    it('a non-Promise thenable is treated as asynchronous too, and is never awaited', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const then = vi.fn();
      const schema = { '~standard': { validate: () => ({ then }) } } as unknown as StandardSchemaLike;
      const handler = vi.fn();
      const { result } = setup({ schema }, VALID);
      expect(await saveWith(result, handler)).toBe(false);
      expect(handler).not.toHaveBeenCalled();
      expect((result.current.saveError as Error).message).toMatch(/asynchronous schema not supported/);
      // Only a rejection handler is attached (to silence a late rejection); the result is not used.
      expect(then).toHaveBeenCalledTimes(1);
      expect(then.mock.calls[0]?.[0]).toBeUndefined();
    });

    it('a { value, issues: undefined } result with a `then` key that is not a function is a plain result', async () => {
      const schema: StandardSchemaLike = {
        '~standard': { validate: () => ({ value: { then: 1 }, then: 'nope' }) as unknown as StandardSchemaResult },
      };
      const { result } = setup({ schema }, VALID);
      expect(await saveWith(result)).toBe(true);
    });

    it('a rejecting async schema does not cause an unhandled rejection', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      try {
        const { result } = setup({ schema: asyncSchema(Promise.reject(new Error('late'))) }, VALID);
        expect(await saveWith(result)).toBe(false);
        await new Promise((r) => setTimeout(r, 0));
        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off('unhandledRejection', unhandled);
      }
    });
  });

  describe('a schema that throws (a bug, not an issue)', () => {
    it('sets saveError, resolves false, skips validate and the handler, and does not get stuck', async () => {
      const validate = vi.fn(() => ({}));
      const handler = vi.fn(async () => undefined);
      let broken = true;
      const schema: StandardSchemaLike = {
        '~standard': {
          validate: (value) => {
            if (broken) throw new Error('schema blew up');
            return { value };
          },
        },
      };
      const { result } = setup({ schema, validate }, VALID);
      expect(await saveWith(result, handler)).toBe(false);
      expect((result.current.saveError as Error).message).toBe('schema blew up');
      expect(validate).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
      expect(result.current.isSaving).toBe(false);
      expect(result.current.fieldErrors).toEqual({});
      broken = false;
      expect(await saveWith(result, handler)).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(result.current.saveError).toBeNull();
    });

    it('a throw of undefined is still reported as an Error', async () => {
      const schema: StandardSchemaLike = {
        '~standard': {
          validate: () => {
            throw undefined;
          },
        },
      };
      const { result } = setup({ schema }, VALID);
      expect(await saveWith(result)).toBe(false);
      expect(result.current.saveError).toBeInstanceOf(Error);
    });

    it('a non-conforming result (undefined) fails loudly as a saveError, it is never a success', async () => {
      const schema = { '~standard': { validate: () => undefined } } as unknown as StandardSchemaLike;
      const handler = vi.fn();
      const { result } = setup({ schema }, VALID);
      expect(await saveWith(result, handler)).toBe(false);
      expect(handler).not.toHaveBeenCalled();
      expect(result.current.saveError).toBeInstanceOf(TypeError);
    });

    it('a throwing schema clears the field and form errors of an earlier attempt', async () => {
      let mode: 'issues' | 'throw' = 'issues';
      const schema: StandardSchemaLike = {
        '~standard': {
          validate: () => {
            if (mode === 'throw') throw new Error('bug');
            return { issues: [{ message: 'Root' }, { message: 'X', path: ['supplier'] }] };
          },
        },
      };
      const { result } = setup({ schema }, VALID);
      await saveWith(result);
      mode = 'throw';
      await saveWith(result);
      expect(result.current.fieldErrors).toEqual({});
      expect(result.current.formErrors).toEqual([]);
      expect((result.current.saveError as Error).message).toBe('bug');
    });
  });
});
