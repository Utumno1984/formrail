// Ticket #424: `useChangeSummary` with `itemLabel` and `reorders`.
import { act, renderHook } from '@testing-library/react';
import { useObjectPageForm } from '@formrail/core';
import { useChangeSummary } from './use-change-summary';
import type { ChangeSummaryOptions } from './types';

type Line = { id: number; name: string; price: number };
type Invoice = { number: string; lineItems: Line[] };

const DESK: Line = { id: 1, name: 'Desk', price: 60 };
const CHAIR: Line = { id: 2, name: 'Chair', price: 40 };
const baseline: Invoice = { number: 'A-1', lineItems: [DESK, CHAIR] };

// Module scope: a stable identity across renders.
const byName: NonNullable<ChangeSummaryOptions<Invoice>['itemLabel']> = (_path, item, { defaultLabel, isLastSegment }) =>
  isLastSegment ? undefined : `${defaultLabel} (${(item as Line).name})`;

describe('useChangeSummary: reorders and itemLabel (#424)', () => {
  it('returns the reorders; isEmpty ignores them', () => {
    const { result } = renderHook(() =>
      useChangeSummary({ values: { ...baseline, lineItems: [CHAIR, DESK] }, baseline, arrayIdKeys: { lineItems: 'id' } }),
    );
    expect(result.current.entries).toEqual([]);
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.reorders).toEqual([{ path: 'lineItems', labelPath: ['Line Items'], label: 'Line Items' }]);
  });

  it('a stable itemLabel keeps entries and reorders the same arrays; a new identity recomputes', () => {
    const values: Invoice = { ...baseline, lineItems: [{ ...CHAIR, price: 45 }, DESK] };
    const itemLabel = vi.fn(byName);
    type P = { label: typeof byName };
    const { result, rerender } = renderHook<ReturnType<typeof useChangeSummary>, P>(
      ({ label }) => useChangeSummary({ values, baseline, arrayIdKeys: { lineItems: 'id' }, itemLabel: label }),
      { initialProps: { label: itemLabel } },
    );
    const first = result.current;
    expect(first.entries.map((e) => e.label)).toEqual(['Line Items > Item 1 (Chair) > Price']);
    expect(first.reorders.map((r) => r.label)).toEqual(['Line Items']);
    expect(itemLabel).toHaveBeenCalledTimes(1);
    rerender({ label: itemLabel });
    rerender({ label: itemLabel });
    expect(result.current.entries).toBe(first.entries);
    expect(result.current.reorders).toBe(first.reorders);
    expect(itemLabel).toHaveBeenCalledTimes(1);

    const other = vi.fn<typeof byName>(() => 'Row');
    rerender({ label: other });
    expect(result.current.entries).not.toBe(first.entries);
    expect(result.current.reorders).not.toBe(first.reorders);
    expect(result.current.entries.map((e) => e.label)).toEqual(['Line Items > Row > Price']);
  });

  it('an inline itemLabel recomputes on every render (documented)', () => {
    const values: Invoice = { ...baseline, lineItems: [{ ...DESK, price: 61 }, CHAIR] };
    let calls = 0;
    const { result, rerender } = renderHook(() =>
      useChangeSummary({
        values,
        baseline,
        arrayIdKeys: { lineItems: 'id' },
        itemLabel: (...args) => {
          calls += 1;
          return byName(...args);
        },
      }),
    );
    const first = result.current.entries;
    rerender();
    expect(result.current.entries).not.toBe(first);
    expect(result.current.entries).toEqual(first);
    expect(calls).toBe(2);
  });

  it('an exception thrown by itemLabel is thrown by the render', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const boom = new Error('boom');
      expect(() =>
        renderHook(() =>
          useChangeSummary({
            values: { ...baseline, lineItems: [{ ...DESK, price: 1 }, CHAIR] },
            baseline,
            arrayIdKeys: { lineItems: 'id' },
            itemLabel: () => {
              throw boom;
            },
          }),
        ),
      ).toThrow(boom);
    } finally {
      error.mockRestore();
    }
  });

  it('with useObjectPageForm: a save bar rule of isEmpty && no reorder follows isDirty through a reorder', () => {
    const { result } = renderHook(() => {
      const form = useObjectPageForm<Invoice>({ baseline });
      const summary = useChangeSummary({ values: form.values, baseline: form.baseline, arrayIdKeys: { lineItems: 'id' }, itemLabel: byName });
      return { form, summary };
    });
    const clean = () => result.current.summary.isEmpty && result.current.summary.reorders.length === 0;
    expect(clean()).toBe(true);
    act(() => result.current.form.setValue('lineItems', [CHAIR, DESK]));
    expect(result.current.form.isDirty).toBe(true);
    expect(result.current.summary.isEmpty).toBe(true);
    expect(clean()).toBe(false);
    act(() => result.current.form.setValue('lineItems', [DESK, CHAIR]));
    expect(result.current.form.isDirty).toBe(false);
    expect(clean()).toBe(true);
  });
});
