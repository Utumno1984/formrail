// `useTanStackFormBinding` (ticket #508) on React 18: hydration after the mount and a rebase, with a real TanStack
// Form, under `createRoot` and the legacy `ReactDOM.render` (no automatic batching outside React events).
import { act, useLayoutEffect, useState, version, type ReactElement } from 'react';
import * as ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import { useForm } from '@tanstack/react-form';
import { useChangeSummary, useFormRebase, type RebaseFormBinding, type UseFormRebaseReturn } from '../../packages/pro/src/engine';
import { useTanStackFormBinding, type TanStackFormOf } from '../../packages/pro/src/tanstack-form';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Invoice = { supplier: string; amount: string; notes: string };
const EMPTY: Invoice = { supplier: '', amount: '', notes: '' };
const DATA: Invoice = { supplier: 'Halden Tools', amount: '100', notes: '' };

interface Seen {
  form: TanStackFormOf<Invoice>;
  binding: RebaseFormBinding<Invoice>;
  entries: string[];
  rebase: UseFormRebaseReturn<Invoice>;
  amountDom: string | undefined;
}

/** Loads a record into the mounted probe (its `setState`). */
let loadRecord!: (record: Invoice) => void;

function Probe({ seen, onFieldChange }: { seen: Seen[]; onFieldChange: (name: string) => void }) {
  // The loaded record, as the `defaultValues` of `useForm` (TanStack Form takes them on a form not touched).
  const [record, setRecord] = useState<Invoice | null>(null);
  loadRecord = setRecord;
  const form = useForm({ defaultValues: record ?? EMPTY });
  const binding = useTanStackFormBinding(form);
  const { entries } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
  const rebase = useFormRebase(binding);
  useLayoutEffect(() => {
    const amountDom = (document.querySelector('input[name="amount"]') as HTMLInputElement | null)?.value;
    seen.push({ form, binding, entries: entries.map((entry) => entry.path), rebase, amountDom });
  });
  return (
    <form>
      {(['supplier', 'amount', 'notes'] as const).map((name) => (
        <form.Field key={name} name={name} listeners={{ onChange: () => onFieldChange(name) }}>
          {(field) => <input name={name} value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} />}
        </form.Field>
      ))}
    </form>
  );
}

const legacyRender = (ReactDOM as unknown as { render: (el: ReactElement, c: Element) => void }).render;
const legacyUnmount = (ReactDOM as unknown as { unmountComponentAtNode: (c: Element) => void }).unmountComponentAtNode;

describe('useTanStackFormBinding on React 18', () => {
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
    const changes: string[] = [];
    const root = mode === 'createRoot' ? createRoot(container) : undefined;
    const element = <Probe seen={seen} onFieldChange={(name) => changes.push(name)} />;
    act(() => {
      if (root) root.render(element);
      else legacyRender(element, container);
    });
    const last = () => seen.at(-1)!;

    act(() => loadRecord(DATA));
    expect(last().binding.baseline).toEqual(DATA);
    expect(seen.every((s) => s.entries.length === 0)).toBe(true);
    expect(last().binding.values).toBe(last().binding.baseline);

    const input = container.querySelector('input[name="amount"]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '120');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(last().entries).toEqual(['amount']);
    expect(changes).toEqual(['amount']);

    const from = seen.length;
    const incoming: Invoice = { ...DATA, supplier: 'Halden Tools Group' };
    act(() => last().rebase.rebase(incoming));
    const after = seen.slice(from);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((s) => s.binding.values !== incoming && s.amountDom === '120' && s.entries.join() === 'amount')).toBe(true);
    expect(last().binding.baseline).toBe(incoming);
    expect(last().form.state.values).toEqual({ ...incoming, amount: '120' });
    expect(last().form.state.fieldMeta.supplier).toMatchObject({ isTouched: false, isDirty: false });
    expect(last().form.state.fieldMeta.amount).toMatchObject({ isTouched: true, isDirty: true });
    // The user's edit only: no listener for the hydration nor for the rebase.
    expect(changes).toEqual(['amount']);
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
    act(() => legacyRender(<Probe seen={seen} onFieldChange={() => undefined} />, container));
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
    expect(seen.at(-1)!.form.state.values).toBe(x);
    act(() => legacyUnmount(container));
  });

  // Legacy mode renders synchronously inside the store notification of TanStack Form's `baseStore.setState`, while the
  // binding is still writing: the binding must not read that half-done write back (its `busy` guard), or a commit
  // would show the new values against the old baseline, a summary row for every field of `x`. Two saves in a row: the
  // guard holds for every write, not only for the first one.
  it('legacy render, binding.reset(x) then reset(y) outside any batch: no commit shows new values against the old baseline (no row)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // legacy render notice, update outside act
    const container = document.createElement('div');
    document.body.appendChild(container);
    const seen: Seen[] = [];
    act(() => legacyRender(<Probe seen={seen} onFieldChange={() => undefined} />, container));
    const x: Invoice = { supplier: 'Saved', amount: '7', notes: 'n' };
    const y: Invoice = { supplier: 'Saved again', amount: '8', notes: 'm' };
    for (const record of [x, y]) {
      const from = seen.length;
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
      try {
        seen.at(-1)!.binding.reset(record);
      } finally {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
      }
      const after = seen.slice(from);
      expect(after.length).toBeGreaterThan(0);
      expect(after.filter((s) => s.entries.length > 0).map((s) => s.entries)).toEqual([]);
      expect(after.filter((s) => s.binding.values !== s.binding.baseline)).toEqual([]);
      expect(seen.at(-1)!.binding.values).toBe(record);
    }
    act(() => legacyUnmount(container));
  });

  // Code review round 1 on PR #557, point 2: the hydration goes through `rederive` (a write of the base store after a
  // change of content of the defaults). Its `busy` guard must be balanced, or the guard of a later write is off.
  it('legacy render, hydration through defaultValues then binding.reset(x) outside any batch: no commit shows a row', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // legacy render notice, update outside act
    const container = document.createElement('div');
    document.body.appendChild(container);
    const seen: Seen[] = [];
    act(() => legacyRender(<Probe seen={seen} onFieldChange={() => undefined} />, container));
    act(() => loadRecord(DATA));
    expect(seen.at(-1)!.binding.baseline).toEqual(DATA);
    const from = seen.length;
    const x: Invoice = { supplier: 'Saved', amount: '7', notes: 'n' };
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    try {
      seen.at(-1)!.binding.reset(x);
    } finally {
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    }
    const after = seen.slice(from);
    expect(after.length).toBeGreaterThan(0);
    expect(seen.filter((s) => s.entries.length > 0).map((s) => s.entries)).toEqual([]);
    expect(seen.at(-1)!.binding.values).toBe(x);
    act(() => legacyUnmount(container));
  });
});
