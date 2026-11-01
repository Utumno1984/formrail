import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profiler, useMemo, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { isClearing, withoutPaths, type FieldErrors } from './field-errors';
import type { StandardSchemaIssue, StandardSchemaLike } from './standard-schema';
import { useFocusFirstInvalidField } from './use-focus-first-invalid-field';
import { useObjectPageForm, type UseObjectPageFormOptions } from './use-object-page-form';

const scrollIntoView = vi.fn();

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  cleanup();
  scrollIntoView.mockReset();
  vi.restoreAllMocks();
});

describe('withoutPaths', () => {
  it('removes a path and its descendants, never a sibling sharing a prefix nor an ancestor', () => {
    const errors: FieldErrors = { lines: 'L', 'lines.0.qty': 'Q0', 'lines.10.qty': 'Q10', linesTotal: 'T', 'lines.1.qty': 'Q1' };
    expect(withoutPaths(errors, ['lines'])).toEqual({ linesTotal: 'T' });
    // `lines.1` removes `lines.1.qty` but not `lines.10.qty`
    expect(withoutPaths(errors, ['lines.1'])).toEqual({ lines: 'L', 'lines.0.qty': 'Q0', 'lines.10.qty': 'Q10', linesTotal: 'T' });
    expect(withoutPaths(errors, ['lines.1.qty'])).toEqual({ lines: 'L', 'lines.0.qty': 'Q0', 'lines.10.qty': 'Q10', linesTotal: 'T' });
  });

  it('keeps the rest and marks the new object as a clearing (never the input)', () => {
    const errors = { address: 'A', 'address.city': 'C', 'lines.0.qty': 'Q', name: 'N' };
    const next = withoutPaths(errors, ['address', 'name']);
    expect(next).toEqual({ 'lines.0.qty': 'Q' });
    expect(isClearing(next)).toBe(true);
    expect(isClearing(errors)).toBe(false);
  });

  it('returns the same object when nothing is removed', () => {
    const errors = { name: 'N' };
    expect(withoutPaths(errors, ['amount'])).toBe(errors);
    expect(withoutPaths(errors, [])).toBe(errors);
    expect(isClearing(errors)).toBe(false);
  });
});

type Order = {
  name: string;
  amount: number;
  address: { city: string; zip: string };
  lines: { qty: string }[];
  'address.zip'?: string;
};
const BASE: Order = { name: '', amount: 0, address: { city: '', zip: '' }, lines: [{ qty: '' }, { qty: '' }] };
const ALL: FieldErrors = {
  name: 'Name',
  amount: 'Amount',
  address: 'Address',
  'address.city': 'City',
  'lines.0.qty': 'Qty 0',
  'lines.1.qty': 'Qty 1',
};

function setup(options?: Partial<UseObjectPageFormOptions<Order>>) {
  return renderHook((props: UseObjectPageFormOptions<Order>) => useObjectPageForm<Order>(props), {
    initialProps: { baseline: BASE, validate: () => ALL, ...options } as UseObjectPageFormOptions<Order>,
  });
}

async function fail(result: ReturnType<typeof setup>['result']) {
  await act(async () => {
    expect(await result.current.save(async () => undefined)).toBe(false);
  });
}

describe('useObjectPageForm: per-path clearing of fieldErrors', () => {
  it('setValue removes only the error of the written path', async () => {
    const { result } = setup();
    await fail(result);
    act(() => result.current.setValue('name', 'ACME'));
    expect(result.current.fieldErrors).toEqual({
      amount: 'Amount',
      address: 'Address',
      'address.city': 'City',
      'lines.0.qty': 'Qty 0',
      'lines.1.qty': 'Qty 1',
    });
  });

  it('setValue removes the descendants too: writing lines clears every lines.* error', async () => {
    const { result } = setup();
    await fail(result);
    act(() => result.current.setValue('lines', [{ qty: '1' }, { qty: '' }]));
    expect(result.current.fieldErrors).toEqual({ name: 'Name', amount: 'Amount', address: 'Address', 'address.city': 'City' });
  });

  it('writing the parent removes the parent and its children', async () => {
    const { result } = setup();
    await fail(result);
    act(() => result.current.setValue('address', { city: 'Roma', zip: '' }));
    expect(result.current.fieldErrors).toEqual({ name: 'Name', amount: 'Amount', 'lines.0.qty': 'Qty 0', 'lines.1.qty': 'Qty 1' });
  });

  it('an error on an ancestor path stays when a path below it is written', async () => {
    // `address.zip` is a (dotted) top-level key: writing it is "writing a child of address".
    const { result } = setup({ validate: () => ({ address: 'Address', 'address.zip': 'Zip' }) });
    await fail(result);
    act(() => result.current.setValue('address.zip', '00100'));
    expect(result.current.fieldErrors).toEqual({ address: 'Address' });
  });

  it('setValues clears the union of its changed keys, with keys both with and without an error', async () => {
    const { result } = setup({ validate: () => ({ name: 'Name', 'lines.0.qty': 'Qty 0', 'address.city': 'City' }) });
    await fail(result);
    act(() => result.current.setValues({ name: 'ACME', amount: 5, lines: [{ qty: '1' }] }));
    expect(result.current.fieldErrors).toEqual({ 'address.city': 'City' });
    expect(result.current.values.amount).toBe(5);
  });

  it('a patch key whose value did not change clears nothing, even with an error', async () => {
    const { result } = setup();
    await fail(result);
    // `name` is set to the value it already has; `amount` changes.
    act(() => result.current.setValues({ name: '', amount: 3 }));
    expect(result.current.fieldErrors.name).toBe('Name');
    expect(result.current.fieldErrors.amount).toBeUndefined();
    const after = result.current.fieldErrors;
    act(() => result.current.setValue('name', ''));
    expect(result.current.fieldErrors).toBe(after);
  });

  it('a setValue that clears nothing does not re-render (same value, or a key without errors)', async () => {
    let renders = 0;
    const { result } = renderHook(
      () => {
        renders += 1;
        return useObjectPageForm<Order>({ baseline: BASE, validate: () => ({ name: 'Name' }) });
      },
    );
    await fail(result);
    const before = result.current.fieldErrors;
    const count = renders;
    act(() => result.current.setValue('name', '')); // same value: no change at all
    expect(renders).toBe(count);
    expect(result.current.fieldErrors).toBe(before);
    act(() => result.current.setValue('amount', 1)); // real change, no error on amount
    expect(renders).toBe(count + 1);
    expect(result.current.fieldErrors).toBe(before);
  });

  it('when the last error is cleared, fieldErrors goes back to the shared empty object', async () => {
    const { result } = setup({ validate: () => ({ name: 'Name', amount: 'Amount' }) });
    const empty = result.current.fieldErrors;
    await fail(result);
    act(() => result.current.setValue('name', 'x'));
    act(() => result.current.setValue('amount', 1));
    expect(result.current.fieldErrors).toBe(empty);
  });

  it('several setValue in one event compose their clearings', async () => {
    const { result } = setup({ validate: () => ({ name: 'Name', amount: 'Amount', 'address.city': 'City' }) });
    await fail(result);
    act(() => {
      result.current.setValue('name', 'x');
      result.current.setValue('amount', 1);
    });
    expect(result.current.fieldErrors).toEqual({ 'address.city': 'City' });
  });

  it.each<[string, (r: ReturnType<typeof setup>['result']) => void]>([
    ['reset()', (r) => r.current.reset()],
    ['reset(newBaseline)', (r) => r.current.reset({ ...BASE, name: 'Loaded' })],
  ])('%s clears every error, also after a partial clearing in the same event', async (_label, doReset) => {
    const { result } = setup();
    const empty = result.current.fieldErrors;
    await fail(result);
    act(() => {
      result.current.setValue('name', 'x');
      doReset(result);
    });
    expect(result.current.fieldErrors).toBe(empty);
    // and in the other order
    await fail(result);
    act(() => {
      doReset(result);
      result.current.setValue('name', 'y');
    });
    expect(result.current.fieldErrors).toBe(empty);
  });

  it('a successful save clears every error left after a partial clearing', async () => {
    let strict = true;
    const { result } = setup({ validate: () => (strict ? ALL : {}) });
    await fail(result);
    act(() => result.current.setValue('name', 'x'));
    expect(Object.keys(result.current.fieldErrors).length).toBeGreaterThan(0);
    strict = false;
    await act(async () => {
      expect(await result.current.save(async () => undefined)).toBe(true);
    });
    expect(result.current.fieldErrors).toEqual({});
  });

  it('a new save recomputes everything, also the errors cleared by an edit', async () => {
    const { result } = setup();
    await fail(result);
    act(() => result.current.setValue('name', 'x'));
    await fail(result);
    expect(result.current.fieldErrors).toEqual(ALL);
  });

  it('a setValue right before save in the same event: the save validates the latest values', async () => {
    const validate = vi.fn((v: Order) => (v.name === '' ? { name: 'Name', amount: 'Amount' } : { amount: 'Amount' }));
    const { result } = setup({ validate });
    await fail(result);
    await act(async () => {
      result.current.setValue('name', 'x');
      expect(await result.current.save(async () => undefined)).toBe(false);
    });
    expect(validate).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'x' }));
    expect(result.current.fieldErrors).toEqual({ amount: 'Amount' });
  });

  it('typing while a save is in flight leaves no stale fieldErrors behind', async () => {
    let strict = true;
    const { result } = setup({ validate: () => (strict ? { name: 'Name' } : {}) });
    await fail(result);
    strict = false;
    let release!: () => void;
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.save(() => new Promise<void>((resolve) => (release = resolve)));
    });
    expect(result.current.isSaving).toBe(true);
    expect(result.current.fieldErrors).toEqual({}); // cleared by the passing validate
    act(() => result.current.setValue('name', 'typed'));
    expect(result.current.fieldErrors).toEqual({});
    await act(async () => {
      release();
      expect(await pending).toBe(true);
    });
    expect(result.current.fieldErrors).toEqual({});
    expect(result.current.isDirty).toBe(true); // the edit made while saving stays
  });
});

type Abc = { a: string; b: string; c: string };
type ThreeFieldsForm = ReturnType<typeof useObjectPageForm<Abc>>;

const ABC_SCHEMA: StandardSchemaLike = {
  '~standard': {
    validate: (value: unknown) => {
      const v = value as Abc;
      const issues = (['a', 'b', 'c'] as const).filter((k) => v[k] === '').map((k) => ({ message: `${k.toUpperCase()} is required`, path: [k] }));
      return issues.length > 0 ? { issues } : { value };
    },
  },
};

/**
 * Real DOM: a form with three invalid fields wired to both hooks. `derived` hands the focus hook a
 * `useMemo` copy with translated messages (not the form's own object); `withTrigger` passes
 * `trigger: form.validationAttempt`.
 */
function ThreeFields({
  onRender,
  formRef,
  derived = false,
  withTrigger = false,
  withSchema = false,
}: {
  onRender?: () => void;
  formRef?: { current: ThreeFieldsForm | null };
  derived?: boolean;
  withTrigger?: boolean;
  /** The same rule as a Standard Schema instead of `validate`. */
  withSchema?: boolean;
}) {
  const form = useObjectPageForm<Abc>({
    baseline: { a: '', b: '', c: '' },
    ...(withSchema
      ? { schema: ABC_SCHEMA }
      : {
          validate: (v: Abc) => {
            const errors: Record<string, string | undefined> = {};
            for (const k of ['a', 'b', 'c'] as const) errors[k] = v[k] === '' ? `${k.toUpperCase()} is required` : undefined;
            return errors;
          },
        }),
  });
  if (formRef) formRef.current = form;
  const ref = useRef<HTMLFormElement>(null);
  const translated = useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const [path, message] of Object.entries(form.fieldErrors)) out[path] = message?.replace('is required', '(translated)');
    return out;
  }, [form.fieldErrors]);
  useFocusFirstInvalidField({
    containerRef: ref,
    fieldErrors: derived ? translated : form.fieldErrors,
    trigger: withTrigger ? form.validationAttempt : undefined,
  });
  return (
    <Profiler id="form" onRender={() => onRender?.()}>
      <form
        ref={ref}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void form.save(async () => undefined);
        }}
      >
        {(['a', 'b', 'c'] as const).map((k) => (
          <Field key={k} label={`Field ${k.toUpperCase()}`} name={k} error={form.fieldErrors[k]}>
            <Input value={form.values[k]} onChange={(e) => form.setValue(k, e.target.value)} />
          </Field>
        ))}
        <button type="submit">Save</button>
      </form>
    </Profiler>
  );
}

describe('per-path clearing with useFocusFirstInvalidField (real DOM)', () => {
  it('typing in an invalid field clears only its error and never moves the focus', async () => {
    const user = userEvent.setup();
    render(<ThreeFields />);
    const a = screen.getByLabelText('Field A');
    const b = screen.getByLabelText('Field B');
    const c = screen.getByLabelText('Field C');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(a).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    await user.keyboard('x');
    expect(a).toHaveFocus();
    expect(a).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('A is required')).toBeNull();
    expect(b).toHaveAttribute('aria-invalid', 'true');
    expect(c).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('B is required')).toBeVisible();
    expect(screen.getByText('C is required')).toBeVisible();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    // Typing in C (not the first invalid): the focus stays in C, not on B.
    await user.click(c);
    await user.keyboard('y');
    expect(c).toHaveFocus();
    expect(b).toHaveAttribute('aria-invalid', 'true');
    expect(c).not.toHaveAttribute('aria-invalid', 'true');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('a second failed save with identical remaining errors moves the focus again', async () => {
    const user = userEvent.setup();
    render(<ThreeFields />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.keyboard('x'); // clears A, B and C stay
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByLabelText('Field B')).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: 'Save' })); // identical errors, again
    expect(screen.getByLabelText('Field B')).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(3);
  });

  it('writing the value a field already has neither clears its error nor re-renders', async () => {
    const onRender = vi.fn();
    const formRef: { current: ThreeFieldsForm | null } = { current: null };
    const user = userEvent.setup();
    render(<ThreeFields onRender={onRender} formRef={formRef} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const renders = onRender.mock.calls.length;
    act(() => formRef.current!.setValue('b', '')); // e.g. a "restore" to the current value
    expect(onRender).toHaveBeenCalledTimes(renders);
    expect(screen.getByLabelText('Field B')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('B is required')).toBeVisible();
    expect(screen.getByLabelText('Field A')).toHaveFocus();
  });
});

describe('validationAttempt', () => {
  it('starts at 0 and grows by one per failed validate only, also with identical errors', async () => {
    let strict = true;
    const { result } = setup({ validate: () => (strict ? { name: 'Name', amount: 'Amount' } : {}) });
    expect(result.current.validationAttempt).toBe(0);
    await fail(result);
    expect(result.current.validationAttempt).toBe(1);
    await fail(result);
    expect(result.current.validationAttempt).toBe(2);
    act(() => result.current.setValue('name', 'x')); // a clearing
    act(() => result.current.setValue('name', 'x')); // nothing
    act(() => result.current.reset());
    act(() => result.current.reset({ ...BASE }));
    expect(result.current.validationAttempt).toBe(2);
    strict = false;
    await act(async () => {
      expect(await result.current.save(async () => undefined)).toBe(true); // passing validate
    });
    await act(async () => {
      await result.current.save(async () => {
        throw new Error('net'); // server failure
      });
    });
    expect(result.current.validationAttempt).toBe(2);
  });

  it('a throwing validate is a saveError, not a failed validation: the counter does not move', async () => {
    const { result } = setup({
      validate: () => {
        throw new Error('boom');
      },
    });
    await fail(result);
    expect(result.current.validationAttempt).toBe(0);
  });

  it('a failed schema grows it by one, also with only root issues and with identical issues', async () => {
    let issues: StandardSchemaIssue[] = [{ message: 'Name', path: ['name'] }];
    const validate = vi.fn(() => ({}));
    const { result } = setup({ schema: handSchema(() => issues), validate });
    await fail(result);
    expect(result.current.validationAttempt).toBe(1);
    await fail(result); // identical issues
    expect(result.current.validationAttempt).toBe(2);
    issues = [{ message: 'Root' }]; // only root issues: fieldErrors empty, formErrors not
    await fail(result);
    expect(result.current.fieldErrors).toEqual({});
    expect(result.current.formErrors).toEqual(['Root']);
    expect(result.current.validationAttempt).toBe(3);
    await fail(result); // identical root issues
    expect(result.current.validationAttempt).toBe(4);
    expect(validate).not.toHaveBeenCalled(); // skipped on a failed schema: counted once, not twice
  });

  it('a passing schema then a failing validate grows it by one (one attempt, one step)', async () => {
    const { result } = setup({ schema: handSchema(() => []), validate: () => ({ name: 'Name' }) });
    await fail(result);
    expect(result.current.validationAttempt).toBe(1);
  });

  it('a throwing schema is a saveError: the counter does not move', async () => {
    const schema: StandardSchemaLike = {
      '~standard': {
        validate: () => {
          throw new Error('boom');
        },
      },
    };
    const { result } = setup({ schema, validate: undefined });
    await fail(result);
    expect(result.current.saveError).toEqual(new Error('boom'));
    expect(result.current.validationAttempt).toBe(0);
  });

  it('an asynchronous schema is a saveError: the counter does not move', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const schema: StandardSchemaLike = { '~standard': { validate: () => Promise.resolve({ issues: [{ message: 'X' }] }) } };
    const { result } = setup({ schema, validate: undefined });
    await fail(result);
    expect(result.current.saveError).toBeInstanceOf(Error);
    expect(result.current.formErrors).toEqual([]);
    expect(result.current.validationAttempt).toBe(0);
  });
});

/** A hand-written synchronous Standard Schema: `check` returns the issues (none = valid). */
function handSchema(check: (value: Order) => StandardSchemaIssue[]): StandardSchemaLike {
  return {
    '~standard': {
      validate: (value: unknown) => {
        const issues = check(value as Order);
        return issues.length > 0 ? { issues } : { value };
      },
    },
  };
}

describe('per-path clearing and formErrors (root issues of a schema)', () => {
  const FIELD_AND_ROOT: StandardSchemaIssue[] = [
    { message: 'Name', path: ['name'] },
    { message: 'City', path: ['address', 'city'] },
    { message: 'Root' },
  ];

  it('a clearing that empties fieldErrors clears formErrors too: both back to the shared empty values', async () => {
    const { result } = setup({ schema: handSchema(() => FIELD_AND_ROOT), validate: undefined });
    const emptyFields = result.current.fieldErrors;
    const emptyForm = result.current.formErrors;
    await fail(result);
    expect(result.current.formErrors).toEqual(['Root']);
    act(() => result.current.setValue('name', 'ACME'));
    act(() => result.current.setValue('address', { city: 'Rome', zip: '' }));
    expect(result.current.fieldErrors).toBe(emptyFields);
    expect(result.current.formErrors).toBe(emptyForm);
    expect(result.current.formErrors).toEqual([]);
  });

  it('setValues clearing every field error at once clears formErrors in the same update', async () => {
    const { result } = setup({ schema: handSchema(() => FIELD_AND_ROOT), validate: undefined });
    const emptyFields = result.current.fieldErrors;
    await fail(result);
    act(() => result.current.setValues({ name: 'ACME', address: { city: 'Rome', zip: '' } }));
    expect(result.current.fieldErrors).toBe(emptyFields);
    expect(result.current.formErrors).toEqual([]);
  });

  it('a partial clearing leaves formErrors unchanged (same array)', async () => {
    const { result } = setup({ schema: handSchema(() => FIELD_AND_ROOT), validate: undefined });
    await fail(result);
    const formErrors = result.current.formErrors;
    act(() => result.current.setValue('name', 'ACME'));
    expect(result.current.fieldErrors).toEqual({ 'address.city': 'City' });
    expect(result.current.formErrors).toBe(formErrors);
    expect(result.current.formErrors).toEqual(['Root']);
  });

  it('an edit of a field without errors leaves both untouched (same objects)', async () => {
    const { result } = setup({ schema: handSchema(() => FIELD_AND_ROOT), validate: undefined });
    await fail(result);
    const { fieldErrors, formErrors } = result.current;
    act(() => result.current.setValue('amount', 5));
    expect(result.current.fieldErrors).toBe(fieldErrors);
    expect(result.current.formErrors).toBe(formErrors);
  });

  it('only root issues: a real edit clears them, writing the same value does not', async () => {
    const { result } = setup({ schema: handSchema(() => [{ message: 'Root' }]), validate: undefined });
    const emptyFields = result.current.fieldErrors;
    await fail(result);
    const formErrors = result.current.formErrors;
    act(() => result.current.setValue('name', '')); // same value: no change, no clearing
    expect(result.current.formErrors).toBe(formErrors);
    act(() => result.current.setValue('amount', 3));
    expect(result.current.formErrors).toEqual([]);
    expect(result.current.fieldErrors).toBe(emptyFields);
  });

  it.each<[string, (r: ReturnType<typeof setup>['result']) => void]>([
    ['reset()', (r) => r.current.reset()],
    ['reset(newBaseline)', (r) => r.current.reset({ ...BASE, name: 'Loaded' })],
  ])('%s after a partial clearing clears fieldErrors and formErrors', async (_label, doReset) => {
    const { result } = setup({ schema: handSchema(() => FIELD_AND_ROOT), validate: undefined });
    const emptyFields = result.current.fieldErrors;
    const emptyForm = result.current.formErrors;
    await fail(result);
    act(() => result.current.setValue('name', 'ACME'));
    act(() => doReset(result));
    expect(result.current.fieldErrors).toBe(emptyFields);
    expect(result.current.formErrors).toBe(emptyForm);
  });

  it('a successful save after a partial clearing clears fieldErrors and formErrors', async () => {
    let strict = true;
    const { result } = setup({ schema: handSchema(() => (strict ? FIELD_AND_ROOT : [])), validate: undefined });
    const emptyFields = result.current.fieldErrors;
    const emptyForm = result.current.formErrors;
    await fail(result);
    act(() => result.current.setValue('name', 'ACME'));
    strict = false;
    await act(async () => {
      expect(await result.current.save(async () => undefined)).toBe(true);
    });
    expect(result.current.fieldErrors).toBe(emptyFields);
    expect(result.current.formErrors).toBe(emptyForm);
  });
});

describe('a derived fieldErrors object (useMemo) with the explicit trigger (real DOM)', () => {
  it('without trigger the derived object re-focuses while typing (why the trigger exists)', async () => {
    const user = userEvent.setup();
    render(<ThreeFields derived />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByLabelText('Field C'));
    await user.keyboard('y');
    expect(screen.getByLabelText('Field A')).toHaveFocus(); // documented limit of the identity trigger
  });

  it('with trigger: the focus stays in C while typing and goes back to A on an identical failed save', async () => {
    const user = userEvent.setup();
    render(<ThreeFields derived withTrigger />);
    const a = screen.getByLabelText('Field A');
    const c = screen.getByLabelText('Field C');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(a).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    await user.click(c);
    await user.keyboard('yz');
    expect(c).toHaveFocus();
    expect(c).toHaveValue('yz');
    expect(c).not.toHaveAttribute('aria-invalid', 'true');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(a).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: 'Save' })); // identical errors (A, B)
    expect(a).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(3);
  });

  it('with trigger and a failing schema: every failed save moves the focus, typing never does', async () => {
    const user = userEvent.setup();
    render(<ThreeFields derived withTrigger withSchema />);
    const a = screen.getByLabelText('Field A');
    const c = screen.getByLabelText('Field C');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(a).toHaveFocus();
    expect(a).toHaveAttribute('aria-invalid', 'true');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    await user.click(c);
    await user.keyboard('y');
    expect(c).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(a).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: 'Save' })); // identical schema issues (A, B)
    expect(a).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(3);
  });

  it('with trigger on the form object itself: same behavior (typing never re-focuses)', async () => {
    const user = userEvent.setup();
    render(<ThreeFields withTrigger />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByLabelText('Field B'));
    await user.keyboard('q');
    expect(screen.getByLabelText('Field B')).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});

describe('a failed save and an edit of an invalid field in the same event (real DOM)', () => {
  it.each<[string, boolean, string]>([
    // One batch: the errors of the failed attempt never render on their own, only the clearing
    // that follows. The identity trigger sees a clearing and stays put (documented); the counter
    // moved, so `trigger` focuses the first field still invalid.
    ['without trigger the focus does not move (documented)', false, 'Elsewhere'],
    ['with trigger the focus goes to the first field still invalid', true, 'Field B'],
  ])('%s', async (_label, withTrigger, focused) => {
    const formRef: { current: ThreeFieldsForm | null } = { current: null };
    render(
      <>
        <button type="button">Elsewhere</button>
        <ThreeFields formRef={formRef} withTrigger={withTrigger} />
      </>,
    );
    screen.getByRole('button', { name: 'Elsewhere' }).focus();
    await act(async () => {
      const pending = formRef.current!.save(async () => undefined);
      formRef.current!.setValue('a', 'x');
      expect(await pending).toBe(false);
    });
    expect(screen.getByLabelText('Field A')).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Field B')).toHaveAttribute('aria-invalid', 'true');
    const target = focused === 'Elsewhere' ? screen.getByRole('button', { name: 'Elsewhere' }) : screen.getByLabelText(focused);
    expect(target).toHaveFocus();
  });
});
