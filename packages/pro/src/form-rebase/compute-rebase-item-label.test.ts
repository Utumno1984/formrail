// Ticket #534: `computeRebase` with `itemLabel` (the option of `ChangeSummaryOptions`, #424).
import type { MockInstance } from 'vitest';
import { resetChangeSummaryWarnings } from '../change-summary/compute-change-summary';
import type { ChangeSummaryOptions, ItemLabelContext } from '../change-summary/types';
import { computeRebase } from './compute-rebase';
import type { RebaseOptions, RebaseResult } from './types';

type ItemLabelFn = NonNullable<ChangeSummaryOptions<object>['itemLabel']>;
type Tax = { code: string; rate: number };
type Line = { id: string; name: string; qty: number; price?: number; taxes?: Tax[] };
type Invoice = { number: string; lineItems: Line[] };

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

const IDS = { lineItems: 'id', 'lineItems.taxes': 'code' };
const LABELS = { lineItems: 'Line items', 'lineItems.qty': 'Quantity', 'lineItems.taxes': 'Taxes' };

/** Inputs frozen (any mutation throws), the invoice options, and `itemLabel` given. */
function rebase(options: Omit<RebaseOptions<Invoice>, 'arrayIdKeys' | 'labels'>): RebaseResult<Invoice> {
  deepFreeze(options.baseline);
  deepFreeze(options.values);
  deepFreeze(options.incoming);
  return computeRebase<Invoice>({ arrayIdKeys: IDS, labels: LABELS, ...options });
}

/** Names a row by its `name` and a tax by its `code`, on every segment. */
const byName: ItemLabelFn = (arrayPath, item) => {
  if (arrayPath === 'lineItems') return (item as Line).name;
  if (arrayPath === 'lineItems.taxes') return `Tax ${(item as Tax).code}`;
  return undefined;
};

const line = (id: string, name: string, qty = 1, extra: Partial<Line> = {}): Line => ({ id, name, qty, ...extra });
const invoice = (...lineItems: Line[]): Invoice => ({ number: 'A-1', lineItems });

const ctx = (path: string, index: number, side: ItemLabelContext['side'], isLastSegment: boolean): ItemLabelContext => ({
  path,
  index,
  side,
  isLastSegment,
  defaultLabel: `Item ${index + 1}`,
});

let warn: MockInstance;
beforeEach(() => {
  resetChangeSummaryWarnings();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warn.mockRestore();
  vi.unstubAllEnvs();
});

describe('computeRebase: itemLabel on conflicts (#534)', () => {
  it('a conflict on the quantity of li-2 at index 1 of the result: named with the item of the result', () => {
    const itemLabel = vi.fn(byName);
    const baseline = invoice(line('li-1', 'Desk'), line('li-2', 'Chair'));
    const out = rebase({
      baseline,
      values: invoice(line('li-1', 'Desk'), line('li-2', 'Chair', 5)),
      incoming: invoice(line('li-1', 'Desk'), line('li-2', 'Chair', 6)),
      itemLabel,
    });
    expect(out.conflicts.map((c) => [c.path, c.label])).toEqual([['lineItems.1.qty', 'Line items > Chair > Quantity']]);
    expect(itemLabel).toHaveBeenCalledTimes(1);
    expect(itemLabel).toHaveBeenCalledWith('lineItems', out.values.lineItems[1], ctx('lineItems.1', 1, 'values', false));
    expect(itemLabel.mock.calls[0]![1]).toBe(out.values.lineItems[1]);
  });

  it('the item of the RESULT, at its index there: the merged row (a name the server changed) after a row the server added above', () => {
    const itemLabel = vi.fn(byName);
    const out = rebase({
      baseline: invoice(line('li-1', 'Desk'), line('li-2', 'Chair')),
      values: invoice(line('li-1', 'Desk'), line('li-2', 'Chair', 5)),
      // The server adds li-0 first and renames li-2: in the result li-2 is at index 2, with the server's name.
      incoming: invoice(line('li-0', 'Lamp'), line('li-1', 'Desk'), line('li-2', 'Armchair', 6)),
      itemLabel,
    });
    expect(out.values.lineItems.map((l) => [l.id, l.name, l.qty])).toEqual([
      ['li-1', 'Desk', 1],
      ['li-2', 'Armchair', 5],
      ['li-0', 'Lamp', 1],
    ]);
    expect(out.conflicts.map((c) => [c.path, c.label])).toEqual([['lineItems.1.qty', 'Line items > Armchair > Quantity']]);
    // `applied`: the rename (inside li-2, at its result index) and the added row (at its result index).
    expect(out.applied.map((e) => [e.path, e.kind, e.label])).toEqual([
      ['lineItems.1.name', 'changed', 'Line items > Armchair > Name'],
      ['lineItems.2', 'added', 'Line items > Lamp'],
    ]);
    const merged = out.values.lineItems[1];
    expect(itemLabel.mock.calls.filter((call) => call[1] === merged)).toHaveLength(1);
    expect(itemLabel).toHaveBeenCalledWith('lineItems', merged, ctx('lineItems.1', 1, 'values', false));
    expect(itemLabel).toHaveBeenCalledWith('lineItems', out.values.lineItems[2], ctx('lineItems.2', 2, 'values', true));
    expect(itemLabel).toHaveBeenCalledTimes(2);
  });

  it('a row removed by the user and changed by the server (mineMissing): the item of incoming, its index there, isLastSegment', () => {
    const itemLabel = vi.fn(byName);
    const incoming = invoice(line('li-9', 'Lamp'), line('li-1', 'Desk'), line('li-2', 'Chair', 6));
    const out = rebase({
      baseline: invoice(line('li-1', 'Desk'), line('li-2', 'Chair')),
      values: invoice(line('li-1', 'Desk')),
      incoming,
      itemLabel,
    });
    expect(out.conflicts.map((c) => [c.path, c.label, c.mineMissing])).toEqual([['lineItems.2', 'Line items > Chair', true]]);
    expect(itemLabel).toHaveBeenCalledWith('lineItems', incoming.lineItems[2], ctx('lineItems.2', 2, 'baseline', true));
    expect(itemLabel.mock.calls.find((call) => call[2].side === 'baseline')![1]).toBe(incoming.lineItems[2]);
  });

  it('a row removed by the server and touched by the user (theirsMissing): the item of the result, side values', () => {
    const itemLabel = vi.fn(byName);
    const out = rebase({
      baseline: invoice(line('li-1', 'Desk'), line('li-2', 'Chair')),
      values: invoice(line('li-1', 'Desk'), line('li-2', 'Office chair')),
      incoming: invoice(line('li-1', 'Desk')),
      itemLabel,
    });
    expect(out.conflicts.map((c) => [c.path, c.label, c.theirsMissing])).toEqual([['lineItems.1', 'Line items > Office chair', true]]);
    expect(itemLabel).toHaveBeenCalledExactlyOnceWith('lineItems', out.values.lineItems[1], ctx('lineItems.1', 1, 'values', true));
  });

  it('a row added by both with the same id: its field conflict is named with the merged row', () => {
    const itemLabel = vi.fn(byName);
    const out = rebase({
      baseline: invoice(line('li-1', 'Desk')),
      values: invoice(line('li-1', 'Desk'), line('li-5', 'Shelf', 2)),
      incoming: invoice(line('li-1', 'Desk'), line('li-5', 'Shelf', 3)),
      itemLabel,
    });
    expect(out.conflicts.map((c) => [c.path, c.label, c.baseMissing])).toEqual([['lineItems.1.qty', 'Line items > Shelf > Quantity', true]]);
    expect(itemLabel).toHaveBeenCalledExactlyOnceWith('lineItems', out.values.lineItems[1], ctx('lineItems.1', 1, 'values', false));
  });

  it('an order-only conflict on the array: no item segment, itemLabel not called for it', () => {
    const itemLabel = vi.fn(byName);
    const a = line('a', 'A');
    const b = line('b', 'B');
    const c = line('c', 'C');
    const out = rebase({ baseline: invoice(a, b, c), values: invoice(b, a, c), incoming: invoice(a, c, b), itemLabel });
    expect(out.conflicts.map((conflict) => [conflict.path, conflict.label])).toEqual([['lineItems', 'Line items']]);
    expect(itemLabel).not.toHaveBeenCalled();
  });

  it('a conflict decided atomically by isEqual on the row: the row is the last segment', () => {
    const itemLabel = vi.fn(byName);
    const isEqual = (x: unknown, y: unknown, path: string) => (path === 'lineItems.0' ? JSON.stringify(x) === JSON.stringify(y) : undefined);
    const out = rebase({
      baseline: invoice(line('li-1', 'Desk')),
      values: invoice(line('li-1', 'Desk', 2)),
      incoming: invoice(line('li-1', 'Desk', 3)),
      isEqual,
      itemLabel,
    });
    expect(out.conflicts.map((c) => [c.path, c.label])).toEqual([['lineItems.0', 'Line items > Desk']]);
    expect(itemLabel).toHaveBeenCalledExactlyOnceWith('lineItems', out.values.lineItems[0], ctx('lineItems.0', 0, 'values', true));
  });

  it('nested arrays: both item segments named, one call per array path, isLastSegment false for both', () => {
    const itemLabel = vi.fn(byName);
    const taxes = (rate: number): Tax[] => [
      { code: 'VAT', rate: 22 },
      { code: 'ECO', rate },
    ];
    const out = rebase({
      baseline: invoice(line('li-1', 'Desk'), line('li-2', 'Chair', 1, { taxes: taxes(1) })),
      values: invoice(line('li-1', 'Desk'), line('li-2', 'Chair', 1, { taxes: taxes(2) })),
      incoming: invoice(line('li-1', 'Desk'), line('li-2', 'Chair', 1, { taxes: taxes(3) })),
      itemLabel,
    });
    expect(out.conflicts.map((c) => [c.path, c.label])).toEqual([['lineItems.1.taxes.1.rate', 'Line items > Chair > Taxes > Tax ECO > Rate']]);
    // The order of the calls is not part of the contract: compared as a set.
    expect(itemLabel).toHaveBeenCalledTimes(2);
    expect(itemLabel.mock.calls).toEqual(
      expect.arrayContaining([
        ['lineItems', out.values.lineItems[1], ctx('lineItems.1', 1, 'values', false)],
        ['lineItems.taxes', out.values.lineItems[1]!.taxes![1], ctx('lineItems.1.taxes.1', 1, 'values', false)],
      ]),
    );
  });

  it('labels still name the array and the fields; the default label without an answer', () => {
    const out = rebase({
      baseline: invoice(line('li-1', 'Desk'), line('li-2', 'Chair')),
      values: invoice(line('li-1', 'Desk', 4), line('li-2', 'Chair', 4)),
      incoming: invoice(line('li-1', 'Desk', 5), line('li-2', 'Chair', 5)),
      itemLabel: (_path, item) => ((item as Line).id === 'li-1' ? undefined : '   '),
    });
    expect(out.conflicts.map((c) => c.label)).toEqual(['Line items > Item 1 > Quantity', 'Line items > Item 2 > Quantity']);
  });
});

describe('computeRebase: itemLabel on applied (#534)', () => {
  it('a row removed by the server and not touched (applied removed): the item of the previous baseline, its index there', () => {
    const itemLabel = vi.fn(byName);
    const baseline = invoice(line('li-1', 'Desk'), line('li-2', 'Chair'), line('li-3', 'Lamp'));
    const out = rebase({
      baseline,
      // The user touched the array (li-3), so the merge goes item by item.
      values: invoice(line('li-1', 'Desk'), line('li-2', 'Chair'), line('li-3', 'Lamp', 9)),
      incoming: invoice(line('li-1', 'Desk'), line('li-3', 'Lamp')),
      itemLabel,
    });
    expect(out.applied.map((e) => [e.path, e.kind, e.labelPath, e.label])).toEqual([
      ['lineItems.1', 'removed', ['Line items', 'Chair'], 'Line items > Chair'],
    ]);
    expect(itemLabel).toHaveBeenCalledExactlyOnceWith('lineItems', baseline.lineItems[1], ctx('lineItems.1', 1, 'baseline', true));
    expect(itemLabel.mock.calls[0]![1]).toBe(baseline.lineItems[1]);
  });

  it('a field the server changed in a row the user touched elsewhere: named with the merged row', () => {
    const itemLabel = vi.fn(byName);
    const out = rebase({
      baseline: invoice(line('li-1', 'Desk', 1, { price: 10 })),
      values: invoice(line('li-1', 'Desk', 2, { price: 10 })),
      incoming: invoice(line('li-1', 'Big desk', 1, { price: 12 })),
      itemLabel,
    });
    expect(out.conflicts).toEqual([]);
    expect(out.values.lineItems[0]).toEqual(line('li-1', 'Big desk', 2, { price: 12 }));
    expect(out.applied.map((e) => e.label)).toEqual(['Line items > Big desk > Name', 'Line items > Big desk > Price']);
    // One row, one position: asked once for both entries.
    expect(itemLabel).toHaveBeenCalledExactlyOnceWith('lineItems', out.values.lineItems[0], ctx('lineItems.0', 0, 'values', false));
  });

  it('an array the user did not touch: the entries of the server, with the incoming items (the result itself)', () => {
    const itemLabel = vi.fn(byName);
    const incoming = invoice(line('li-2', 'Chair', 3), line('li-3', 'Lamp'));
    const baseline = invoice(line('li-1', 'Desk'), line('li-2', 'Chair'));
    const out = rebase({ baseline, values: { ...baseline, number: 'A-2' }, incoming, itemLabel });
    expect(out.values.lineItems).toBe(incoming.lineItems);
    expect(out.applied.map((e) => [e.path, e.kind, e.label])).toEqual([
      ['lineItems.0.qty', 'changed', 'Line items > Chair > Quantity'],
      ['lineItems.1', 'added', 'Line items > Lamp'],
      ['lineItems.0', 'removed', 'Line items > Desk'],
    ]);
    expect(itemLabel.mock.calls).toEqual([
      ['lineItems', incoming.lineItems[0], ctx('lineItems.0', 0, 'values', false)],
      ['lineItems', incoming.lineItems[1], ctx('lineItems.1', 1, 'values', true)],
      ['lineItems', baseline.lineItems[0], ctx('lineItems.0', 0, 'baseline', true)],
    ]);
  });

  it('applied and a conflict inside the same row: one call (the same node of this rebase)', () => {
    const itemLabel = vi.fn(byName);
    const out = rebase({
      baseline: invoice(line('li-1', 'Desk', 1, { price: 10 })),
      values: invoice(line('li-1', 'Desk', 2, { price: 10 })),
      incoming: invoice(line('li-1', 'Desk', 3, { price: 12 })),
      itemLabel,
    });
    expect(out.applied.map((e) => e.label)).toEqual(['Line items > Desk > Price']);
    expect(out.conflicts.map((c) => c.label)).toEqual(['Line items > Desk > Quantity']);
    expect(itemLabel).toHaveBeenCalledTimes(1);
  });
});

describe('computeRebase: itemLabel is lazy (#534)', () => {
  const rows = (count: number, change?: (index: number, row: Line) => Line): Line[] =>
    Array.from({ length: count }, (_, i) => {
      const row = line(`li-${i}`, `Row ${i}`, 1, { price: 10 });
      return change ? change(i, row) : row;
    });

  it('1 000 rows, one conflict and one applied field: called only for the two rows of the labels, never in the decision probes', () => {
    const itemLabel = vi.fn(byName);
    const baseline = invoice(...rows(1000));
    const out = rebase({
      baseline,
      values: invoice(...rows(1000, (i, row) => (i === 500 ? { ...row, qty: 5 } : row))),
      incoming: invoice(...rows(1000, (i, row) => (i === 500 ? { ...row, qty: 6 } : i === 10 ? { ...row, price: 11 } : row))),
      itemLabel,
    });
    expect(out.conflicts.map((c) => c.label)).toEqual(['Line items > Row 500 > Quantity']);
    expect(out.applied.map((e) => e.label)).toEqual(['Line items > Row 10 > Price']);
    expect(itemLabel.mock.calls.map((call) => call[2].path).sort()).toEqual(['lineItems.10', 'lineItems.500']);
  });

  it('nothing to label: zero calls (clean form, incoming equal to the baseline, a block array)', () => {
    const itemLabel = vi.fn(byName);
    const baseline = invoice(...rows(50));
    rebase({ baseline, values: baseline, incoming: invoice(...rows(50, (i, row) => (i === 3 ? { ...row, qty: 2 } : row))), itemLabel: vi.fn(byName) });
    rebase({ baseline, values: invoice(...rows(50, (i, row) => (i === 3 ? { ...row, qty: 2 } : row))), incoming: baseline, itemLabel });
    // Without an id key the array is one block: no item segment at all.
    const block = computeRebase<Invoice>({
      baseline,
      values: invoice(...rows(50, (i, row) => (i === 1 ? { ...row, qty: 2 } : row))),
      incoming: invoice(...rows(50, (i, row) => (i === 2 ? { ...row, qty: 2 } : row))),
      itemLabel,
    });
    expect(block.conflicts.map((c) => c.label)).toEqual(['Line Items']);
    expect(itemLabel).not.toHaveBeenCalled();
  });
});

describe('computeRebase: itemLabel answers (#534)', () => {
  const conflictOn = (itemLabel: ItemLabelFn) =>
    rebase({
      baseline: invoice(line('li-1', 'Desk')),
      values: invoice(line('li-1', 'Desk', 2)),
      incoming: invoice(line('li-1', 'Desk', 3)),
      itemLabel,
    }).conflicts.map((c) => c.label);

  it('a non-string answer: the default label and one development warning that names computeRebase', () => {
    const notAString = (() => 7) as unknown as ItemLabelFn;
    expect(conflictOn(notAString)).toEqual(['Line items > Item 1 > Quantity']);
    expect(conflictOn(notAString)).toEqual(['Line items > Item 1 > Quantity']);
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
      "[formrail/pro] computeRebase: itemLabel returned a non-string for 'lineItems'; the default label is used.",
    ]);
  });

  it('a non-blank string as it is (no trimming)', () => {
    expect(conflictOn(() => ' Desk ')).toEqual(['Line items >  Desk  > Quantity']);
  });

  it('an exception thrown by itemLabel reaches the caller', () => {
    const boom = new Error('boom');
    expect(() =>
      conflictOn(() => {
        throw boom;
      }),
    ).toThrow(boom);
  });

  it('without itemLabel: the default labels (Item N)', () => {
    const out = computeRebase<Invoice>({
      arrayIdKeys: IDS,
      labels: LABELS,
      baseline: invoice(line('li-1', 'Desk'), line('li-2', 'Chair')),
      values: invoice(line('li-2', 'Chair', 4)),
      incoming: invoice(line('li-1', 'Desk', 3), line('li-2', 'Chair', 5)),
    });
    expect(out.conflicts.map((c) => [c.path, c.label])).toEqual([
      ['lineItems.0.qty', 'Line items > Item 1 > Quantity'],
      ['lineItems.0', 'Line items > Item 1'],
    ]);
  });

  it('the same inputs give the same labels on every call (nodes of one computation only)', () => {
    let name = 'Desk';
    const itemLabel: ItemLabelFn = () => name;
    const options = {
      baseline: invoice(line('li-1', 'Desk')),
      values: invoice(line('li-1', 'Desk', 2)),
      incoming: invoice(line('li-1', 'Desk', 3)),
      itemLabel,
    };
    expect(rebase(options).conflicts.map((c) => c.label)).toEqual(['Line items > Desk > Quantity']);
    name = 'Table';
    expect(rebase(options).conflicts.map((c) => c.label)).toEqual(['Line items > Table > Quantity']);
  });
});
