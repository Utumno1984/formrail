import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { useRef, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { invalidPaths, type FieldErrors } from './field-errors';
import { useFocusFirstInvalidField } from './use-focus-first-invalid-field';
import { useObjectPageForm } from './use-object-page-form';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Form({ errors, children }: { errors: FieldErrors; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusFirstInvalidField({ containerRef: ref, fieldErrors: errors });
  return <div ref={ref}>{children}</div>;
}

describe('invalidPaths', () => {
  it('returns the keys whose value is not undefined, in insertion order', () => {
    expect(invalidPaths({ a: 'x', b: undefined, 'address.city': 'y', 'lines.0.qty': '' })).toEqual([
      'a',
      'address.city',
      'lines.0.qty',
    ]);
  });
  it('returns nothing for an empty object or only undefined values', () => {
    expect(invalidPaths({})).toEqual([]);
    expect(invalidPaths({ a: undefined })).toEqual([]);
  });
});

describe('useObjectPageForm with nested paths', () => {
  type V = { name: string; address: { city: string }; lines: { qty: string }[] };
  const baseline: V = { name: '', address: { city: '' }, lines: [{ qty: '' }, { qty: '' }] };

  it('keeps dot paths (also ones that are not keys of Values) and drops undefined values', async () => {
    const { result } = renderHook(() =>
      useObjectPageForm<V>({
        baseline,
        validate: () => ({ 'address.city': 'Required', 'lines.0.qty': 'Required', 'lines.1.qty': undefined, nope: 'x' }),
      }),
    );
    let ok = true;
    await act(async () => {
      ok = await result.current.save(async () => undefined);
    });
    expect(ok).toBe(false);
    expect(result.current.fieldErrors).toEqual({ 'address.city': 'Required', 'lines.0.qty': 'Required', nope: 'x' });
    expect('lines.1.qty' in result.current.fieldErrors).toBe(false);
  });

  it('accepts a legacy top-level Partial<Record<keyof Values, string>>', async () => {
    const { result } = renderHook(() =>
      useObjectPageForm<V>({ baseline, validate: (v): Partial<Record<keyof V, string>> => (v.name === '' ? { name: 'Required' } : {}) }),
    );
    await act(async () => {
      await result.current.save(async () => undefined);
    });
    expect(result.current.fieldErrors).toEqual({ name: 'Required' });
  });

  it('a new object is produced at every failed save, even with identical content', async () => {
    const { result } = renderHook(() => useObjectPageForm<V>({ baseline, validate: () => ({ 'address.city': 'Required' }) }));
    await act(async () => {
      await result.current.save(async () => undefined);
    });
    const first = result.current.fieldErrors;
    await act(async () => {
      await result.current.save(async () => undefined);
    });
    expect(result.current.fieldErrors).not.toBe(first);
    expect(result.current.fieldErrors).toEqual(first);
  });

  it('only undefined values count as valid: the handler runs', async () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useObjectPageForm<V>({ baseline, validate: () => ({ 'address.city': undefined }) }));
    await act(async () => {
      expect(await result.current.save(handler)).toBe(true);
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('useFocusFirstInvalidField with nested paths', () => {
  const nested = (
    <>
      <Field label="City" name="address.city">
        <Input />
      </Field>
      <Field label="Qty 1" name="lines.1.qty">
        <Input />
      </Field>
      <Field label="Qty 10" name="lines.10.qty">
        <Input />
      </Field>
    </>
  );

  it('matches the exact path, not a prefix (lines.1.qty vs lines.10.qty)', () => {
    render(<Form errors={{ 'lines.10.qty': 'x' }}>{nested}</Form>);
    expect(screen.getByRole('textbox', { name: 'Qty 10' })).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'Qty 1' })).not.toHaveFocus();
  });

  it('respects the DOM order, not the key order', () => {
    render(<Form errors={{ 'lines.10.qty': 'x', 'lines.1.qty': 'x', 'address.city': 'x' }}>{nested}</Form>);
    expect(screen.getByRole('textbox', { name: 'City' })).toHaveFocus();
  });

  it('ignores undefined values uniformly', () => {
    render(<Form errors={{ 'address.city': undefined, 'lines.1.qty': 'x' }}>{nested}</Form>);
    expect(screen.getByRole('textbox', { name: 'Qty 1' })).toHaveFocus();
  });

  it('an error on an intermediate path with no control of that name reports once in dev and focuses nothing', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Form errors={{ address: 'Invalid address' }}>{nested}</Form>);
    expect(document.body).toHaveFocus();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('only undefined values: no focus and no console.error', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Form errors={{ 'address.city': undefined }}>{nested}</Form>);
    expect(document.body).toHaveFocus();
    expect(error).not.toHaveBeenCalled();
  });
});
