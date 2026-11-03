import { act, StrictMode, version } from 'react';
import { createRoot } from 'react-dom/client';
import { useChangeSummary, type UseChangeSummaryReturn } from '../../packages/pro/src';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Line = { id: number; price: number };
type Invoice = { number: string; supplier: { vatNumber: string }; lineItems: Line[] };

const baseline: Invoice = {
  number: 'A-1',
  supplier: { vatNumber: 'IT1' },
  lineItems: [
    { id: 1, price: 10 },
    { id: 2, price: 20 },
  ],
};

function mount(strict = false) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const seen: UseChangeSummaryReturn[] = [];
  function Probe({ values, base }: { values: Invoice; base: Invoice }) {
    // Inline literals recreated on every render: memoization must compare them by content.
    const summary = useChangeSummary({
      values,
      baseline: base,
      arrayIdKeys: { lineItems: 'id' },
      labels: { 'supplier.vatNumber': 'VAT number' },
    });
    seen.push(summary);
    return <p>{summary.entries.map((e) => e.label).join('|')}</p>;
  }
  const render = (values: Invoice, base: Invoice = baseline) =>
    act(() => root.render(strict ? <StrictMode><Probe values={values} base={base} /></StrictMode> : <Probe values={values} base={base} />));
  return { container, root, seen, render };
}

describe('useChangeSummary on React 18', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('runs against React 18', () => {
    expect(version.startsWith('18.')).toBe(true);
  });

  it('computes the entries (reorder ignored, overridden label)', () => {
    const { container, seen, render, root } = mount();
    const values: Invoice = {
      ...baseline,
      supplier: { vatNumber: 'IT2' },
      lineItems: [
        { id: 2, price: 20 },
        { id: 1, price: 15 },
      ],
    };
    render(values);
    expect(seen.at(-1)?.entries.map(({ path, label, kind }) => ({ path, label, kind }))).toEqual([
      { path: 'supplier.vatNumber', label: 'Supplier > VAT number', kind: 'changed' },
      { path: 'lineItems.1.price', label: 'Line Items > Item 2 > Price', kind: 'changed' },
    ]);
    expect(seen.at(-1)?.isEmpty).toBe(false);
    expect(container.textContent).toBe('Supplier > VAT number|Line Items > Item 2 > Price');
    act(() => root.unmount());
  });

  it('keeps the same entries array across re-renders with the same values/baseline, recomputes on a new one', () => {
    const { seen, render, root } = mount();
    const values: Invoice = { ...baseline, number: 'A-2' };
    render(values);
    render(values);
    render(values);
    expect(seen).toHaveLength(3);
    expect(seen[1]?.entries).toBe(seen[0]?.entries);
    expect(seen[2]).toBe(seen[0]);
    render({ ...values });
    expect(seen[3]?.entries).not.toBe(seen[0]?.entries);
    expect(seen[3]?.entries.map((e) => e.path)).toEqual(['number']);
    render(baseline);
    expect(seen.at(-1)?.isEmpty).toBe(true);
    act(() => root.unmount());
  });

  it('StrictMode: memoization holds and the duplicate-id warning is not duplicated', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { seen, render, root } = mount(true);
    const dup: Invoice = {
      ...baseline,
      lineItems: [
        { id: 7, price: 1 },
        { id: 7, price: 2 },
      ],
    };
    render(dup);
    render(dup);
    const committed = seen.at(-1);
    expect(seen.at(-2)?.entries).toBe(committed?.entries);
    expect(committed?.entries.map((e) => `${e.kind} ${e.path}`)).toEqual(['changed lineItems']);
    const dupWarnings = warn.mock.calls.filter(([message]) => String(message).includes("duplicate 'id'"));
    expect(dupWarnings).toHaveLength(1);
    act(() => root.unmount());
  });
});
