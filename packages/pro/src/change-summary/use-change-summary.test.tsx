import { StrictMode } from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { useObjectPageForm } from '@formrail/core';
import { resetChangeSummaryWarnings } from './compute-change-summary';
import { useChangeSummary } from './use-change-summary';
import type { ChangeSummaryOptions, UseChangeSummaryReturn } from './types';

type Invoice = { number: string; note: string | null; lineItems: { id: number; price: number }[] };

const baseline: Invoice = { number: 'A-1', note: null, lineItems: [{ id: 1, price: 10 }, { id: 2, price: 20 }] };

describe('useChangeSummary', () => {
  it('returns { entries, isEmpty } with isEmpty === (entries.length === 0)', () => {
    const { result, rerender } = renderHook((props: ChangeSummaryOptions<Invoice>) => useChangeSummary(props), {
      initialProps: { values: baseline, baseline },
    });
    expect(result.current).toEqual({ entries: [], isEmpty: true });
    rerender({ values: { ...baseline, number: 'A-2' }, baseline });
    expect(result.current.isEmpty).toBe(false);
    expect(result.current.entries.map((e) => e.path)).toEqual(['number']);
  });

  it('keeps the same entries array while values/baseline keep their identity, even with inline arrayIdKeys/labels', () => {
    const values: Invoice = { ...baseline, lineItems: [{ id: 2, price: 21 }, { id: 1, price: 10 }] };
    const isEqual = vi.fn((): boolean | undefined => undefined);
    let renders = 0;
    const { result, rerender } = renderHook(() => {
      renders += 1;
      return useChangeSummary({
        values,
        baseline,
        // New literals with the same content on every render, keys in a different order every other render.
        arrayIdKeys: { lineItems: 'id' },
        labels: renders % 2 ? { number: 'No.', 'lineItems.price': 'Price' } : { 'lineItems.price': 'Price', number: 'No.' },
        isEqual,
      });
    });
    const first = result.current;
    const calls = isEqual.mock.calls.length;
    expect(first.entries.map((e) => e.label)).toEqual(['Line Items > Item 1 > Price']);
    rerender();
    rerender();
    expect(result.current).toBe(first);
    expect(result.current.entries).toBe(first.entries);
    expect(isEqual.mock.calls.length).toBe(calls);
  });

  it('recomputes on a new values / baseline reference or different labels / arrayIdKeys content', () => {
    const isEqual = vi.fn((): boolean | undefined => undefined);
    type P = Pick<ChangeSummaryOptions<Invoice>, 'values' | 'baseline' | 'labels' | 'arrayIdKeys'>;
    const values: Invoice = { ...baseline, number: 'B' };
    const { result, rerender } = renderHook<UseChangeSummaryReturn, P>((p) => useChangeSummary({ ...p, isEqual }), {
      initialProps: { values, baseline, labels: { number: 'No.' } },
    });
    const first = result.current.entries;
    rerender({ values: { ...values }, baseline, labels: { number: 'No.' } });
    expect(result.current.entries).not.toBe(first);
    expect(result.current.entries).toEqual(first);

    let previous = result.current.entries;
    const v2 = { ...values };
    const b2 = { ...baseline };
    rerender({ values: v2, baseline: b2, labels: { number: 'No.' } });
    expect(result.current.entries).not.toBe(previous);

    // Same references, same content: stable.
    previous = result.current.entries;
    rerender({ values: v2, baseline: b2, labels: { number: 'No.' } });
    expect(result.current.entries).toBe(previous);

    rerender({ values: v2, baseline: b2, labels: { number: 'Number #' } });
    expect(result.current.entries).not.toBe(previous);
    expect(result.current.entries[0]?.label).toBe('Number #');

    previous = result.current.entries;
    rerender({ values: v2, baseline: b2, labels: { number: 'Number #' }, arrayIdKeys: { lineItems: 'id' } });
    expect(result.current.entries).not.toBe(previous);
    previous = result.current.entries;
    rerender({ values: v2, baseline: b2, labels: { number: 'Number #' }, arrayIdKeys: { lineItems: 'key' } });
    expect(result.current.entries).not.toBe(previous);
  });

  it('an inline isEqual recomputes on every render without errors or loops', () => {
    let renders = 0;
    const values: Invoice = { ...baseline, number: 'B' };
    const { result, rerender } = renderHook(() => {
      renders += 1;
      return useChangeSummary({ values, baseline, isEqual: () => undefined });
    });
    const first = result.current.entries;
    rerender();
    expect(result.current.entries).not.toBe(first);
    expect(result.current.entries).toEqual(first);
    expect(renders).toBe(2);
  });

  it('dedups the duplicate-id warning per path under StrictMode double renders', () => {
    resetChangeSummaryWarnings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const dup: Invoice = { ...baseline, lineItems: [{ id: 1, price: 1 }, { id: 1, price: 2 }] };
      function Probe({ values }: { values: Invoice }) {
        const { entries } = useChangeSummary({ values, baseline, arrayIdKeys: { lineItems: 'id' } });
        return <output>{entries.map((e) => e.path).join(',')}</output>;
      }
      const { rerender, container } = render(
        <StrictMode>
          <Probe values={dup} />
        </StrictMode>,
      );
      rerender(
        <StrictMode>
          <Probe values={{ ...dup }} />
        </StrictMode>,
      );
      expect(container.textContent).toBe('lineItems');
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps memoization under StrictMode', () => {
    const values: Invoice = { ...baseline, number: 'B' };
    const seen: UseChangeSummaryReturn[] = [];
    function Probe() {
      seen.push(useChangeSummary({ values, baseline, labels: { number: 'No.' } }));
      return null;
    }
    const { rerender } = render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    rerender(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    const committed = seen[seen.length - 1];
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.at(-2)).toBe(committed);
    expect(committed?.entries.map((e) => e.label)).toEqual(['No.']);
  });
});

describe('useChangeSummary with useObjectPageForm (core)', () => {
  function useInvoice(initial: Invoice) {
    const form = useObjectPageForm<Invoice>({ baseline: initial });
    const summary = useChangeSummary({
      values: form.values,
      baseline: form.baseline,
      arrayIdKeys: { lineItems: 'id' },
    });
    return { form, summary };
  }

  it('follows the real baseline: hydrated mount, edit, manual revert, save, reset', async () => {
    const { result } = renderHook(() => useInvoice(baseline));
    // Mounted already hydrated: nothing to show.
    expect(result.current.summary.isEmpty).toBe(true);

    act(() => result.current.form.setValue('number', 'A-2'));
    expect(result.current.summary.entries.map(({ path, kind }) => ({ path, kind }))).toEqual([
      { path: 'number', kind: 'changed' },
    ]);

    // Brought back by hand: clean again.
    act(() => result.current.form.setValue('number', 'A-1'));
    expect(result.current.summary.isEmpty).toBe(true);

    // `note` from null to '' is a change, as for isDirty.
    act(() => result.current.form.setValue('note', ''));
    expect(result.current.form.isDirty).toBe(true);
    expect(result.current.summary.isEmpty).toBe(false);
    expect(result.current.summary.entries).toMatchObject([{ path: 'note', kind: 'added', before: undefined, after: '' }]);

    act(() => result.current.form.setValue('lineItems', [{ id: 2, price: 25 }, { id: 1, price: 10 }]));
    expect(result.current.summary.entries.map((e) => e.path)).toEqual(['note', 'lineItems.0.price']);

    await act(async () => {
      expect(await result.current.form.save(() => undefined)).toBe(true);
    });
    // The diff is against the new real baseline, not the initial values.
    expect(result.current.form.baseline).not.toBe(baseline);
    expect(result.current.summary.isEmpty).toBe(true);

    act(() => result.current.form.setValue('number', 'A-9'));
    expect(result.current.summary.isEmpty).toBe(false);
    act(() => result.current.form.reset());
    expect(result.current.summary.isEmpty).toBe(true);

    // Hydrating a new baseline after mount: recomputed, empty.
    act(() => result.current.form.reset({ ...baseline, number: 'Z-1' }));
    expect(result.current.summary.isEmpty).toBe(true);
    act(() => result.current.form.setValue('number', 'A-1'));
    expect(result.current.summary.entries[0]).toMatchObject({ path: 'number', before: 'Z-1', after: 'A-1' });
  });
});
