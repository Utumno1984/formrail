// The internal fields of React Hook Form the adapter reads (QA #507, point 5), pinned against the installed version:
// a React Hook Form release that renames or reshapes them fails here, not silently in the consumers' forms (a
// baseline `{}` where every field is listed as added). The adapter reads exactly:
// - `control._defaultValues`: the defaults React Hook Form holds, an object REPLACED by every reset, by the `values`
//   prop and by `resetField` with a default, written IN PLACE when a field registers its own default;
// - `control._options.shouldUnregister`: the `shouldUnregister` option of `useForm`.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { act, render, renderHook } from '@testing-library/react';
import { useController, useForm, type Control } from 'react-hook-form';
import { useReactHookFormBinding } from './use-react-hook-form-binding';

type Invoice = { supplier: string; amount: string; ref?: string };
const SAVED: Invoice = { supplier: 'Acme', amount: '100' };

// Run from packages/pro (as public-api.test.tsx): jsdom's `import.meta.url` is not a file URL.
const PACKAGE = process.cwd();
const SOURCE = readFileSync(resolve(PACKAGE, 'src/integrations/react-hook-form/use-react-hook-form-binding.ts'), 'utf8');

describe('the internal fields of React Hook Form read by the adapter', () => {
  it('the adapter source reads these two internal fields and no other', () => {
    // The reads of the store (`form.control._x`), and every underscore name anywhere in the source (the guard).
    const reads = [...new Set([...SOURCE.matchAll(/form\.control\.(_[A-Za-z]+(?:\.[A-Za-z]+)?)/g)].map((match) => match[1]))].sort();
    expect(reads).toEqual(['_defaultValues', '_options.shouldUnregister']);
    const names = [...new Set(SOURCE.match(/\b_[A-Za-z]+\b/g) ?? [])].sort();
    expect(names).toEqual(['_defaultValues', '_options']);
  });

  it('the installed version is the tested minimum of the peer range', () => {
    const require = createRequire(resolve(PACKAGE, 'package.json'));
    const installed = (require('react-hook-form/package.json') as { version: string }).version;
    const pkg = JSON.parse(readFileSync(resolve(PACKAGE, 'package.json'), 'utf8')) as { peerDependencies: Record<string, string> };
    expect(pkg.peerDependencies['react-hook-form']).toBe(`^${installed}`);
  });

  it('control._defaultValues: a plain object with the defaults, a copy (not the object passed)', () => {
    const { result } = renderHook(() => useForm<Invoice>({ defaultValues: SAVED }));
    const defaults = result.current.control._defaultValues;
    expect(Object.getPrototypeOf(defaults)).toBe(Object.prototype);
    expect(defaults).toEqual(SAVED);
    expect(defaults).not.toBe(SAVED);
  });

  it('control._defaultValues is replaced by reset(data), by reset() and by resetField with a default; kept by keepDefaultValues', () => {
    const { result } = renderHook(() => useForm<Invoice>({ defaultValues: SAVED }));
    const first = result.current.control._defaultValues;
    act(() => result.current.reset({ ...SAVED, amount: '120' }, { keepDefaultValues: true }));
    expect(result.current.control._defaultValues).toBe(first);
    act(() => result.current.reset({ ...SAVED, amount: '130' }));
    const second = result.current.control._defaultValues;
    expect(second).not.toBe(first);
    expect(second).toEqual({ ...SAVED, amount: '130' });
    // `reset()` without values: the same defaults object (a discard, no rehydration).
    act(() => result.current.reset());
    expect(result.current.control._defaultValues).toBe(second);
  });

  it('resetField with a default replaces the object (needs a registered field)', () => {
    let form!: ReturnType<typeof useForm<Invoice>>;
    function Form() {
      form = useForm<Invoice>({ defaultValues: SAVED });
      return <input aria-label="Amount" {...form.register('amount')} />;
    }
    const view = render(<Form />);
    const before = form.control._defaultValues;
    act(() => form.resetField('amount', { defaultValue: '200' }));
    expect(form.control._defaultValues).not.toBe(before);
    expect(form.control._defaultValues).toEqual({ ...SAVED, amount: '200' });
    view.unmount();
  });

  it('the values prop replaces the object', () => {
    const { result, rerender } = renderHook((props: { values: Invoice }) => useForm<Invoice>({ values: props.values }), {
      initialProps: { values: SAVED },
    });
    const before = result.current.control._defaultValues;
    rerender({ values: { ...SAVED, amount: '300' } });
    expect(result.current.control._defaultValues).not.toBe(before);
    expect(result.current.control._defaultValues).toEqual({ ...SAVED, amount: '300' });
  });

  it('a Controller with its own defaultValue writes it into the same object (in place), not into a new one', async () => {
    let form!: ReturnType<typeof useForm<Invoice>>;
    function Ref({ control }: { control: Control<Invoice> }) {
      const { field } = useController({ control, name: 'ref', defaultValue: 'R-1' });
      return <input aria-label="Ref" {...field} value={field.value ?? ''} />;
    }
    function Form() {
      form = useForm<Invoice>({ defaultValues: SAVED });
      return <Ref control={form.control} />;
    }
    const view = render(<Form />);
    const before = form.control._defaultValues;
    expect(before).toEqual({ ...SAVED, ref: 'R-1' });
    await act(async () => {
      await form.trigger();
    });
    expect(form.control._defaultValues).toBe(before);
    view.unmount();
  });

  it('async defaultValues: an empty object while loading', () => {
    const { result } = renderHook(() => useForm<Invoice>({ defaultValues: () => new Promise<Invoice>(() => undefined) }));
    expect(result.current.control._defaultValues).toEqual({});
    expect(result.current.formState.isLoading).toBe(true);
  });

  it('control._options.shouldUnregister mirrors the useForm option', () => {
    expect(renderHook(() => useForm<Invoice>({ defaultValues: SAVED })).result.current.control._options.shouldUnregister).toBeUndefined();
    expect(renderHook(() => useForm<Invoice>({ defaultValues: SAVED, shouldUnregister: true })).result.current.control._options.shouldUnregister).toBe(true);
    expect(renderHook(() => useForm<Invoice>({ defaultValues: SAVED, shouldUnregister: false })).result.current.control._options.shouldUnregister).toBe(false);
  });
});

describe('a React Hook Form without those fields: a warning in development', () => {
  /** A real form whose `control` lacks or reshapes the internal fields (what a future release could do). */
  function brokenForm(patch: Record<string, unknown>) {
    const { result } = renderHook(() => useForm<Invoice>({ defaultValues: SAVED }));
    // React Hook Form defines these fields as getters: shadow them with plain data properties.
    const control = Object.create(result.current.control as object) as object;
    for (const [key, value] of Object.entries(patch)) Object.defineProperty(control, key, { value, enumerable: true });
    return { ...result.current, control } as unknown as ReturnType<typeof useForm<Invoice>>;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([
    ['_defaultValues missing', { _defaultValues: undefined }, '`control._defaultValues` is not an object'],
    ['_defaultValues not an object', { _defaultValues: 'x' }, '`control._defaultValues` is not an object'],
    ['_options missing', { _options: undefined }, '`control._options` is not an object'],
    ['_options.shouldUnregister not a boolean', { _options: { shouldUnregister: 'yes' } }, '`control._options.shouldUnregister` is not a boolean'],
  ])('%s: one clear warning per form, naming the field', (_name, patch, message) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const form = brokenForm(patch);
    const view = renderHook(() => {
      try {
        return useReactHookFormBinding(form);
      } catch {
        return null;
      }
    });
    view.rerender();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain(message);
    expect(String(warn.mock.calls[0]![0])).toContain('react-hook-form ^7.92.0');
    view.unmount();
  });

  it('no warning with the installed React Hook Form, and none in production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ok = renderHook(() => useReactHookFormBinding(useForm<Invoice>({ defaultValues: SAVED })));
    ok.unmount();
    vi.stubEnv('NODE_ENV', 'production');
    const form = brokenForm({ _defaultValues: undefined });
    const broken = renderHook(() => useReactHookFormBinding(form));
    broken.unmount();
    expect(warn).not.toHaveBeenCalled();
  });
});
