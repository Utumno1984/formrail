// `useReactHookFormBinding` (ticket #507) on React 18: hydration after the mount and a rebase, with a real React
// Hook Form, under `createRoot` and the legacy `ReactDOM.render` (no automatic batching outside React events).
import { act, useLayoutEffect, version, type ReactElement } from 'react';
import * as ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { useChangeSummary, useFormRebase, type RebaseFormBinding, type UseFormRebaseReturn } from '../../packages/pro/src/engine';
import { useReactHookFormBinding } from '../../packages/pro/src/react-hook-form';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Invoice = { supplier: string; amount: string; notes: string };
const EMPTY: Invoice = { supplier: '', amount: '', notes: '' };
const DATA: Invoice = { supplier: 'Acme', amount: '100', notes: '' };

interface Seen {
  form: UseFormReturn<Invoice>;
  binding: RebaseFormBinding<Invoice>;
  entries: string[];
  rebase: UseFormRebaseReturn<Invoice>;
  amountDom: string | undefined;
}

function Probe({ seen }: { seen: Seen[] }) {
  const form = useForm<Invoice>({ defaultValues: EMPTY });
  const binding = useReactHookFormBinding(form);
  const { entries } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
  const rebase = useFormRebase(binding);
  useLayoutEffect(() => {
    const amountDom = (document.querySelector('input[name="amount"]') as HTMLInputElement | null)?.value;
    seen.push({ form, binding, entries: entries.map((entry) => entry.path), rebase, amountDom });
  });
  return (
    <form>
      <input {...form.register('supplier')} />
      <input {...form.register('amount')} />
      <input {...form.register('notes')} />
    </form>
  );
}

const legacyRender = (ReactDOM as unknown as { render: (el: ReactElement, c: Element) => void }).render;
const legacyUnmount = (ReactDOM as unknown as { unmountComponentAtNode: (c: Element) => void }).unmountComponentAtNode;

describe('useReactHookFormBinding on React 18', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('runs against React 18', () => {
    expect(version.startsWith('18.')).toBe(true);
  });

  it.each(['createRoot', 'legacy render'] as const)('%s: hydration without entries, a rebase without false dirty or echo', (mode) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // legacy render deprecation notice
    const container = document.createElement('div');
    document.body.appendChild(container);
    const seen: Seen[] = [];
    const root = mode === 'createRoot' ? createRoot(container) : undefined;
    act(() => {
      if (root) root.render(<Probe seen={seen} />);
      else legacyRender(<Probe seen={seen} />, container);
    });
    const last = () => seen.at(-1)!;
    const types: unknown[] = [];
    const watched = last().form.watch((_values, info) => types.push(info.type));

    act(() => last().form.reset(DATA));
    expect(seen.every((s) => s.entries.length === 0)).toBe(true);
    expect(last().binding.values).toBe(last().binding.baseline);
    expect(last().form.formState.isDirty).toBe(false);

    const input = container.querySelector('input[name="amount"]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '120');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(last().entries).toEqual(['amount']);

    const from = seen.length;
    const incoming: Invoice = { ...DATA, supplier: 'Acme Ltd' };
    act(() => last().rebase.rebase(incoming));
    const after = seen.slice(from);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((s) => s.binding.values !== incoming && s.amountDom === '120' && s.entries.join() === 'amount')).toBe(true);
    expect(last().binding.baseline).toBe(incoming);
    expect(last().form.getValues()).toEqual({ ...incoming, amount: '120' });
    expect(last().form.formState.dirtyFields).toEqual({ amount: true });
    expect(types.filter((type) => type === 'change')).toEqual(['change']);
    watched.unsubscribe();
    act(() => {
      if (root) root.unmount();
      else legacyUnmount(container);
    });
  });

  it('legacy render, binding.reset(x) outside any batch (an async save handler): no commit shows a baseline other than the old one or x', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // legacy render notice, update outside act
    const container = document.createElement('div');
    document.body.appendChild(container);
    const seen: Seen[] = [];
    act(() => legacyRender(<Probe seen={seen} />, container));
    const before = seen.at(-1)!.binding.baseline;
    const from = seen.length;
    const x: Invoice = { supplier: 'Saved', amount: '7', notes: 'n' };
    // Legacy mode renders synchronously on every update made outside a React batch.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    try {
      seen.at(-1)!.binding.reset(x);
    } finally {
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    }
    const after = seen.slice(from);
    expect(after.length).toBeGreaterThan(0);
    expect(after.filter((s) => s.binding.baseline !== before && s.binding.baseline !== x)).toEqual([]);
    expect(seen.at(-1)!.binding.baseline).toBe(x);
    expect(seen.at(-1)!.binding.values).toBe(x);
    act(() => legacyUnmount(container));
  });
});
