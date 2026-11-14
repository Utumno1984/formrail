// Ticket #534: `useFormRebase` with `itemLabel`: applied and conflicts named by the engine, open conflicts named at
// their CURRENT position with the item as it is now in `form.values`.
import { Component, type ReactNode } from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { useObjectPageForm, type UseObjectPageFormReturn } from '@formrail/core';
import { resetChangeSummaryWarnings } from '../change-summary/compute-change-summary';
import type { ChangeSummaryOptions, ItemLabelContext } from '../change-summary/types';
import { useFormRebase } from './use-form-rebase';
import type { UseFormRebaseReturn } from './types';

type ItemLabelFn = NonNullable<ChangeSummaryOptions<object>['itemLabel']>;
type Line = { id: string; name: string; qty: number };
type Order = { notes: string; lines: Line[] };

const line = (id: string, name: string, qty = 1): Line => ({ id, name, qty });
const DESK = line('li-1', 'Desk');
const CHAIR = line('li-2', 'Chair');
const LAMP = line('li-3', 'Lamp');
const BASE: Order = { notes: '', lines: [DESK, CHAIR, LAMP] };
const ARRAY_ID_KEYS = { lines: 'id' };
const LABELS = { 'lines.qty': 'Quantity' };

// Module scope: a stable identity across renders.
const byName: ItemLabelFn = (_path, item) => (item as Line).name;

const ctx = (path: string, index: number, isLastSegment: boolean, side: ItemLabelContext['side'] = 'values'): ItemLabelContext => ({
  path,
  index,
  side,
  isLastSegment,
  defaultLabel: `Item ${index + 1}`,
});

interface Props {
  itemLabel: ItemLabelFn | undefined;
}

beforeEach(() => resetChangeSummaryWarnings());

function setup(itemLabel: ItemLabelFn | undefined) {
  const view = renderHook<{ form: UseObjectPageFormReturn<Order>; rebase: UseFormRebaseReturn<Order> }, Props>(
    ({ itemLabel: label }) => {
      const form = useObjectPageForm<Order>({ baseline: BASE });
      const rebase = useFormRebase(form, { arrayIdKeys: ARRAY_ID_KEYS, labels: LABELS, itemLabel: label });
      return { form, rebase };
    },
    { initialProps: { itemLabel } },
  );
  const h = () => view.result.current;
  const at = () => h().rebase.conflicts.map((c) => [c.path, c.currentPath, c.label]);
  return { h, at, view };
}

/** A conflict on the quantity of Chair (li-2, index 1): the user set 5, the server 6. */
function chairConflict(itemLabel: ItemLabelFn = byName) {
  const s = setup(itemLabel);
  act(() => s.h().form.setValue('lines', [DESK, line('li-2', 'Chair', 5), LAMP]));
  act(() => s.h().rebase.rebase({ ...BASE, lines: [DESK, line('li-2', 'Chair', 6), LAMP] }));
  expect(s.at()).toEqual([['lines.1.qty', 'lines.1.qty', 'Lines > Chair > Quantity']]);
  return s;
}

describe('useFormRebase: itemLabel names the rebase (#534)', () => {
  it('applied and conflicts are named with the items of the merge', () => {
    const { h, at } = setup(byName);
    act(() => h().form.setValue('lines', [line('li-1', 'Desk', 2), CHAIR, LAMP]));
    act(() => h().rebase.rebase({ ...BASE, lines: [line('li-1', 'Desk', 3), line('li-2', 'Chair', 4)] }));
    expect(at()).toEqual([['lines.0.qty', 'lines.0.qty', 'Lines > Desk > Quantity']]);
    expect(h().rebase.applied.map((e) => [e.path, e.kind, e.label])).toEqual([
      ['lines.1.qty', 'changed', 'Lines > Chair > Quantity'],
      ['lines.2', 'removed', 'Lines > Lamp'],
    ]);
  });

  it('without itemLabel: Item N, as before', () => {
    const { at } = chairConflictWithout();
    expect(at()).toEqual([['lines.1.qty', 'lines.1.qty', 'Lines > Item 2 > Quantity']]);
  });

  function chairConflictWithout() {
    const s = setup(undefined);
    act(() => s.h().form.setValue('lines', [DESK, line('li-2', 'Chair', 5), LAMP]));
    act(() => s.h().rebase.rebase({ ...BASE, lines: [DESK, line('li-2', 'Chair', 6), LAMP] }));
    return s;
  }
});

describe('useFormRebase: open conflicts named at the current position (#534)', () => {
  it('the user moves, adds and removes rows above the conflict: the same row, at its new index, with the current item', () => {
    const itemLabel = vi.fn(byName);
    const { h, at } = chairConflict(itemLabel);
    const chair = () => h().form.values.lines.find((l) => l.id === 'li-2');

    act(() => h().form.setValue('lines', [line('li-2', 'Chair', 5), DESK, LAMP]));
    expect(at()).toEqual([['lines.1.qty', 'lines.0.qty', 'Lines > Chair > Quantity']]);
    expect(itemLabel).toHaveBeenLastCalledWith('lines', chair(), ctx('lines.0', 0, false));
    expect(itemLabel.mock.lastCall![1]).toBe(chair());

    act(() => h().form.setValue('lines', [line('li-8', 'Shelf'), line('li-9', 'Rug'), DESK, line('li-2', 'Chair', 5), LAMP]));
    expect(at()).toEqual([['lines.1.qty', 'lines.3.qty', 'Lines > Chair > Quantity']]);
    expect(h().rebase.conflicts[0]!.labelPath).toEqual(['Lines', 'Chair', 'Quantity']);
    expect(itemLabel).toHaveBeenLastCalledWith('lines', chair(), ctx('lines.3', 3, false));

    act(() => h().form.setValue('lines', [line('li-2', 'Chair', 5), LAMP]));
    expect(at()).toEqual([['lines.1.qty', 'lines.0.qty', 'Lines > Chair > Quantity']]);
    expect(itemLabel).toHaveBeenLastCalledWith('lines', chair(), ctx('lines.0', 0, false));
  });

  it('the label changes between two renders: renaming the row names the conflict with the new value', () => {
    const { h, at } = chairConflict();
    act(() => h().form.setValue('lines', [DESK, line('li-2', 'Office chair', 5), LAMP]));
    expect(at()).toEqual([['lines.1.qty', 'lines.1.qty', 'Lines > Office chair > Quantity']]);
    act(() => h().form.setValue('lines', [DESK, line('li-2', 'Stool', 5), LAMP]));
    expect(at()).toEqual([['lines.1.qty', 'lines.1.qty', 'Lines > Stool > Quantity']]);
  });

  it('a new itemLabel between two renders, same values: the labels of the new one (never the rebase-time answers)', () => {
    const { h, view, at } = chairConflict();
    const values = h().form.values;
    view.rerender({ itemLabel: (_path, item) => `Row ${(item as Line).id}` });
    expect(h().form.values).toBe(values);
    expect(at()).toEqual([['lines.1.qty', 'lines.1.qty', 'Lines > Row li-2 > Quantity']]);
    view.rerender({ itemLabel: undefined });
    expect(at()).toEqual([['lines.1.qty', 'lines.1.qty', 'Lines > Item 2 > Quantity']]);
  });

  it('a row the user removes after the rebase keeps the label of the rebase (not the row now at that index)', () => {
    const { h, at } = chairConflict();
    act(() => h().form.setValue('lines', [DESK, LAMP]));
    // li-2 is gone: the conflict stays open (the server value is not there), named as at the rebase.
    expect(at()).toEqual([['lines.1.qty', 'lines.1.qty', 'Lines > Chair > Quantity']]);
    expect(h().rebase.conflicts[0]!.labelPath).toEqual(['Lines', 'Chair', 'Quantity']);
  });

  it('the rules of the answer hold at the current position: blank or undefined keeps Item N, a non-string warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { h, at } = chairConflict();
    act(() => h().form.setValue('lines', [line('li-2', '  ', 5), DESK, LAMP]));
    expect(at()).toEqual([['lines.1.qty', 'lines.0.qty', 'Lines > Item 1 > Quantity']]);
    const { h: h2, view, at: at2 } = chairConflict();
    view.rerender({ itemLabel: () => undefined });
    expect(at2()).toEqual([['lines.1.qty', 'lines.1.qty', 'Lines > Item 2 > Quantity']]);
    view.rerender({ itemLabel: (() => 42) as unknown as ItemLabelFn });
    act(() => h2().form.setValue('notes', 'x'));
    expect(at2()).toEqual([['lines.1.qty', 'lines.1.qty', 'Lines > Item 2 > Quantity']]);
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
      "[formrail/pro] computeRebase: itemLabel returned a non-string for 'lines'; the default label is used.",
    ]);
    warn.mockRestore();
  });

  it('a row removed by the user and changed by the server (mineMissing): named with the server version, kept as is', () => {
    const itemLabel = vi.fn(byName);
    const { h, at } = setup(itemLabel);
    act(() => h().form.setValue('lines', [DESK, LAMP]));
    const incoming: Order = { ...BASE, lines: [DESK, line('li-2', 'Armchair', 8), LAMP] };
    act(() => h().rebase.rebase(incoming));
    expect(at()).toEqual([['lines.1', 'lines.1', 'Lines > Armchair']]);
    expect(itemLabel).toHaveBeenCalledWith('lines', incoming.lines[1], ctx('lines.1', 1, true, 'baseline'));
    const calls = itemLabel.mock.calls.length;
    act(() => h().form.setValue('notes', 'typing'));
    expect(at()).toEqual([['lines.1', 'lines.1', 'Lines > Armchair']]);
    expect(itemLabel).toHaveBeenCalledTimes(calls);
  });

  it('a row removed by the server and touched by the user (theirsMissing): the current row, as a whole', () => {
    const itemLabel = vi.fn(byName);
    const { h, at } = setup(itemLabel);
    act(() => h().form.setValue('lines', [DESK, line('li-2', 'Chair', 7), LAMP]));
    act(() => h().rebase.rebase({ ...BASE, lines: [DESK, LAMP] }));
    expect(at()).toEqual([['lines.1', 'lines.1', 'Lines > Chair']]);
    act(() => h().form.setValue('lines', [line('li-2', 'Chair seat', 7), DESK, LAMP]));
    expect(at()).toEqual([['lines.1', 'lines.0', 'Lines > Chair seat']]);
    expect(itemLabel).toHaveBeenLastCalledWith('lines', h().form.values.lines[0], ctx('lines.0', 0, true));
  });
});

describe('useFormRebase: itemLabel identity and laziness (#534)', () => {
  it('a stable itemLabel keeps the conflicts array between renders; a new values object names them again', () => {
    const itemLabel = vi.fn(byName);
    const { h, view } = chairConflict(itemLabel);
    const first = h().rebase.conflicts;
    const calls = itemLabel.mock.calls.length;
    view.rerender({ itemLabel });
    view.rerender({ itemLabel });
    expect(h().rebase.conflicts).toBe(first);
    expect(itemLabel).toHaveBeenCalledTimes(calls);
    // A keystroke elsewhere: one call for the one item segment of the one open conflict.
    act(() => h().form.setValue('notes', 'x'));
    expect(h().rebase.conflicts).not.toBe(first);
    expect(itemLabel).toHaveBeenCalledTimes(calls + 1);
  });

  it('an inline itemLabel gives a new conflicts array on every render (documented)', () => {
    const { h, view } = chairConflict();
    view.rerender({ itemLabel: (path, item, context) => byName(path, item, context) });
    const first = h().rebase.conflicts;
    view.rerender({ itemLabel: (path, item, context) => byName(path, item, context) });
    expect(h().rebase.conflicts).not.toBe(first);
    expect(h().rebase.conflicts).toEqual(first);
  });

  it('1 000 rows, one conflict: the rebase and the open conflict name only that row', () => {
    const rows = (qty500: number) => Array.from({ length: 1000 }, (_, i) => line(`li-${i}`, `Row ${i}`, i === 500 ? qty500 : 1));
    const itemLabel = vi.fn(byName);
    const view = renderHook(() => {
      const form = useObjectPageForm<Order>({ baseline: { notes: '', lines: rows(1) } });
      return { form, rebase: useFormRebase(form, { arrayIdKeys: ARRAY_ID_KEYS, itemLabel }) };
    });
    act(() => view.result.current.form.setValue('lines', rows(5)));
    act(() => view.result.current.rebase.rebase({ notes: '', lines: rows(6) }));
    expect(view.result.current.rebase.conflicts.map((c) => c.label)).toEqual(['Lines > Row 500 > Qty']);
    expect(new Set(itemLabel.mock.calls.map((call) => call[2].path))).toEqual(new Set(['lines.500']));
  });

  it('a rebase queued during a save names nothing until it is applied, then names the values the save left', async () => {
    const itemLabel = vi.fn(byName);
    const { h, at } = setup(itemLabel);
    act(() => h().form.setValue('lines', [DESK, line('li-2', 'Chair', 5), LAMP]));
    let resolve!: (v: Order) => void;
    let done!: Promise<boolean>;
    act(() => {
      done = h().form.save(() => new Promise<Order>((res) => (resolve = res)));
    });
    act(() => h().rebase.rebase({ ...BASE, lines: [DESK, line('li-2', 'Chair', 6), LAMP] }));
    expect(h().rebase.isPending).toBe(true);
    // The user renames the row and changes its quantity again while the save is in flight.
    act(() => h().form.setValue('lines', [DESK, line('li-2', 'Chair XL', 7), LAMP]));
    expect(itemLabel).not.toHaveBeenCalled();
    await act(async () => {
      resolve({ ...BASE, lines: [DESK, line('li-2', 'Chair', 5), LAMP] });
      await done;
    });
    expect(h().rebase.isPending).toBe(false);
    expect(at()).toEqual([['lines.1.qty', 'lines.1.qty', 'Lines > Chair XL > Quantity']]);
  });
});

describe('useFormRebase: an exception thrown by itemLabel (#534)', () => {
  class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
    override state = { error: null as unknown };
    static getDerivedStateFromError(error: unknown) {
      return { error };
    }
    override render() {
      return this.state.error ? <p>{(this.state.error as Error).message}</p> : this.props.children;
    }
  }

  let handle: { form: UseObjectPageFormReturn<Order>; rebase: UseFormRebaseReturn<Order> } | undefined;
  function Harness({ itemLabel }: Props) {
    const form = useObjectPageForm<Order>({ baseline: BASE });
    handle = { form, rebase: useFormRebase(form, { arrayIdKeys: ARRAY_ID_KEYS, itemLabel }) };
    return null;
  }

  it('reaches the caller: the rebase that names a conflict fails, an error boundary catches it', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const itemLabel: ItemLabelFn = () => {
      throw new Error('itemLabel failed');
    };
    const view = render(
      <Boundary>
        <Harness itemLabel={itemLabel} />
      </Boundary>,
    );
    act(() => handle!.form.setValue('lines', [DESK, line('li-2', 'Chair', 5), LAMP]));
    act(() => handle!.rebase.rebase({ ...BASE, lines: [DESK, line('li-2', 'Chair', 6), LAMP] }));
    expect(view.container.textContent).toBe('itemLabel failed');
    error.mockRestore();
  });
});
