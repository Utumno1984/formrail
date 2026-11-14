// Ticket #424: `itemLabel` (a label for the array-item segments, given while the engine holds the item) and
// `reorders` (the id-keyed arrays whose relative order changed, without any synthetic entry), from
// `computeChangeSummaryResult`.
import type { MockInstance } from 'vitest';
import { Differ, ROOT } from '../internal/structural-diff';
import { computeChangeSummary, computeChangeSummaryResult, resetChangeSummaryWarnings } from './compute-change-summary';
import type { ChangeSummaryOptions, ItemLabelContext } from './types';

type Loose = Record<string, unknown>;
type Rest = Omit<ChangeSummaryOptions<Loose>, 'values' | 'baseline'>;

const result = (baseline: unknown, values: unknown, rest: Rest = {}) =>
  computeChangeSummaryResult<Loose>({ baseline: baseline as Loose, values: values as Loose, ...rest });

const labels = (baseline: unknown, values: unknown, rest: Rest = {}) => result(baseline, values, rest).entries.map((e) => e.label);
const reorderPaths = (baseline: unknown, values: unknown, rest: Rest = {}) => result(baseline, values, rest).reorders.map((r) => r.path);

type ItemLabelFn = NonNullable<ChangeSummaryOptions<Loose>['itemLabel']>;

/** An `itemLabel` spy naming an object item by its `name` field. */
const byName = () =>
  vi.fn<ItemLabelFn>((_arrayPath, item, { defaultLabel }) => {
    const name = (item as { name?: unknown } | null)?.name;
    return typeof name === 'string' ? `${defaultLabel} (${name})` : undefined;
  });

const IDS = { lineItems: 'id' };
const NESTED_IDS = { lineItems: 'id', 'lineItems.taxes': 'code' };

const row = (id: number, name: string, price = 10, taxes: unknown[] = []) => ({ id, name, price, taxes });
const tax = (code: string, rate = 22) => ({ code, rate });

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  resetChangeSummaryWarnings();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  vi.unstubAllEnvs();
});

describe('compatibility: computeChangeSummary is the entries of computeChangeSummaryResult', () => {
  const cyclic = (): Loose => {
    const o: Loose = { name: 'loop', list: [{ id: 1 }, { id: 2 }] };
    o.self = o;
    return o;
  };
  const deep = (depth: number, leaf: unknown): Loose => {
    let node: Loose = { leaf };
    for (let i = 0; i < depth; i += 1) node = { next: node };
    return node;
  };
  const FIXTURES: [string, unknown, unknown, Rest][] = [
    ['scalars and missing keys', { a: 1, b: null, c: '' }, { a: 2, c: undefined, d: 'x' }, {}],
    ['nested objects with labels', { supplier: { vat: '1' } }, { supplier: { vat: '2' } }, { labels: { 'supplier.vat': 'VAT' } }],
    ['block array (no id key)', { lineItems: [row(1, 'Desk'), row(2, 'Chair')] }, { lineItems: [row(2, 'Chair'), row(1, 'Desk')] }, {}],
    [
      'id key: reorder + change + added + removed',
      { lineItems: [row(1, 'Desk'), row(2, 'Chair'), row(3, 'Lamp')] },
      { lineItems: [row(3, 'Lamp', 12), row(2, 'Chair'), row(4, 'Cable')] },
      { arrayIdKeys: IDS },
    ],
    [
      'nested id keys',
      { lineItems: [row(1, 'Desk', 10, [tax('A'), tax('B')])] },
      { lineItems: [row(1, 'Desk', 10, [tax('B', 4), tax('A')])] },
      { arrayIdKeys: NESTED_IDS },
    ],
    ['absent against an id-keyed array', {}, { lineItems: [row(1, 'Desk')] }, { arrayIdKeys: IDS }],
    ['items without id and primitives', { lineItems: [{ name: 'x' }, 5] }, { lineItems: [{ name: 'x' }, 5] }, { arrayIdKeys: IDS }],
    ['0 against -0 ids', { lineItems: [{ id: 0 }] }, { lineItems: [{ id: -0 }] }, { arrayIdKeys: IDS }],
    ['duplicate ids', { lineItems: [{ id: 1 }, { id: 1 }] }, { lineItems: [{ id: 1 }] }, { arrayIdKeys: IDS }],
    ['cycles', cyclic(), { ...cyclic(), name: 'other' }, { arrayIdKeys: { list: 'id' } }],
    ['isEqual on paths', { a: 1, lineItems: [row(1, 'Desk')] }, { a: 2, lineItems: [row(1, 'Desk', 11)] }, { arrayIdKeys: IDS, isEqual: (_a, _b, p) => (p === 'a' ? true : undefined) }],
    ['deep structure', deep(2000, 1), deep(2000, 2), {}],
  ];

  it.each(FIXTURES)('%s', (_name, baseline, values, rest) => {
    const entries = computeChangeSummary<Loose>({ baseline: baseline as Loose, values: values as Loose, ...rest });
    expect(entries).toEqual(result(baseline, values, rest).entries);
    expect(entries).toEqual(result(baseline, values, { ...rest, itemLabel: () => undefined }).entries);
  });

  it('values === baseline: two empty lists', () => {
    const same = { lineItems: [row(1, 'Desk')] };
    expect(result(same, same, { arrayIdKeys: IDS })).toEqual({ entries: [], reorders: [] });
  });
});

describe('itemLabel', () => {
  it('names the item segment of a matched row, called with the values item and its context', () => {
    const itemLabel = vi.fn<ItemLabelFn>(() => 'Item 2 (Chair)');
    const baseline = { lineItems: [row(1, 'Desk'), row(2, 'Chair', 40)] };
    const values = { lineItems: [row(1, 'Desk'), row(2, 'Chair', 45)] };
    const [entry] = result(baseline, values, { arrayIdKeys: IDS, itemLabel }).entries;
    expect(entry?.labelPath).toEqual(['Line Items', 'Item 2 (Chair)', 'Price']);
    expect(entry?.label).toBe(entry?.labelPath.join(' > '));
    expect(itemLabel).toHaveBeenCalledTimes(1);
    expect(itemLabel).toHaveBeenCalledWith('lineItems', values.lineItems[1], {
      path: 'lineItems.1',
      index: 1,
      side: 'values',
      isLastSegment: false,
      defaultLabel: 'Item 2',
    } satisfies ItemLabelContext);
    expect(itemLabel.mock.calls[0]?.[1]).toBe(values.lineItems[1]);
  });

  it('a removed row gets the baseline item, its baseline index and isLastSegment; an added row the values side', () => {
    const itemLabel = byName();
    const baseline = { lineItems: [row(1, 'Desk'), row(2, 'Chair')] };
    const values = { lineItems: [row(2, 'Chair'), row(3, 'Lamp')] };
    expect(labels(baseline, values, { arrayIdKeys: IDS, itemLabel })).toEqual(['Line Items > Item 2 (Lamp)', 'Line Items > Item 1 (Desk)']);
    expect(itemLabel.mock.calls).toEqual([
      ['lineItems', values.lineItems[1], { path: 'lineItems.1', index: 1, side: 'values', isLastSegment: true, defaultLabel: 'Item 2' }],
      ['lineItems', baseline.lineItems[0], { path: 'lineItems.0', index: 0, side: 'baseline', isLastSegment: true, defaultLabel: 'Item 1' }],
    ]);
    expect(itemLabel.mock.calls[1]?.[1]).toBe(baseline.lineItems[0]);
  });

  it('a removed row and a changed row that would both read "Item 1" are told apart', () => {
    const baseline = { lineItems: [row(1, 'Desk'), row(2, 'Chair', 40)] };
    const values = { lineItems: [row(2, 'Chair', 45)] };
    expect(labels(baseline, values, { arrayIdKeys: IDS })).toEqual(['Line Items > Item 1 > Price', 'Line Items > Item 1']);
    expect(labels(baseline, values, { arrayIdKeys: IDS, itemLabel: byName() })).toEqual([
      'Line Items > Item 1 (Chair) > Price',
      'Line Items > Item 1 (Desk)',
    ]);
  });

  it('the name the user edited is read on the values side', () => {
    const baseline = { lineItems: [row(1, 'Desk', 10)] };
    const values = { lineItems: [row(1, 'Standing desk', 12)] };
    expect(labels(baseline, values, { arrayIdKeys: IDS, itemLabel: byName() })).toEqual([
      'Line Items > Item 1 (Standing desk) > Name',
      'Line Items > Item 1 (Standing desk) > Price',
    ]);
  });

  it('nested arrays: one call per array path, both item segments replaced', () => {
    const itemLabel = vi.fn<ItemLabelFn>((arrayPath, item) =>
      arrayPath === 'lineItems' ? `Row ${(item as { name: string }).name}` : `Tax ${(item as { code: string }).code}`,
    );
    const baseline = { lineItems: [row(1, 'Desk'), row(2, 'Chair', 10, [tax('VAT'), tax('ECO', 1)])] };
    const values = { lineItems: [row(1, 'Desk'), row(2, 'Chair', 10, [tax('VAT', 10), tax('ECO', 1)])] };
    const [entry] = result(baseline, values, { arrayIdKeys: NESTED_IDS, itemLabel }).entries;
    expect(entry?.path).toBe('lineItems.1.taxes.0.rate');
    expect(entry?.labelPath).toEqual(['Line Items', 'Row Chair', 'Taxes', 'Tax VAT', 'Rate']);
    expect(itemLabel.mock.calls.map(([arrayPath, , context]) => [arrayPath, context.path, context.isLastSegment])).toEqual([
      ['lineItems.taxes', 'lineItems.1.taxes.0', false],
      ['lineItems', 'lineItems.1', false],
    ]);
  });

  it.each([undefined, '', '   ', '\n\t'])('returning %j keeps the default label, without warning', (returned) => {
    const baseline = { lineItems: [row(1, 'Desk')] };
    const values = { lineItems: [row(1, 'Desk', 11)] };
    expect(labels(baseline, values, { arrayIdKeys: IDS, itemLabel: () => returned })).toEqual(['Line Items > Item 1 > Price']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a non-blank string is used as it is (no trimming)', () => {
    const baseline = { lineItems: [row(1, 'Desk')] };
    const values = { lineItems: [row(1, 'Desk', 11)] };
    expect(labels(baseline, values, { arrayIdKeys: IDS, itemLabel: () => ' Desk ' })).toEqual(['Line Items >  Desk  > Price']);
  });

  it.each([null, 0, 42, {}, ['x'], true])('returning %j at runtime keeps the default label, with one development warning per array path', (returned) => {
    const itemLabel = (() => returned) as unknown as ItemLabelFn;
    const baseline = { lineItems: [row(1, 'Desk'), row(2, 'Chair')], other: [row(1, 'Desk')] };
    const values = { lineItems: [row(1, 'Desk', 11), row(2, 'Chair', 12)], other: [row(1, 'Desk', 13)] };
    expect(labels(baseline, values, { arrayIdKeys: { lineItems: 'id', other: 'id' }, itemLabel })).toEqual([
      'Line Items > Item 1 > Price',
      'Line Items > Item 2 > Price',
      'Other > Item 1 > Price',
    ]);
    // A second computation does not warn again (deduplicated like the other warnings of the engine).
    result(baseline, values, { arrayIdKeys: { lineItems: 'id', other: 'id' }, itemLabel });
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
      "[formrail/pro] useChangeSummary: itemLabel returned a non-string for 'lineItems'; the default label is used.",
      "[formrail/pro] useChangeSummary: itemLabel returned a non-string for 'other'; the default label is used.",
    ]);
  });

  it('no warning in production for a non-string label', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const baseline = { lineItems: [row(1, 'Desk')] };
    const values = { lineItems: [row(1, 'Desk', 11)] };
    expect(labels(baseline, values, { arrayIdKeys: IDS, itemLabel: (() => 7) as unknown as ItemLabelFn })).toEqual([
      'Line Items > Item 1 > Price',
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('an exception thrown by itemLabel reaches the caller', () => {
    const boom = new Error('boom');
    const itemLabel = () => {
      throw boom;
    };
    const baseline = { lineItems: [row(1, 'Desk')] };
    const values = { lineItems: [row(1, 'Desk', 11)] };
    expect(() => result(baseline, values, { arrayIdKeys: IDS, itemLabel })).toThrow(boom);
    expect(() => computeChangeSummary<Loose>({ baseline, values, arrayIdKeys: IDS, itemLabel })).toThrow(boom);
  });

  it('items without id or not objects under an id key: the raw item, nothing else changes', () => {
    const itemLabel = vi.fn<ItemLabelFn>(() => undefined);
    const baseline = { lineItems: [{ name: 'no id' }, 5] };
    const values = { lineItems: [7, { id: null, name: 'null id' }] };
    const withLabel = result(baseline, values, { arrayIdKeys: IDS, itemLabel }).entries;
    expect(withLabel).toEqual(result(baseline, values, { arrayIdKeys: IDS }).entries);
    expect(itemLabel.mock.calls.map(([, item, context]) => [item, context.side, context.index])).toEqual([
      [7, 'values', 0],
      [values.lineItems[1], 'values', 1],
      [baseline.lineItems[0], 'baseline', 0],
      [5, 'baseline', 1],
    ]);
  });

  it('labels names the array segment and the item fields, itemLabel only the item segments', () => {
    const baseline = { lineItems: [row(1, 'Desk')] };
    const values = { lineItems: [row(1, 'Desk', 11)] };
    expect(
      labels(baseline, values, {
        arrayIdKeys: IDS,
        labels: { lineItems: 'Lines', 'lineItems.price': 'Unit price' },
        itemLabel: byName(),
      }),
    ).toEqual(['Lines > Item 1 (Desk) > Unit price']);
  });

  it('works on an array diffed as a block too (an atomic item entry under isEqual)', () => {
    const itemLabel = byName();
    const baseline = { list: [{ name: 'a', v: 1 }] };
    const values = { list: [{ name: 'a', v: 2 }] };
    // Without id key the array is one block entry: no item segment, no call.
    expect(labels(baseline, values, { itemLabel })).toEqual(['List']);
    expect(itemLabel).not.toHaveBeenCalled();
  });
});

describe('itemLabel is lazy', () => {
  it('1 000 matched rows with one changed field: exactly one call', () => {
    const itemLabel = byName();
    const baseline = { lineItems: Array.from({ length: 1000 }, (_, i) => row(i, `Row ${i}`)) };
    const values = { lineItems: baseline.lineItems.map((r, i) => (i === 500 ? { ...r, price: 99 } : r)) };
    expect(labels(baseline, values, { arrayIdKeys: IDS, itemLabel })).toEqual(['Line Items > Item 501 (Row 500) > Price']);
    expect(itemLabel).toHaveBeenCalledTimes(1);
  });

  it('values === baseline, two equal arrays, a pure top-level reorder: zero calls', () => {
    const itemLabel = byName();
    const rows = [row(1, 'Desk'), row(2, 'Chair')];
    result({ lineItems: rows }, { lineItems: rows }, { arrayIdKeys: IDS, itemLabel });
    const same = { lineItems: rows };
    result(same, same, { arrayIdKeys: IDS, itemLabel });
    result({ lineItems: rows }, { lineItems: rows.map((r) => ({ ...r })) }, { arrayIdKeys: IDS, itemLabel });
    result({ lineItems: rows }, { lineItems: rows.map((r) => ({ ...r })) }, { itemLabel });
    const reordered = result({ lineItems: rows }, { lineItems: [rows[1], rows[0]] }, { arrayIdKeys: IDS, itemLabel });
    expect(reordered.reorders).toHaveLength(1);
    expect(itemLabel).not.toHaveBeenCalled();
  });

  it('a row with five changed fields: one call (at most one per item and isLastSegment)', () => {
    const itemLabel = byName();
    const baseline = { lineItems: [{ id: 1, name: 'Desk', a: 1, b: 1, c: 1, d: 1, e: 1 }] };
    const values = { lineItems: [{ id: 1, name: 'Desk', a: 2, b: 2, c: 2, d: 2, e: 2 }] };
    expect(labels(baseline, values, { arrayIdKeys: IDS, itemLabel })).toHaveLength(5);
    expect(itemLabel).toHaveBeenCalledTimes(1);
  });

  it('the item enclosing an entry and a reorder is labeled once', () => {
    const itemLabel = byName();
    const baseline = { lineItems: [row(1, 'Desk', 10, [tax('A'), tax('B')])] };
    const values = { lineItems: [row(1, 'Desk', 11, [tax('B'), tax('A')])] };
    const out = result(baseline, values, { arrayIdKeys: NESTED_IDS, itemLabel });
    expect(out.entries.map((e) => e.label)).toEqual(['Line Items > Item 1 (Desk) > Price']);
    expect(out.reorders.map((r) => r.label)).toEqual(['Line Items > Item 1 (Desk) > Taxes']);
    expect(itemLabel).toHaveBeenCalledTimes(1);
  });

  it('one item as a whole entry and as an enclosing segment: one call per position', () => {
    // isEqual settles an item atomically (isLastSegment true); its sibling only encloses an entry.
    const itemLabel = byName();
    const baseline = { lineItems: [row(1, 'Desk'), row(2, 'Chair')] };
    const values = { lineItems: [row(1, 'Desk', 11), row(2, 'Chair', 12)] };
    const isEqual = (_a: unknown, _b: unknown, path: string) => (path === 'lineItems.0' ? false : undefined);
    expect(labels(baseline, values, { arrayIdKeys: IDS, itemLabel, isEqual })).toEqual([
      'Line Items > Item 1 (Desk)',
      'Line Items > Item 2 (Chair) > Price',
    ]);
    expect(itemLabel.mock.calls.map(([, , c]) => [c.path, c.isLastSegment])).toEqual([
      ['lineItems.0', true],
      ['lineItems.1', false],
    ]);
  });

  it('Differ.labelPath: one call per item AND position, each position with its own answer', () => {
    // Inside one summary a node is either the last segment or an ancestor, never both; Form Rebase (#534) labels a
    // node as a conflict and its descendants as applied entries, so the cache keeps one answer per position.
    const itemLabel = vi.fn<ItemLabelFn>((_p, _item, { defaultLabel, isLastSegment }) => `${defaultLabel}${isLastSegment ? ' (whole)' : ' (part)'}`);
    const differ = new Differ({ itemLabel, source: 'test' });
    const item = { name: 'Desk' };
    const array = differ.keyChild(ROOT, 'lineItems');
    const node = differ.indexChild(array, 0, item);
    const field = differ.keyChild(node, 'price');
    expect(differ.labelPath(node)).toEqual(['Line Items', 'Item 1 (whole)']);
    expect(differ.labelPath(field)).toEqual(['Line Items', 'Item 1 (part)', 'Price']);
    expect(differ.labelPath(node)).toEqual(['Line Items', 'Item 1 (whole)']);
    expect(differ.labelPath(field)).toEqual(['Line Items', 'Item 1 (part)', 'Price']);
    expect(itemLabel.mock.calls.map(([, , c]) => c.isLastSegment)).toEqual([true, false]);
  });

  it('never called by the internal probes: Differ.differs and the block comparison', () => {
    const itemLabel = byName();
    const baseline = { lineItems: [row(1, 'Desk', 10, [tax('A')])] };
    const values = { lineItems: [row(1, 'Desk', 11, [tax('A', 1)])] };
    const differ = new Differ({ arrayIdKeys: NESTED_IDS, itemLabel, source: 'test' });
    expect(differ.differs(baseline, values)).toBe(true);
    // A block (no id key) of items that differ deep inside: one entry on the block, nothing labeled.
    expect(labels({ grid: [baseline] }, { grid: [values] }, { arrayIdKeys: { 'grid.lineItems': 'id' }, itemLabel })).toEqual(['Grid']);
    expect(itemLabel).not.toHaveBeenCalled();
  });
});

describe('reorders', () => {
  const D = row(1, 'Desk');
  const C = row(2, 'Chair');
  const L = row(3, 'Lamp');

  it('a pure reorder: no entry, one reorder', () => {
    expect(result({ lineItems: [D, C] }, { lineItems: [C, D] }, { arrayIdKeys: IDS })).toEqual({
      entries: [],
      reorders: [{ path: 'lineItems', labelPath: ['Line Items'], label: 'Line Items' }],
    });
  });

  it('a reorder plus a changed field: the entry and the reorder', () => {
    const out = result({ lineItems: [D, C] }, { lineItems: [{ ...C, price: 5 }, D] }, { arrayIdKeys: IDS });
    expect(out.entries.map((e) => `${e.kind} ${e.path}`)).toEqual(['changed lineItems.0.price']);
    expect(out.reorders.map((r) => r.path)).toEqual(['lineItems']);
  });

  it('a new first row, or the first row removed, is not a reorder', () => {
    const N = row(9, 'New');
    expect(reorderPaths({ lineItems: [D, C, L] }, { lineItems: [N, D, C, L] }, { arrayIdKeys: IDS })).toEqual([]);
    expect(reorderPaths({ lineItems: [D, C, L] }, { lineItems: [C, L] }, { arrayIdKeys: IDS })).toEqual([]);
    expect(reorderPaths({ lineItems: [D, C, L] }, { lineItems: [N, C, L] }, { arrayIdKeys: IDS })).toEqual([]);
    // A new last row; then the rows left reordered after a removal (a real reorder).
    expect(reorderPaths({ lineItems: [D, C, L] }, { lineItems: [D, C, L, N] }, { arrayIdKeys: IDS })).toEqual([]);
    expect(reorderPaths({ lineItems: [D, C, L] }, { lineItems: [L, C] }, { arrayIdKeys: IDS })).toEqual(['lineItems']);
  });

  it('a nested reorder inside the matched row at values index 1, with itemLabel on the row segment', () => {
    const itemLabel = byName();
    const baseline = { lineItems: [row(1, 'Desk'), row(2, 'Chair', 10, [tax('A'), tax('B')])] };
    const values = { lineItems: [row(1, 'Desk'), row(2, 'Chair', 10, [tax('B'), tax('A')])] };
    expect(result(baseline, values, { arrayIdKeys: NESTED_IDS, itemLabel })).toEqual({
      entries: [],
      reorders: [{ path: 'lineItems.1.taxes', labelPath: ['Line Items', 'Item 2 (Chair)', 'Taxes'], label: 'Line Items > Item 2 (Chair) > Taxes' }],
    });
    expect(itemLabel).toHaveBeenCalledWith('lineItems', values.lineItems[1], {
      path: 'lineItems.1',
      index: 1,
      side: 'values',
      isLastSegment: false,
      defaultLabel: 'Item 2',
    });
  });

  it('a reorder inside an added or removed row is not reported (that subtree is not visited)', () => {
    const inside = (taxes: unknown[]) => row(5, 'Cable', 10, taxes);
    expect(reorderPaths({ lineItems: [D] }, { lineItems: [D, inside([tax('B'), tax('A')])] }, { arrayIdKeys: NESTED_IDS })).toEqual([]);
    expect(reorderPaths({ lineItems: [D, inside([tax('A'), tax('B')])] }, { lineItems: [D] }, { arrayIdKeys: NESTED_IDS })).toEqual([]);
  });

  it('an array without id key: the one block entry of today, no reorder; duplicate ids: no reorder', () => {
    const out = result({ lineItems: [D, C] }, { lineItems: [C, D] });
    expect(out.entries.map((e) => `${e.kind} ${e.path}`)).toEqual(['changed lineItems']);
    expect(out.reorders).toEqual([]);
    const dup = result({ lineItems: [D, C, { ...C }] }, { lineItems: [C, { ...C }, D] }, { arrayIdKeys: IDS });
    expect(dup.entries.map((e) => `${e.kind} ${e.path}`)).toEqual(['changed lineItems']);
    expect(dup.reorders).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('isEqual on the array path (true or false) hides the reorder; on the items it does not', () => {
    const onArray = (verdict: boolean) => (_a: unknown, _b: unknown, path: string) => (path === 'lineItems' ? verdict : undefined);
    expect(reorderPaths({ lineItems: [D, C] }, { lineItems: [C, D] }, { arrayIdKeys: IDS, isEqual: onArray(true) })).toEqual([]);
    const settled = result({ lineItems: [D, C] }, { lineItems: [C, D] }, { arrayIdKeys: IDS, isEqual: onArray(false) });
    expect(settled.reorders).toEqual([]);
    expect(settled.entries.map((e) => `${e.kind} ${e.path}`)).toEqual(['changed lineItems']);
    const onItems = (_a: unknown, _b: unknown, path: string) => (/^lineItems\.\d+$/.test(path) ? true : undefined);
    expect(
      result({ lineItems: [D, C] }, { lineItems: [{ ...C, price: 1 }, D] }, { arrayIdKeys: IDS, isEqual: onItems }),
    ).toEqual({ entries: [], reorders: [{ path: 'lineItems', labelPath: ['Line Items'], label: 'Line Items' }] });
  });

  it('an Absent side against a non-empty id-keyed array, or values === baseline: no reorder', () => {
    expect(reorderPaths({}, { lineItems: [C, D] }, { arrayIdKeys: IDS })).toEqual([]);
    expect(reorderPaths({ lineItems: [C, D] }, { lineItems: null }, { arrayIdKeys: IDS })).toEqual([]);
    const same = { lineItems: [C, D] };
    expect(reorderPaths(same, same, { arrayIdKeys: IDS })).toEqual([]);
  });

  it('follows the depth-first visit: the parent array first, then its rows in values order, then later keys', () => {
    const baseline = {
      lineItems: [row(1, 'Desk', 10, [tax('A'), tax('B')]), row(2, 'Chair', 10, [tax('C'), tax('D')])],
      other: [D, C],
    };
    const values = {
      other: [C, D],
      lineItems: [row(2, 'Chair', 10, [tax('D'), tax('C')]), row(1, 'Desk', 10, [tax('B'), tax('A')])],
    };
    expect(reorderPaths(baseline, values, { arrayIdKeys: { ...NESTED_IDS, other: 'id' } })).toEqual([
      'other',
      'lineItems',
      'lineItems.0.taxes',
      'lineItems.1.taxes',
    ]);
  });

  it('terminates on a circular structure with reorders', () => {
    const make = (order: number[]) => {
      const o: Loose = {};
      o.list = order.map((id) => ({ id, parent: o }));
      return o;
    };
    expect(reorderPaths(make([1, 2]), make([2, 1]), { arrayIdKeys: { list: 'id' } })).toEqual(['list']);
  });

  it('the rebase Differ (reorderIsChange) is unchanged: the reorder is one changed entry', () => {
    const differ = new Differ({ arrayIdKeys: IDS, source: 'test', reorderIsChange: true });
    const out: ReturnType<typeof computeChangeSummary> = [];
    const reorders: never[] = [];
    differ.run({ lineItems: [D, C] }, { lineItems: [C, D] }, out, undefined, reorders);
    expect(out.map((e) => `${e.kind} ${e.path}`)).toEqual(['changed lineItems']);
    expect(reorders).toEqual([]);
  });
});

// Decision not in the ticket (#424): an id-keyed array inside the items of an array diffed as a block. The block
// visits its positional pairs as a probe; without passing the reorders on, a block that is otherwise equal would
// hide a dirty reorder, and "no entry and no reorder <=> not dirty" would fail.
describe('reorders inside an array diffed as a block', () => {
  const ids = { 'grid.lineItems': 'id' };
  const D = row(1, 'Desk');
  const C = row(2, 'Chair');

  it('an otherwise equal block: the nested reorder is reported, with itemLabel on the block item (values side)', () => {
    const itemLabel = vi.fn<ItemLabelFn>((arrayPath, _item, { defaultLabel }) => (arrayPath === 'grid' ? `${defaultLabel} (page)` : undefined));
    const values = { grid: [{ lineItems: [C, D] }, { lineItems: [] }] };
    const out = result({ grid: [{ lineItems: [D, C] }, { lineItems: [] }] }, values, { arrayIdKeys: ids, itemLabel });
    expect(out).toEqual({
      entries: [],
      reorders: [{ path: 'grid.0.lineItems', labelPath: ['Grid', 'Item 1 (page)', 'Line Items'], label: 'Grid > Item 1 (page) > Line Items' }],
    });
    expect(itemLabel.mock.calls.map(([arrayPath, , c]) => [arrayPath, c.path, c.side, c.isLastSegment])).toEqual([['grid', 'grid.0', 'values', false]]);
    expect(itemLabel.mock.calls[0]?.[1]).toBe(values.grid[0]);
  });

  it('a block with an entry: only the block entry, the nested reorder is dropped', () => {
    const itemLabel = byName();
    const out = result({ grid: [{ lineItems: [D, C] }, { lineItems: [] }] }, { grid: [{ lineItems: [C, D] }, { lineItems: [row(3, 'Lamp')] }] }, {
      arrayIdKeys: ids,
      itemLabel,
    });
    expect(out.entries.map((e) => `${e.kind} ${e.path}`)).toEqual(['changed grid']);
    expect(out.reorders).toEqual([]);
    expect(itemLabel).not.toHaveBeenCalled();
  });

  it('a block with an entry found after the reorder: dropped too', () => {
    const out = result({ grid: [{ lineItems: [D, C], n: 1 }] }, { grid: [{ lineItems: [C, D], n: 2 }] }, { arrayIdKeys: ids });
    expect(out.entries.map((e) => `${e.kind} ${e.path}`)).toEqual(['changed grid']);
    expect(out.reorders).toEqual([]);
  });

  it('blocks nested in blocks pass the reorder up, in visit order with the reorders around them', () => {
    const out = result(
      { first: [D, C], grid: [[{ lineItems: [D, C] }]], last: [D, C] },
      { first: [C, D], grid: [[{ lineItems: [C, D] }]], last: [C, D] },
      { arrayIdKeys: { first: 'id', 'grid.lineItems': 'id', last: 'id' } },
    );
    expect(out.entries).toEqual([]);
    expect(out.reorders.map((r) => r.path)).toEqual(['first', 'grid.0.0.lineItems', 'last']);
  });

  it('Differ.differs never collects them', () => {
    const differ = new Differ({ arrayIdKeys: ids, source: 'test' });
    expect(differ.differs({ grid: [{ lineItems: [D, C] }] }, { grid: [{ lineItems: [C, D] }] })).toBe(false);
  });
});
